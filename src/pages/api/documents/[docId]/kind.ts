/**
 * PATCH /api/documents/[docId]/kind
 * Body: { documentKind: "standard" | "deposition" }
 *
 * Updates the document kind and re-runs the appropriate processing pipeline
 * on the stored file.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/db";
import { readFile } from "@/lib/store/fileStore";
import { extractText } from "@/lib/parsers/extractText";
import { processDocument } from "@/lib/ai/processDocument";
import { processDeposition } from "@/lib/ai/processDeposition";
import type { ProcessingResult, DepositionAnalysis, Flag } from "@/types";

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
  if (req.method !== "PATCH") return res.status(405).end();

  const docId = req.query.docId as string;
  if (!docId) return res.status(400).json({ error: "docId is required" });

  const { documentKind } = req.body as { documentKind?: "standard" | "deposition" };
  if (!documentKind || !["standard", "deposition"].includes(documentKind)) {
    return res.status(400).json({ error: "documentKind must be 'standard' or 'deposition'" });
  }

  const doc = await db.getDocument(docId);
  if (!doc) return res.status(404).json({ error: "Document not found" });

  // Update document kind
  doc.documentKind = documentKind;
  doc.status = "processing";
  doc.processingStage = "extracting";
  await db.saveDocument(doc);

  try {
    const buffer = readFile(doc.storageKey);
    await db.updateDocumentStage(docId, "extracting");
    const text = await extractText(buffer, doc.fileType);
    await db.updateDocumentStage(docId, "analyzing");

    let result: ProcessingResult;

    if (documentKind === "deposition") {
      const depoAnalysis = await processDeposition(text, doc.fileName);
      result = buildDepositionResult(depoAnalysis, docId);
    } else {
      result = await processDocument(text, doc.fileName);
      result.documentId = docId;
      result.flags = result.flags.map((f) => ({ ...f, documentId: docId }));
    }

    await db.saveProcessingResult(result);
    await db.updateDocumentStage(docId, "done");
    await db.updateDocumentStatus(docId, "ready");

    return res.status(200).json({ document: { ...doc, status: "ready", documentKind } });
  } catch (err: unknown) {
    await db.updateDocumentStatus(docId, "error");
    const message = err instanceof Error ? err.message : "Reprocessing failed";
    console.error("[Lexx] Kind reprocess error:", err);
    return res.status(500).json({ error: message });
  }
}
