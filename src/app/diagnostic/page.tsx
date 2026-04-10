"use client";

import { useState, useEffect } from "react";

interface Counts {
  matters: number;
  documents: number;
  processingResults: number;
  depositions: number;
  drafts: number;
  draftVersions: number;
  flags: number;
  activities: number;
}

interface OrphanCounts {
  documentsWithoutMatter: number;
  draftsWithoutDocument: number;
  flagsWithoutDocument: number;
  processingResultsWithoutDocument: number;
}

export default function DiagnosticPage() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [orphans, setOrphans] = useState<OrphanCounts | null>(null);
  const [exportedAt, setExportedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/diagnostic/export");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setCounts(data.counts);
        setExportedAt(data.exportedAt);
        setOrphans({
          documentsWithoutMatter: data.orphans.documentsWithoutMatter.length,
          draftsWithoutDocument: data.orphans.draftsWithoutDocument.length,
          flagsWithoutDocument: data.orphans.flagsWithoutDocument.length,
          processingResultsWithoutDocument: data.orphans.processingResultsWithoutDocument.length,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function copyToClipboard(full: boolean) {
    setCopying(true);
    try {
      const res = await fetch(`/api/diagnostic/export${full ? "?full=true" : ""}`);
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    } catch {
      alert("Clipboard write failed. Try downloading instead.");
    } finally {
      setCopying(false);
    }
  }

  const totalOrphans = orphans
    ? orphans.documentsWithoutMatter +
      orphans.draftsWithoutDocument +
      orphans.flagsWithoutDocument +
      orphans.processingResultsWithoutDocument
    : 0;

  return (
    <div className="px-8 py-10 max-w-[720px]">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-primary">Diagnostic Export</h1>
        <p className="text-sm text-muted mt-1">
          Developer tool. Dumps the full state of Lexx for architect review. Not linked from the main app.
        </p>
        {exportedAt && (
          <p className="text-xs text-muted mt-1">
            Data as of: <span className="font-mono">{new Date(exportedAt).toLocaleString()}</span>
          </p>
        )}
      </div>

      {/* Download buttons */}
      <div className="flex flex-wrap gap-3 mb-8">
        <a
          href="/api/diagnostic/export"
          download
          className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-[6px] hover:bg-accent-hover transition-colors inline-block"
        >
          Download Diagnostic Export
        </a>
        <a
          href="/api/diagnostic/export?full=true"
          download
          className="px-4 py-2 bg-white border border-border text-sm font-medium text-charcoal rounded-[6px] hover:bg-row-alt transition-colors inline-block"
        >
          Download Full Export (no truncation)
        </a>
      </div>

      {/* Copy to clipboard */}
      <div className="flex flex-wrap gap-3 mb-8">
        <button
          onClick={() => copyToClipboard(false)}
          disabled={copying}
          className="px-4 py-2 bg-white border border-border text-sm font-medium text-charcoal rounded-[6px] hover:bg-row-alt transition-colors disabled:opacity-50"
        >
          {copying ? "Copying…" : copied ? "Copied!" : "Copy to Clipboard (truncated)"}
        </button>
        <button
          onClick={() => copyToClipboard(true)}
          disabled={copying}
          className="px-4 py-2 bg-white border border-border text-sm font-medium text-charcoal rounded-[6px] hover:bg-row-alt transition-colors disabled:opacity-50"
        >
          {copying ? "Copying…" : "Copy to Clipboard (full)"}
        </button>
      </div>

      {/* Keyboard shortcut reminder */}
      <div className="mb-8 px-4 py-3 bg-row-alt border border-border rounded-[6px]">
        <p className="text-sm text-charcoal">
          <span className="font-medium">Shortcut:</span>{" "}
          <kbd className="px-1.5 py-0.5 bg-white border border-border rounded text-xs font-mono">⌘</kbd>
          {" + "}
          <kbd className="px-1.5 py-0.5 bg-white border border-border rounded text-xs font-mono">⇧</kbd>
          {" + "}
          <kbd className="px-1.5 py-0.5 bg-white border border-border rounded text-xs font-mono">D</kbd>
          {" "}triggers a download from anywhere in the app.
        </p>
      </div>

      {/* Counts summary */}
      <div className="bg-surface border border-border rounded-lg p-5 mb-6">
        <h2 className="text-sm font-semibold text-primary mb-4">Store Counts</h2>
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : counts ? (
          <div className="grid grid-cols-2 gap-x-8 gap-y-2">
            {[
              ["Matters", counts.matters],
              ["Documents", counts.documents],
              ["Processing Results", counts.processingResults],
              ["Depositions", counts.depositions],
              ["Drafts", counts.drafts],
              ["Draft Versions", counts.draftVersions],
              ["Flags", counts.flags],
              ["Activities", counts.activities],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between py-1 border-b border-border last:border-0">
                <span className="text-sm text-charcoal">{label}</span>
                <span className="text-sm font-semibold text-primary font-mono">{value}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Orphans summary */}
      {orphans !== null && (
        <div className={`border rounded-lg p-5 ${totalOrphans > 0 ? "bg-[#FEF3C7] border-[#D97706]" : "bg-surface border-border"}`}>
          <h2 className="text-sm font-semibold text-primary mb-3">
            Referential Integrity
            {totalOrphans === 0 && (
              <span className="ml-2 text-[11px] font-medium text-[#059669] bg-[#D1FAE5] px-1.5 py-0.5 rounded">Clean</span>
            )}
            {totalOrphans > 0 && (
              <span className="ml-2 text-[11px] font-medium text-[#D97706] bg-[#FEF3C7] px-1.5 py-0.5 rounded">{totalOrphans} orphan{totalOrphans !== 1 ? "s" : ""}</span>
            )}
          </h2>
          <div className="space-y-1.5">
            {[
              ["Documents without a matter", orphans.documentsWithoutMatter],
              ["Drafts without a document", orphans.draftsWithoutDocument],
              ["Flags without a document", orphans.flagsWithoutDocument],
              ["Processing results without a document", orphans.processingResultsWithoutDocument],
            ].map(([label, count]) => (
              <div key={label as string} className="flex justify-between text-sm">
                <span className="text-charcoal">{label}</span>
                <span className={`font-semibold font-mono ${(count as number) > 0 ? "text-[#D97706]" : "text-muted"}`}>
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
