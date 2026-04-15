/**
 * Text extraction utilities for Lexx document processing.
 *
 * PDF extraction (including OCR fallback for scanned docs) is handled by
 * src/lib/extraction/pdfExtract.ts — see process.ts for the full pipeline.
 * This module handles DOCX/TXT extraction and shared text utilities.
 */

// ── Text analysis ─────────────────────────────────────────────────────────────

/**
 * Returns true if extracted text looks like it came from a scanned PDF
 * with no real embedded text (image-only pages).
 */
export function detectIfScanned(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 200) return true;
  const whitespaceCount = (text.match(/\s/g) ?? []).length;
  if (text.length > 0 && whitespaceCount / text.length > 0.8) return true;
  return false;
}

/**
 * For very large documents, sample beginning, middle, and end so the AI
 * always sees the most legally significant sections without hitting token limits.
 *
 * Keeps:  first 30 k chars  (parties, recitals, key terms)
 *         middle 20 k chars (substantive obligations)
 *         last  30 k chars  (signatures, exhibits, schedules)
 */
export function truncateForProcessing(text: string): string {
  const MAX = 80_000;
  if (text.length <= MAX) return text;

  const first = text.slice(0, 30_000);
  const midStart = Math.floor(text.length / 2) - 10_000;
  const middle = text.slice(midStart, midStart + 20_000);
  const last = text.slice(-30_000);

  console.log("[Lexx] Large document detected — sampling key sections for processing");
  return [first, middle, last].join("\n\n[... document continues ...]\n\n");
}

// ── Chunking (used by processDocument.ts) ─────────────────────────────────────

export function chunkText(text: string, maxChars = 12000): string[] {
  if (text.length <= maxChars) return [text];

  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = "";
    }
    current += (current ? "\n\n" : "") + para;
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks;
}

// ── File extraction ───────────────────────────────────────────────────────────

export async function extractText(
  buffer: Buffer,
  fileType: "pdf" | "docx" | "txt"
): Promise<string> {
  switch (fileType) {
    case "pdf": {
      // PDFs go through pdfExtract.ts (with OCR fallback) in process.ts.
      // This path is a plain fallback if called directly.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
      const result = await pdfParse(buffer);
      return result.text;
    }
    case "docx": {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    case "txt":
      return buffer.toString("utf-8");
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}
