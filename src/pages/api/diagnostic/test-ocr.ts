/**
 * POST /api/diagnostic/test-ocr
 * Body: multipart/form-data with field "document" (PDF only)
 *
 * Runs extractPdfText on the uploaded file and returns the full ExtractionResult.
 * Used by /diagnostic/ocr-test to validate OCR quality on realistic scanned inputs.
 * Not wired into any document/matter flow.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { extractPdfText } from "@/lib/extraction/pdfExtract";

export const config = { api: { bodyParser: false } };

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { IncomingForm } = await import("formidable");
    const form = new IncomingForm();

    const { files } = await new Promise<{ files: Record<string, unknown> }>((resolve, reject) => {
      form.parse(req, (err, _fields, files) => {
        if (err) reject(err);
        else resolve({ files });
      });
    });

    const file = Array.isArray(files.document) ? files.document[0] : files.document;
    if (!file) return res.status(400).json({ error: "No file uploaded. Use field name 'document'." });

    const f = file as { originalFilename?: string; filepath: string; size: number };

    if (f.size > MAX_FILE_SIZE) {
      return res.status(400).json({ error: "File exceeds 50MB limit." });
    }

    const ext = f.originalFilename?.split(".").pop()?.toLowerCase() ?? "";
    if (ext !== "pdf") {
      return res.status(400).json({ error: "Only PDF files are supported by this diagnostic endpoint." });
    }

    const { readFileSync } = await import("fs");
    const buffer = readFileSync(f.filepath);

    const startMs = Date.now();
    const result = await extractPdfText(buffer);
    const elapsedMs = Date.now() - startMs;

    return res.status(200).json({
      fileName: f.originalFilename ?? "unknown.pdf",
      fileSizeBytes: f.size,
      elapsedMs,
      method: result.method,
      pageCount: result.pageCount,
      confidence: result.confidence ?? null,
      ocrQuality: result.ocrQuality ?? null,
      warnings: result.warnings,
      textLength: result.text.length,
      text: result.text,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";
    console.error("[Lexx:test-ocr]", err);
    return res.status(500).json({ error: message });
  }
}
