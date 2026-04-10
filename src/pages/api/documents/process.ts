/**
 * POST /api/documents/process
 * Accepts: multipart/form-data with fields:
 *   - document: the file (PDF, DOCX, TXT)
 *   - matterId: string
 * Returns: { document, processingResult }
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { extractPdfText } from "@/lib/extraction/pdfExtract";
import { extractText } from "@/lib/parsers/extractText";
import { processDocument } from "@/lib/ai/processDocument";
import { detectDeposition } from "@/lib/ai/detectDeposition";
import { processDeposition } from "@/lib/ai/processDeposition";
import { saveFile } from "@/lib/store/fileStore";
import { db } from "@/lib/db";
import type { Document, ProcessingResult, DepositionAnalysis, Flag } from "@/types";

export const config = { api: { bodyParser: false } };

const DISCLAIMER = "This output is not legal advice and requires attorney review before any action is taken.";

function buildDepositionResult(
  depo: DepositionAnalysis,
  docId: string
): ProcessingResult {
  const now = new Date().toISOString();

  const keyIssues = depo.keyAdmissions.map((a, i) => ({
    id: `admission_${i + 1}`,
    title: a.topic,
    description: a.admission,
    severity: a.significance,
    pageRef: a.pageReference,
  }));

  const extractedFacts = depo.exhibitsReferenced.map((e, i) => ({
    id: `exhibit_${i + 1}`,
    fact: `${e.exhibitNumber}: ${e.description}`,
    category: "other" as const,
    pageRef: e.pageReference,
    confidence: "high" as const,
  }));

  const missingInformation = depo.followUpQuestions.map((q, i) => ({
    id: `followup_${i + 1}`,
    description: q,
    importance: "helpful" as const,
  }));

  // Auto-flags for high-significance admissions
  const flags: Flag[] = depo.keyAdmissions
    .filter((a) => a.significance === "high")
    .map((a) => ({
      id: crypto.randomUUID(),
      documentId: docId,
      type: "key_evidence" as const,
      source: "auto" as const,
      text: `Admission: ${a.admission}`,
      location: a.pageReference || "deposition",
      createdAt: now,
      resolved: false,
    }));

  return {
    id: crypto.randomUUID(),
    documentId: docId,
    summary: depo.summary,
    keyIssues,
    extractedFacts,
    timeline: [],
    missingInformation,
    flags,
    disclaimer: DISCLAIMER,
    processedAt: now,
    depositionAnalysis: depo,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { IncomingForm } = await import("formidable");
    const form = new IncomingForm();

    const { fields, files } = await new Promise<{ fields: Record<string, unknown>; files: Record<string, unknown> }>(
      (resolve, reject) => {
        form.parse(req, (err, fields, files) => {
          if (err) reject(err);
          else resolve({ fields, files });
        });
      }
    );

    const file = Array.isArray(files.document) ? files.document[0] : files.document;
    const matterId = Array.isArray(fields.matterId) ? fields.matterId[0] : fields.matterId;

    if (!file) return res.status(400).json({ error: "No document uploaded" });
    if (!matterId) return res.status(400).json({ error: "matterId is required" });

    const f = file as { originalFilename?: string; filepath: string; size: number };
    const ext = f.originalFilename?.split(".").pop()?.toLowerCase() as "pdf" | "docx" | "txt";
    const docId = crypto.randomUUID();
    const storageKey = `${docId}.${ext}`;
    const fileName = f.originalFilename || "document";

    const { readFileSync } = await import("fs");
    const buffer = readFileSync(f.filepath);
    saveFile(storageKey, buffer);

    // ── Extract text ────────────────────────────────────────────────────────
    await db.updateDocumentStage(docId, "extracting").catch(() => {});

    let text: string;
    let extractionMethod: Document["extractionMethod"];
    let ocrConfidence: number | undefined;

    if (ext === "pdf") {
      const pdfResult = await extractPdfText(buffer);
      text = pdfResult.text;
      extractionMethod = pdfResult.method;
      ocrConfidence = pdfResult.confidence;

      if (pdfResult.warnings.length > 0) {
        console.warn(`[Lexx] PDF extraction warnings for "${fileName}":`, pdfResult.warnings);
      }

      // Hard failure: OCR ran but produced nothing usable
      if (pdfResult.method === "failed") {
        const failedDoc: Document = {
          id: docId,
          matterId: matterId as string,
          fileName,
          fileType: ext,
          fileSize: f.size,
          storageKey,
          status: "error",
          processingStage: "extracting",
          documentKind: "standard",
          extractionMethod: "failed",
          notes: "",
          uploadedAt: new Date().toISOString(),
        };
        await db.saveDocument(failedDoc);
        await db.updateDocumentStatus(docId, "error");
        return res.status(422).json({
          error:
            "Could not extract text from this document. If it is a scanned PDF, the OCR pass failed — please try re-scanning at higher quality.",
        });
      }
    } else {
      text = await extractText(buffer, ext);
      extractionMethod = undefined; // not applicable for DOCX/TXT
    }

    // ── Detect deposition ───────────────────────────────────────────────────
    const isDeposition = detectDeposition(fileName, text.slice(0, 2000));
    const documentKind: "standard" | "deposition" = isDeposition ? "deposition" : "standard";

    const document: Document = {
      id: docId,
      matterId: matterId as string,
      fileName,
      fileType: ext,
      fileSize: f.size,
      storageKey,
      status: "processing",
      processingStage: "uploading",
      documentKind,
      extractionMethod,
      ocrConfidence,
      notes: "",
      uploadedAt: new Date().toISOString(),
    };
    await db.saveDocument(document);

    await db.saveActivity({
      id: crypto.randomUUID(),
      action: "document_uploaded",
      entityName: document.fileName,
      matterId: matterId as string,
      timestamp: new Date().toISOString(),
    });

    await db.updateDocumentStage(docId, "analyzing");

    let result: ProcessingResult;

    if (documentKind === "deposition") {
      console.log(`[Lexx] Detected deposition: ${fileName}`);
      const depoAnalysis = await processDeposition(text, fileName);
      result = buildDepositionResult(depoAnalysis, docId);
    } else {
      result = await processDocument(text, document.fileName);
      result.documentId = docId;

      // Set documentId on auto-promoted flags; dedup against any existing flags on re-process
      const existing = await db.getProcessingResult(docId);
      const existingAutoTexts = new Set((existing?.flags ?? []).filter((f) => f.source === "auto").map((f) => f.text));
      result.flags = [
        ...(existing?.flags ?? []),
        ...result.flags.map((f) => ({ ...f, documentId: docId })).filter((f) => !existingAutoTexts.has(f.text)),
      ];
    }

    await db.saveProcessingResult(result);
    await db.updateDocumentStage(docId, "done");
    await db.updateDocumentStatus(docId, "ready");

    await db.saveActivity({
      id: crypto.randomUUID(),
      action: "document_processed",
      entityName: document.fileName,
      matterId: matterId as string,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json({ document: { ...document, status: "ready" }, processingResult: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Processing failed";
    console.error("[Lexx] Process error:", err);
    return res.status(500).json({ error: message });
  }
}
