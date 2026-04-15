/**
 * LEXX — PDF Text Extraction with Per-Page OCR Fallback
 *
 * Flow (per page):
 *   1. pdfjs-dist getTextContent() — fast text extraction for text-layer PDFs
 *   2. tesseract                   — triggered per page when text layer returns < 20 chars
 *
 * Per-page OCR classification:
 *   ocr-high   — confidence ≥ 75   → text included as-is
 *   ocr-low    — confidence 40–74  → text included with warning wrapper
 *   ocr-failed — confidence < 40   → placeholder text inserted, page not counted as usable
 *
 * Method reported:
 *   "text"  — all usable pages used text layer (OCR-failed pages don't promote to "ocr"/"mixed")
 *   "ocr"   — all usable pages required OCR (no text layer)
 *   "mixed" — mix of text-layer and successful OCR pages
 *   "failed"— zero pages produced any usable content
 *
 * ocrQuality is set when OCR was used successfully (ocrUsablePages > 0):
 *   "high" — >50 % of pages extracted via text layer, OR avg OCR confidence ≥ 75
 *   "low"  — otherwise
 */

import { createWorker } from "tesseract.js";

export interface ExtractionResult {
  text: string;
  method: "text" | "ocr" | "mixed" | "failed";
  confidence?: number;   // 0–100, avg over usable OCR pages; absent when pure text
  ocrQuality?: "low" | "high"; // present when OCR produced usable pages
  pageCount: number;
  warnings: string[];
}

/** Minimum chars on a page to accept its text layer as real content. */
const TEXT_PAGE_THRESHOLD = 20;

// ── Public API ──────────────────────────────────────────────────────────────

export async function extractPdfText(buffer: Buffer): Promise<ExtractionResult> {
  return extractPerPage(buffer);
}

// ── Per-page extraction engine ──────────────────────────────────────────────

class NodeCanvasFactory {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private createCanvas: (w: number, h: number) => any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(createCanvasFn: (w: number, h: number) => any) {
    this.createCanvas = createCanvasFn;
  }

  create(width: number, height: number) {
    const canvas = this.createCanvas(width, height);
    return { canvas, context: canvas.getContext("2d") };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reset(obj: { canvas: any }, width: number, height: number) {
    obj.canvas.width = width;
    obj.canvas.height = height;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  destroy(obj: { canvas: any }) {
    obj.canvas.width = 0;
    obj.canvas.height = 0;
  }
}

async function extractPerPage(buffer: Buffer): Promise<ExtractionResult> {
  const warnings: string[] = [];
  const startMs = Date.now();

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js") as {
      getDocument: (opts: object) => { promise: Promise<PDFDocumentProxy> };
      GlobalWorkerOptions: { workerSrc: string };
    };
    pdfjsLib.GlobalWorkerOptions.workerSrc = "";

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createCanvas } = require("canvas") as {
      createCanvas: (w: number, h: number) => {
        getContext: (t: "2d") => object;
        toBuffer: (fmt: string) => Buffer;
        width: number;
        height: number;
      };
    };

    const canvasFactory = new NodeCanvasFactory(createCanvas);
    const pdfData = new Uint8Array(buffer);
    const pdf = (await pdfjsLib
      .getDocument({ data: pdfData, useSystemFonts: true })
      .promise) as PDFDocumentProxy;

    const actualPageCount = pdf.numPages;
    const pageTexts: string[] = [];
    let textPages = 0;
    let ocrUsablePages = 0;   // OCR pages with confidence ≥ 40
    let ocrFailedPages = 0;   // OCR pages with confidence < 40
    let totalOcrConfidence = 0; // sum over usable OCR pages only

    // One Tesseract worker, reused across all pages (avoids reloading eng.traineddata)
    const worker = await createWorker("eng");

