/**
 * LEXX — PDF Text Extraction with OCR Fallback
 *
 * Flow:
 *   1. pdf-parse  — fast, lossless on modern PDFs with embedded text
 *   2. tesseract  — page-by-page OCR via pdfjs-dist page rendering + canvas rasterisation
 *                   triggered when pdf-parse returns < 50 chars/page on average
 *
 * The caller receives an ExtractionResult that includes the extraction method and
 * (when OCR ran) an average confidence score. Both are persisted on the Document record
 * so the UI can show an OCR badge and the ops team can audit extraction quality.
 */

import { createWorker } from "tesseract.js";

export interface ExtractionResult {
  text: string;
  method: "text" | "ocr" | "mixed" | "failed";
  confidence?: number; // 0–100, present when OCR was used
  pageCount: number;
  warnings: string[];
}

/** Minimum average characters per page that we accept as real embedded text. */
const CHARS_PER_PAGE_THRESHOLD = 50;

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Extract text from a PDF buffer.
 * Tries pdf-parse first; falls back to Tesseract OCR for scanned documents.
 */
export async function extractPdfText(buffer: Buffer): Promise<ExtractionResult> {
  const warnings: string[] = [];

  // ── Step 1: pdf-parse (fast path) ───────────────────────────────────────
  let parsedText = "";
  let pageCount = 1;

  try {
    // pdf-parse may export as CJS default or as an ESM-wrapped module depending on the runtime
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParseMod = require("pdf-parse");
    const pdfParse = (
      typeof pdfParseMod === "function" ? pdfParseMod : pdfParseMod.default ?? pdfParseMod
    ) as (buf: Buffer) => Promise<{ text: string; numpages: number }>;
    const result = await pdfParse(buffer);
    parsedText = result.text?.trim() ?? "";
    pageCount = result.numpages || 1;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    warnings.push(`pdf-parse error: ${msg}`);
    // If pdf-parse itself throws, still attempt OCR
  }

  const avgCharsPerPage = parsedText.length / Math.max(pageCount, 1);

  if (avgCharsPerPage >= CHARS_PER_PAGE_THRESHOLD) {
    // Sufficient embedded text — no OCR needed
    return { text: parsedText, method: "text", pageCount, warnings };
  }

  // ── Step 2: OCR fallback ─────────────────────────────────────────────────
  warnings.push(
    `pdf-parse returned ${parsedText.length} chars (avg ${avgCharsPerPage.toFixed(0)}/page) — falling back to OCR`
  );

  return runOcr(buffer, pageCount, warnings);
}

// ── Internal OCR engine ─────────────────────────────────────────────────────

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

async function runOcr(
  buffer: Buffer,
  estimatedPageCount: number,
  warnings: string[]
): Promise<ExtractionResult> {
  const startMs = Date.now();
  let actualPageCount = estimatedPageCount;

  try {
    // Load pdfjs-dist legacy build (CJS, no worker required in Node.js)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js") as {
      getDocument: (opts: object) => { promise: Promise<PDFDocumentProxy> };
      GlobalWorkerOptions: { workerSrc: string };
    };
    // Empty string disables worker thread; rendering runs synchronously in Node.js
    pdfjsLib.GlobalWorkerOptions.workerSrc = "";

    // Load canvas (native Node.js canvas — precompiled binaries ship in canvas@3)
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

    // Open the PDF
    const pdfData = new Uint8Array(buffer);
    const pdf = (await pdfjsLib
      .getDocument({ data: pdfData, useSystemFonts: true })
      .promise) as PDFDocumentProxy;

    actualPageCount = pdf.numPages;

    const pageTexts: string[] = [];
    let totalConfidence = 0;
    let successfulPages = 0;
    let failedPages = 0;

    // One Tesseract worker, reused across all pages (avoids re-loading eng.traineddata)
    const worker = await createWorker("eng");

    try {
      for (let pageNum = 1; pageNum <= actualPageCount; pageNum++) {
        try {
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 2 }); // 2× = higher resolution → better OCR

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

          if (data.text.trim().length > 0) {
            pageTexts.push(`\n\n--- Page ${pageNum} ---\n\n${data.text}`);
            totalConfidence += data.confidence;
            successfulPages++;
          } else {
            warnings.push(
              `Page ${pageNum}: OCR returned empty text (confidence ${data.confidence.toFixed(0)})`
            );
            failedPages++;
          }

          page.cleanup();
        } catch (pageErr) {
          const msg = pageErr instanceof Error ? pageErr.message : String(pageErr);
          warnings.push(`Page ${pageNum} failed: ${msg}`);
          failedPages++;
        }
      }
    } finally {
      await worker.terminate();
    }

    const elapsedMs = Date.now() - startMs;
    const avgConf =
      successfulPages > 0 ? Math.round(totalConfidence / successfulPages) : 0;

    // Always log OCR timing to server console
    console.log(
      `[Lexx:OCR] ${actualPageCount} pages, ${elapsedMs}ms, avg confidence ${avgConf}`
    );
    if (warnings.length > 0) {
      console.warn("[Lexx:OCR] Warnings:", warnings);
    }

    // No text extracted at all
    if (successfulPages === 0) {
      return {
        text: "",
        method: "failed",
        confidence: 0,
        pageCount: actualPageCount,
        warnings: [...warnings, "OCR extracted no text from any page"],
      };
    }

    // Text extracted but confidence is too low to be trustworthy
    if (avgConf < 30) {
      return {
        text: "",
        method: "failed",
        confidence: avgConf,
        pageCount: actualPageCount,
        warnings: [
          ...warnings,
          `OCR avg confidence ${avgConf} is below minimum threshold (30) — output discarded to avoid garbage analysis`,
        ],
      };
    }

    const method: ExtractionResult["method"] = failedPages > 0 ? "mixed" : "ocr";
    return {
      text: pageTexts.join("").trim(),
      method,
      confidence: avgConf,
      pageCount: actualPageCount,
      warnings,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Lexx:OCR] Fatal error initialising OCR engine:", err);
    return {
      text: "",
      method: "failed",
      confidence: 0,
      pageCount: actualPageCount,
      warnings: [...warnings, `OCR engine failed: ${msg}`],
    };
  }
}

// Minimal type shims for pdfjs-dist types we need (avoids importing @types/pdfjs-dist)
interface PDFDocumentProxy {
  numPages: number;
  getPage(n: number): Promise<PDFPageProxy>;
}
interface PDFPageProxy {
  getViewport(opts: { scale: number }): { width: number; height: number };
  render(opts: object): { promise: Promise<void> };
  cleanup(): void;
}
