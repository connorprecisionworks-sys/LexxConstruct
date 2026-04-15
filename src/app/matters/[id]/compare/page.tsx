"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import type { StructuredComparison } from "@/pages/api/workspace/compare-structured";

interface Matter { id: string; name: string; }
interface Doc { id: string; fileName: string; }

const SEV: Record<string, string> = {
  high: "bg-[#FEE2E2] text-[#DC2626]",
  medium: "bg-[#FEF3C7] text-[#D97706]",
  low: "bg-[#D1FAE5] text-[#059669]",
};

export default function ComparePage() {
  const params = useParams<{ id: string }>();
  const matterId = params?.id ?? "";
  const searchParams = useSearchParams();
  const docAId = searchParams?.get("docA") || "";
  const docBId = searchParams?.get("docB") || "";

  const [matter, setMatter] = useState<Matter | null>(null);
  const [docA, setDocA] = useState<Doc | null>(null);
  const [docB, setDocB] = useState<Doc | null>(null);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [comparison, setComparison] = useState<StructuredComparison | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [mattersRes, docsRes] = await Promise.all([
          fetch("/api/matters"),
          fetch(`/api/documents?matterId=${matterId}`),
        ]);
        const matters = await mattersRes.json();
        if (Array.isArray(matters)) setMatter(matters.find((m: Matter) => m.id === matterId) || null);
        const docs = await docsRes.json();
        if (Array.isArray(docs)) {
          setDocA(docs.find((d: Doc) => d.id === docAId) || null);
          setDocB(docs.find((d: Doc) => d.id === docBId) || null);
        }
      } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
      finally { setLoading(false); }
    }
    load();
  }, [matterId, docAId, docBId]);

  async function runComparison() {
    setComparing(true);
    setError(null);
    try {
      const res = await fetch("/api/workspace/compare-structured", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIdA: docAId, documentIdB: docBId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Comparison failed");
      }
      setComparison(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Comparison failed");
    } finally {
      setComparing(false);
    }
  }

  if (loading) return (
    <div className="px-8 py-20 flex items-center justify-center">
      <Spinner /><span className="ml-3 text-sm text-muted">Loading...</span>
    </div>
  );

  return (
    <div className="px-8 py-8 max-w-[1200px]">
      <div className="text-xs text-muted mb-6 flex items-center gap-1.5">
        <Link href="/" className="hover:text-accent transition-colors">Dashboard</Link><span>/</span>
        <Link href={`/matters/${matterId}`} className="hover:text-accent transition-colors">{matter?.name || "Matter"}</Link><span>/</span>
        <span className="text-primary">Compare Documents</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-primary">Document Comparison</h1>
          <p className="text-sm text-muted mt-0.5">
            {docA?.fileName || "Document A"} &nbsp;vs&nbsp; {docB?.fileName || "Document B"}
          </p>
        </div>
        <button
          onClick={runComparison}
          disabled={comparing}
          className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-[6px] hover:bg-accent-hover transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {comparing && <Spinner />}
          {comparing ? "Analyzing…" : comparison ? "Re-run Analysis" : "Run Structural Analysis"}
        </button>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 bg-[#FEE2E2] border border-[#FECACA] rounded-lg">
          <span className="text-sm text-[#DC2626]">{error}</span>
        </div>
      )}

      {!comparison && !comparing && (
        <div className="bg-surface border border-border rounded-lg p-8 text-center" style={{ boxShadow: "var(--shadow)" }}>
          <p className="text-sm text-muted mb-1">Click <strong>Run Structural Analysis</strong> to compare these documents.</p>
          <p className="text-xs text-muted">The AI will identify agreements, contradictions, gaps, and risk flags across both documents.</p>
        </div>
      )}

      {comparing && (
        <div className="bg-surface border border-border rounded-lg p-8 text-center" style={{ boxShadow: "var(--shadow)" }}>
          <Spinner />
          <p className="text-sm text-muted mt-3">Analyzing documents — this may take 15–30 seconds…</p>
        </div>
      )}

      {comparison && !comparing && (
        <div className="space-y-6">
          {/* Agreements */}
          {comparison.agreements.length > 0 && (
            <Section title="Agreements" count={comparison.agreements.length} accent="text-[#059669]">
              <div className="space-y-3">
                {comparison.agreements.map((a, i) => (
                  <div key={i} className="border border-border rounded-[6px] p-3">
                    <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">{a.topic}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] font-semibold text-muted mb-1">{docA?.fileName}</p>
                        <p className="text-sm text-charcoal">{a.descriptionA}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-muted mb-1">{docB?.fileName}</p>
                        <p className="text-sm text-charcoal">{a.descriptionB}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Contradictions */}
          {comparison.contradictions.length > 0 && (
            <Section title="Contradictions" count={comparison.contradictions.length} accent="text-[#DC2626]">
              <div className="space-y-3">
                {comparison.contradictions.map((c, i) => (
                  <div key={i} className="border border-border rounded-[6px] p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${SEV[c.severity]}`}>{c.severity.toUpperCase()}</span>
                      <p className="text-xs font-semibold text-primary">{c.topic}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-[#FFF5F5] rounded p-2">
                        <p className="text-sm text-charcoal">{c.documentA}</p>
                      </div>
                      <div className="bg-[#FFF5F5] rounded p-2">
                        <p className="text-sm text-charcoal">{c.documentB}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Gaps */}
          {(comparison.gapsInA.length > 0 || comparison.gapsInB.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {comparison.gapsInA.length > 0 && (
                <Section title={`Missing from ${docA?.fileName ?? "Document A"}`} count={comparison.gapsInA.length} accent="text-[#D97706]">
                  <div className="space-y-1.5">
                    {comparison.gapsInA.map((g, i) => (
                      <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded bg-row-alt">
                        <span className="text-muted text-xs mt-0.5 flex-shrink-0">•</span>
                        <p className="text-sm text-charcoal">{g.topic}</p>
                      </div>
                    ))}
                  </div>
                </Section>
              )}
              {comparison.gapsInB.length > 0 && (
                <Section title={`Missing from ${docB?.fileName ?? "Document B"}`} count={comparison.gapsInB.length} accent="text-[#D97706]">
                  <div className="space-y-1.5">
                    {comparison.gapsInB.map((g, i) => (
                      <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded bg-row-alt">
                        <span className="text-muted text-xs mt-0.5 flex-shrink-0">•</span>
                        <p className="text-sm text-charcoal">{g.topic}</p>
                      </div>
                    ))}
                  </div>
                </Section>
              )}
            </div>
          )}

          {/* Risk Flags */}
          {comparison.riskFlags.length > 0 && (
            <Section title="Risk Flags" count={comparison.riskFlags.length} accent="text-[#DC2626]">
              <div className="space-y-2">
                {comparison.riskFlags.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 border border-border rounded-[6px] px-3 py-2">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${SEV[r.severity]}`}>{r.severity.toUpperCase()}</span>
                    <div>
                      <p className="text-[10px] text-muted font-semibold mb-0.5">{r.document}</p>
                      <p className="text-sm text-charcoal">{r.flag}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <div className="pt-2 border-t border-border">
            <p className="text-[11px] text-muted italic">{comparison.disclaimer}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, count, accent, children }: { title: string; count: number; accent: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-lg" style={{ boxShadow: "var(--shadow)" }}>
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <h2 className={`text-sm font-semibold ${accent}`}>{title}</h2>
        <span className="text-[10px] font-medium text-muted bg-row-alt px-1.5 py-0.5 rounded">{count}</span>
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

function Spinner() {
  return <svg className="animate-spin h-4 w-4 text-accent inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>;
}