    try {
      for (let pageNum = 1; pageNum <= actualPageCount; pageNum++) {
        const page = await pdf.getPage(pageNum);

        // ── Step 1: try text layer ────────────────────────────────────
        let pageText = "";
        try {
          const textContent = await page.getTextContent();
          pageText = (textContent.items as Array<{ str?: string }>)
            .filter((item) => typeof item.str === "string")
            .map((item) => item.str as string)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
        } catch (textErr) {
          const msg = textErr instanceof Error ? textErr.message : String(textErr);
          warnings.push(`Page ${pageNum} text extraction error: ${msg}`);
        }

        if (pageText.length >= TEXT_PAGE_THRESHOLD) {
          pageTexts.push(`\n\n--- Page ${pageNum} ---\n\n${pageText}`);
          textPages++;
          page.cleanup();
          continue;
        }

        // ── Step 2: text layer insufficient — run OCR ────────────────
        try {
          const viewport = page.getViewport({ scale: 2 }); // 2× = better OCR resolution
          const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
          const ctx = canvas.getContext("2d");

          await page.render({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            canvasContext: ctx as any,
            viewport,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            canvasFactory: canvasFactory as any,
          }).promise;

          const imageBuffer = canvas.toBuffer("image/png");
          const { data } = await worker.recognize(imageBuffer);

          const conf = data.confidence;
          const ocrText = data.text.trim();

          if (conf >= 75 && ocrText.length > 0) {
            // High-confidence OCR — include as-is
            pageTexts.push(`\n\n--- Page ${pageNum} ---\n\n${ocrText}`);
            totalOcrConfidence += conf;
            ocrUsablePages++;
          } else if (conf >= 40 && ocrText.length > 0) {
            // Low-confidence OCR — wrap with warning so downstream AI knows to weight it lower
            pageTexts.push(
              `\n\n--- Page ${pageNum} ---\n\n` +
              `[Page ${pageNum}: low-confidence OCR, verify against source]\n` +
              `${ocrText}\n` +
              `[End of page ${pageNum}]`
            );
            totalOcrConfidence += conf;
            ocrUsablePages++;
            warnings.push(`Page ${pageNum}: low-confidence OCR (${conf.toFixed(0)}%) — results may be unreliable`);
          } else {
            // OCR failed or confidence too low — insert placeholder so context isn't silently missing
            pageTexts.push(
              `\n\n--- Page ${pageNum} ---\n\n` +
              `[Page ${pageNum}: OCR failed — low-quality scan, content not extracted]`
            );
            ocrFailedPages++;
            warnings.push(`Page ${pageNum}: OCR confidence too low (${conf.toFixed(0)}%) — content not extracted`);
          }
        } catch (pageErr) {
          const msg = pageErr instanceof Error ? pageErr.message : String(pageErr);
          warnings.push(`Page ${pageNum} OCR failed: ${msg}`);
          pageTexts.push(
            `\n\n--- Page ${pageNum} ---\n\n` +
            `[Page ${pageNum}: OCR failed — low-quality scan, content not extracted]`
          );
          ocrFailedPages++;
        }

        page.cleanup();
      }
    } finally {
      await worker.terminate();
    }

    const elapsedMs = Date.now() - startMs;
    const avgConf = ocrUsablePages > 0 ? Math.round(totalOcrConfidence / ocrUsablePages) : undefined;

    console.log(
      `[Lexx:extract] ${actualPageCount} pages (${textPages} text, ${ocrUsablePages} OCR usable, ${ocrFailedPages} OCR failed), ${elapsedMs}ms` +
        (avgConf !== undefined ? `, avg OCR confidence ${avgConf}` : "")
    );
    if (warnings.length > 0) console.warn("[Lexx:extract] Warnings:", warnings);

    // Truly failed only when zero pages produced any real content
    if (textPages + ocrUsablePages === 0) {
      return {
        text: "",
        method: "failed",
        confidence: avgConf ?? 0,
        pageCount: actualPageCount,
        warnings: [...warnings, "No usable text extracted from any page"],
      };
    }

    // Determine extraction method based on usable pages only
    const method: ExtractionResult["method"] =
      ocrUsablePages === 0 ? "text" :
      textPages === 0 ? "ocr" :
      "mixed";

    // ocrQuality: only when OCR produced usable pages
    let ocrQuality: "low" | "high" | undefined;
    if (ocrUsablePages > 0) {
      // Majority of pages came from text layer → reliable overall
      if (textPages / actualPageCount > 0.5) {
        ocrQuality = "high";
      } else if (avgConf !== undefined && avgConf >= 75) {
        ocrQuality = "high";
      } else {
        ocrQuality = "low";
      }
    }

    return {
      text: pageTexts.join("").trim(),
      method,
      confidence: avgConf,
      ocrQuality,
      pageCount: actualPageCount,
      warnings,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Lexx:extract] Fatal error:", err);

    // Last-resort fallback: pdf-parse (whole document, no per-page)
    return pdfParseFallback(buffer, msg, warnings);
  }
}

async function pdfParseFallback(
  buffer: Buffer,
  priorError: string,
  warnings: string[]
): Promise<ExtractionResult> {
  warnings.push(`pdfjs-dist failed (${priorError}); falling back to pdf-parse`);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParseMod = require("pdf-parse");
    const pdfParse = (
      typeof pdfParseMod === "function" ? pdfParseMod : pdfParseMod.default ?? pdfParseMod
    ) as (buf: Buffer) => Promise<{ text: string; numpages: number }>;
    const result = await pdfParse(buffer);
    const text = result.text?.trim() ?? "";
    if (text.length < 100) {
      return { text: "", method: "failed", pageCount: result.numpages || 1, warnings: [...warnings, "pdf-parse fallback also returned insufficient text"] };
    }
    return { text, method: "text", pageCount: result.numpages || 1, warnings };
  } catch (e2) {
    const msg2 = e2 instanceof Error ? e2.message : String(e2);
    return { text: "", method: "failed", pageCount: 1, warnings: [...warnings, `pdf-parse fallback also failed: ${msg2}`] };
  }
}

// Minimal type shims for pdfjs-dist types we need (avoids importing @types/pdfjs-dist)
interface PDFDocumentProxy {
  numPages: number;
  getPage(n: number): Promise<PDFPageProxy>;
}
interface PDFPageProxy {
  getViewport(opts: { scale: number }): { width: number; height: number };
  getTextContent(): Promise<{ items: unknown[] }>;
  render(opts: object): { promise: Promise<void> };
  cleanup(): void;
}
