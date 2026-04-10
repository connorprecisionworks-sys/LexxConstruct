/**
 * OCR extraction test — run with: npx tsx test-ocr.mts
 * Tests three scenarios:
 *   1. Text-based PDF  → should use "text" method, no OCR
 *   2. Image-only PDF  → should fall back to OCR, return "ocr" or "failed"
 *   3. Corrupt/empty   → should fail gracefully with method "failed"
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
import { extractPdfText } from "./src/lib/extraction/pdfExtract";
import { createCanvas } from "canvas";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal valid PDF with a single page containing embedded text. */
function makeTextPdf(text: string): Buffer {
  const stream = `BT\n/F1 12 Tf\n72 720 Td\n(${text.replace(/[()\\]/g, "\\$&")}) Tj\nET`;
  const streamBytes = Buffer.from(stream);
  const len = streamBytes.length;

  const body = [
    `%PDF-1.4`,
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`,
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj`,
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]\n   /Resources << /Font << /F1 4 0 R >> >>\n   /Contents 5 0 R >>\nendobj`,
    `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`,
    `5 0 obj\n<< /Length ${len} >>\nstream\n${stream}\nendstream\nendobj`,
  ];

  const bodyStr = body.join("\n\n");
  const bodyBuf = Buffer.from(bodyStr + "\n\n");
  const xrefPos = bodyBuf.length;

  const xref = `xref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000266 00000 n \n0000000340 00000 n \n`;
  const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  return Buffer.from(bodyStr + "\n\n" + xref + trailer);
}

/** Build a PDF whose single page contains only a rasterised PNG (no embedded text). */
async function makeImageOnlyPdf(): Promise<Buffer> {
  // Render "Hello OCR" onto a canvas → PNG → embed in a PDF image XObject
  const c = createCanvas(400, 100);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 400, 100);
  ctx.fillStyle = "#000";
  ctx.font = "28px sans-serif";
  ctx.fillText("Hello OCR World 1234", 20, 60);
  const pngBuf = c.toBuffer("image/png");

  // Embed PNG as a raw /FlateDecode image in a minimal PDF
  // We use /ASCIIHexDecode for simplicity (no compression needed for a test)
  const hexData = pngBuf.toString("hex").toUpperCase();
  const hexLines = hexData.match(/.{1,78}/g)!.join("\n") + ">";

  const imgObj = [
    `<< /Type /XObject /Subtype /Image`,
    `/Width 400 /Height 100`,
    `/ColorSpace /DeviceRGB /BitsPerComponent 8`,
    `/Filter [/ASCIIHexDecode /FlateDecode]`, // decode hex first, then inflate
    `/Length ${hexLines.length} >>`,
  ].join("\n");

  // Simpler: just embed as RGB raw data with ASCIIHex
  const rgbData = Buffer.alloc(400 * 100 * 3, 255); // white 400×100
  // write black pixels for our "text" area (simulate a scanned doc)
  for (let y = 40; y < 70; y++) {
    for (let x = 20; x < 380; x++) {
      const off = (y * 400 + x) * 3;
      rgbData[off] = 0;
      rgbData[off + 1] = 0;
      rgbData[off + 2] = 0;
    }
  }
  const rgbHex = rgbData.toString("hex").toUpperCase() + ">";
  const imgLen = rgbHex.length;

  const body = [
    `%PDF-1.4`,
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`,
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj`,
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 100]\n   /Resources << /XObject << /Im0 4 0 R >> >>\n   /Contents 5 0 R >>\nendobj`,
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width 400 /Height 100\n   /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode\n   /Length ${imgLen} >>\nstream\n${rgbHex}\nendstream\nendobj`,
    `5 0 obj\n<< /Length 36 >>\nstream\nq 400 0 0 100 0 0 cm /Im0 Do Q\nendstream\nendobj`,
  ];

  const bodyStr = body.join("\n\n");
  const xrefPos = Buffer.from(bodyStr + "\n\n").length;
  const trailer = `xref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000266 00000 n \n0000000340 00000 n \ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  return Buffer.from(bodyStr + "\n\n" + trailer);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function runTests() {
  let passed = 0;
  let failed = 0;

  function check(name: string, ok: boolean, detail?: string) {
    if (ok) {
      console.log(`  ✓ ${name}`);
      passed++;
    } else {
      console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
      failed++;
    }
  }

  // ── Scenario 1: Text-based PDF ─────────────────────────────────────────────
  console.log("\nScenario 1: Text-based PDF (fast path)");
  const longText = "This is a normal modern PDF with embedded text content. ".repeat(20);
  const textPdf = makeTextPdf(longText);
  const r1 = await extractPdfText(textPdf);
  console.log(`  method=${r1.method} pages=${r1.pageCount} chars=${r1.text.length} warnings=${r1.warnings.length}`);
  check("method is 'text'", r1.method === "text", `got '${r1.method}'`);
  check("text is non-empty", r1.text.length > 50);
  check("no confidence score (not needed for text path)", r1.confidence === undefined);
  check("pageCount >= 1", r1.pageCount >= 1);

  // ── Scenario 2: Image-only PDF (OCR path) ──────────────────────────────────
  console.log("\nScenario 2: Image-only PDF (OCR fallback)");
  const imagePdf = await makeImageOnlyPdf();
  const r2 = await extractPdfText(imagePdf);
  console.log(`  method=${r2.method} pages=${r2.pageCount} confidence=${r2.confidence} chars=${r2.text.length}`);
  check("method is 'ocr' or 'mixed' or 'failed'", ["ocr", "mixed", "failed"].includes(r2.method), `got '${r2.method}'`);
  check("not 'text' method (OCR was triggered)", r2.method !== "text");
  check("pageCount is 1", r2.pageCount === 1);
  // confidence only checked when OCR ran
  if (r2.method !== "failed") {
    check("confidence is a number 0–100", typeof r2.confidence === "number" && r2.confidence >= 0 && r2.confidence <= 100);
  }

  // ── Scenario 3: Corrupt/garbage buffer ────────────────────────────────────
  console.log("\nScenario 3: Corrupt/garbage file");
  const garbage = Buffer.from("not a pdf at all %%%@@@###$$$");
  const r3 = await extractPdfText(garbage);
  console.log(`  method=${r3.method} warnings=${r3.warnings.length}`);
  check("method is 'failed'", r3.method === "failed", `got '${r3.method}'`);
  check("text is empty", r3.text === "");
  check("has at least one warning", r3.warnings.length > 0);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error("Unexpected test error:", e);
  process.exit(1);
});
