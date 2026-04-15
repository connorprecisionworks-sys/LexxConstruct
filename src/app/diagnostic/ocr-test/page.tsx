"use client";

import { useState, useRef } from "react";

interface OcrResult {
  fileName: string;
  fileSizeBytes: number;
  elapsedMs: number;
  method: "text" | "ocr" | "mixed" | "failed";
  pageCount: number;
  confidence: number | null;
  ocrQuality: "low" | "high" | null;
  warnings: string[];
  textLength: number;
  text: string;
}

const METHOD_LABEL: Record<string, string> = {
  text: "Text (embedded)",
  ocr: "OCR (full)",
  mixed: "Mixed (text + OCR)",
  failed: "Failed",
};

const METHOD_COLOR: Record<string, string> = {
  text: "bg-[#D1FAE5] text-[#059669]",
  ocr: "bg-[#EEF2FF] text-[#4F46E5]",
  mixed: "bg-[#FEF3C7] text-[#D97706]",
  failed: "bg-[#FEE2E2] text-[#DC2626]",
};

export default function OcrTestPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || uploading) return;

    setUploading(true);
    setError(null);
    setResult(null);

    const fd = new FormData();
    fd.append("document", file);

    try {
      const res = await fetch("/api/diagnostic/test-ocr", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setUploading(false);
    }
  }

  function handleCopy() {
    if (!result?.text) return;
    navigator.clipboard.writeText(result.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="px-8 py-8 max-w-[900px]">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-primary">OCR Diagnostic</h1>
        <p className="text-sm text-muted mt-0.5">
          Upload a PDF to see exactly what text Lexx extracts. Use this to validate OCR quality on realistic scanned documents.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-lg p-6 mb-6" style={{ boxShadow: "var(--shadow)" }}>
        <div className="flex items-center gap-4">
          <input
            ref={fileInput}
            type="file"
            accept=".pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="flex-1 text-sm text-charcoal file:mr-4 file:px-3 file:py-1.5 file:rounded file:border file:border-border file:text-xs file:font-medium file:text-charcoal file:bg-white file:cursor-pointer hover:file:bg-surface"
          />
          <button
            type="submit"
            disabled={!file || uploading}
            className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-[6px] hover:bg-accent-hover transition-colors disabled:opacity-50 flex items-center gap-2 flex-shrink-0"
          >
            {uploading && <Spinner />}
            {uploading ? "Extracting…" : "Extract Text"}
          </button>
        </div>
        {file && (
          <p className="text-xs text-muted mt-2">
            {file.name} &nbsp;·&nbsp; {(file.size / 1024).toFixed(0)} KB
          </p>
        )}
      </form>

      {error && (
        <div className="mb-6 px-4 py-3 bg-[#FEE2E2] border border-[#FECACA] rounded-lg">
          <p className="text-sm text-[#DC2626]">{error}</p>
        </div>
      )}

      {uploading && (
        <div className="bg-surface border border-border rounded-lg p-8 text-center mb-6" style={{ boxShadow: "var(--shadow)" }}>
          <Spinner />
          <p className="text-sm text-muted mt-3">Running extraction — scanned documents may take 30–90 seconds…</p>
        </div>
      )}

      {result && !uploading && (
        <div className="space-y-4">
          {/* Metadata */}
          <div className="bg-surface border border-border rounded-lg p-4" style={{ boxShadow: "var(--shadow)" }}>
            <h2 className="text-sm font-semibold text-primary mb-3">Extraction Metadata</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Meta label="Method">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${METHOD_COLOR[result.method]}`}>
                  {METHOD_LABEL[result.method] ?? result.method}
                </span>
              </Meta>
              <Meta label="Pages">{result.pageCount}</Meta>
              <Meta label="Elapsed">{result.elapsedMs.toLocaleString()} ms</Meta>
              <Meta label="Text length">{result.textLength.toLocaleString()} chars</Meta>
              {result.confidence !== null && (
                <Meta label="OCR Confidence">{result.confidence}%</Meta>
              )}
              {result.ocrQuality !== null && (
                <Meta label="OCR Quality">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${result.ocrQuality === "low" ? "bg-[#FEF3C7] text-[#D97706]" : "bg-[#D1FAE5] text-[#059669]"}`}>
                    {result.ocrQuality.toUpperCase()}
                  </span>
                </Meta>
              )}
            </div>

            {result.warnings.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs font-semibold text-muted mb-1">Warnings ({result.warnings.length})</p>
                <ul className="space-y-0.5">
                  {result.warnings.map((w, i) => (
                    <li key={i} className="text-xs text-[#D97706]">• {w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Extracted text */}
          <div className="bg-surface border border-border rounded-lg" style={{ boxShadow: "var(--shadow)" }}>
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-primary">Extracted Text</h2>
              <button
                onClick={handleCopy}
                className="text-xs text-muted hover:text-charcoal transition-colors"
              >
                {copied ? "Copied!" : "Copy to clipboard"}
              </button>
            </div>
            <div className="p-4">
              {result.method === "failed" || result.textLength === 0 ? (
                <p className="text-sm text-muted italic">No text was extracted. See warnings above.</p>
              ) : (
                <pre className="text-xs text-charcoal font-mono whitespace-pre-wrap break-words leading-relaxed max-h-[600px] overflow-y-auto">
                  {result.text}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-0.5">{label}</p>
      <div className="text-sm text-charcoal">{children}</div>
    </div>
  );
}

function Spinner() {
  return <svg className="animate-spin h-4 w-4 text-accent inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>;
}
