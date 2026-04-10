"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";

interface Matter { id: string; name: string; }
interface Doc { id: string; fileName: string; }
interface ProcessingResult { summary: string; extractedFacts: { id: string; fact: string; category: string }[]; keyIssues: { id: string; title: string; description: string; severity: string }[]; disclaimer: string; }
interface HistoryMsg { role: "user" | "assistant"; content: string; }

const DISCLAIMER = "This output is not legal advice and requires attorney review before any action is taken.";

export default function ComparePage() {
  const params = useParams<{ id: string }>();
  const matterId = params?.id ?? "";
  const searchParams = useSearchParams();
  const docAId = searchParams?.get("docA") || "";
  const docBId = searchParams?.get("docB") || "";

  const [matter, setMatter] = useState<Matter | null>(null);
  const [docA, setDocA] = useState<Doc | null>(null);
  const [docB, setDocB] = useState<Doc | null>(null);
  const [resultA, setResultA] = useState<ProcessingResult | null>(null);
  const [resultB, setResultB] = useState<ProcessingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [history, setHistory] = useState<HistoryMsg[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [mattersRes, docsRes, resA, resB] = await Promise.all([
          fetch("/api/matters"),
          fetch(`/api/documents?matterId=${matterId}`),
          fetch(`/api/documents/result?documentId=${docAId}`),
          fetch(`/api/documents/result?documentId=${docBId}`),
        ]);
        const matters = await mattersRes.json();
        if (Array.isArray(matters)) setMatter(matters.find((m: Matter) => m.id === matterId) || null);
        const docs = await docsRes.json();
        if (Array.isArray(docs)) {
          setDocA(docs.find((d: Doc) => d.id === docAId) || null);
          setDocB(docs.find((d: Doc) => d.id === docBId) || null);
        }
        if (resA.ok) setResultA(await resA.json());
        if (resB.ok) setResultB(await resB.json());
      } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
      finally { setLoading(false); }
    }
    load();
  }, [matterId, docAId, docBId]);

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || asking) return;
    setAsking(true);
    const q = question;
    setHistory((prev) => [...prev, { role: "user", content: q }]);
    setQuestion("");
    try {
      const res = await fetch("/api/workspace/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, documentIdA: docAId, documentIdB: docBId, history }),
      });
      const data = await res.json();
      setHistory((prev) => [...prev, { role: "assistant", content: data.answer }]);
    } catch { setHistory((prev) => [...prev, { role: "assistant", content: "Failed to get answer. Please try again." }]); }
    finally { setAsking(false); }
  }

  if (loading) return <div className="px-8 py-20 flex items-center justify-center"><Spinner /><span className="ml-3 text-sm text-muted">Loading comparison...</span></div>;

  return (
    <div className="px-8 py-8 max-w-[1200px]">
      <div className="text-xs text-muted mb-6 flex items-center gap-1.5">
        <Link href="/" className="hover:text-accent transition-colors">Dashboard</Link><span>/</span>
        <Link href={`/matters/${matterId}`} className="hover:text-accent transition-colors">{matter?.name || "Matter"}</Link><span>/</span>
        <span className="text-primary">Compare Documents</span>
      </div>

      {error && <div className="mb-4 px-4 py-3 bg-[#FEE2E2] border border-[#FECACA] rounded-lg"><span className="text-sm text-[#DC2626]">{error}</span></div>}

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-primary">Document Comparison</h1>
        <p className="text-sm text-muted mt-0.5">Comparing {docA?.fileName || "Document A"} and {docB?.fileName || "Document B"}</p>
      </div>

      {/* Q&A bar */}
      <div className="mb-6 bg-surface border border-border rounded-lg p-4" style={{ boxShadow: "var(--shadow)" }}>
        <h3 className="text-sm font-semibold text-primary mb-3">Ask AI About Both Documents</h3>
        <form onSubmit={handleAsk} className="flex gap-3">
          <input type="text" value={question} onChange={(e) => setQuestion(e.target.value)}
            placeholder="What are the differences between these documents?"
            className="flex-1 px-3 py-2 border border-border rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent bg-white" />
          <button type="submit" disabled={!question.trim() || asking}
            className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-[6px] hover:bg-accent-hover transition-colors disabled:opacity-50">
            {asking ? <Spinner /> : "Ask"}
          </button>
        </form>

        {history.length > 0 && (
          <div className="mt-4 space-y-3 max-h-[400px] overflow-y-auto">
            {history.map((msg, i) => (
              <div key={i} className={`text-sm ${msg.role === "user" ? "text-primary font-medium" : "text-charcoal leading-relaxed"}`}>
                <span className={`text-[10px] font-semibold uppercase mr-2 ${msg.role === "user" ? "text-accent" : "text-muted"}`}>{msg.role === "user" ? "You" : "AI"}</span>
                <span className="whitespace-pre-wrap">{msg.content}</span>
              </div>
            ))}
            {asking && <div className="flex items-center gap-2 text-sm text-muted"><Spinner /> Analyzing...</div>}
          </div>
        )}
        {history.some((m) => m.role === "assistant") && (
          <div className="mt-3 pt-2 border-t border-border"><p className="text-[11px] text-muted italic">{DISCLAIMER}</p></div>
        )}
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DocColumn title={docA?.fileName || "Document A"} result={resultA} />
        <DocColumn title={docB?.fileName || "Document B"} result={resultB} />
      </div>
    </div>
  );
}

function DocColumn({ title, result }: { title: string; result: ProcessingResult | null }) {
  if (!result) return <div className="bg-surface border border-border rounded-lg p-6 text-center text-sm text-muted">No results available</div>;
  return (
    <div className="space-y-4">
      <div className="bg-surface border border-border rounded-lg" style={{ boxShadow: "var(--shadow)" }}>
        <div className="px-4 py-3 border-b border-border"><h2 className="text-sm font-semibold text-primary">{title}</h2></div>
        <div className="p-4 space-y-4">
          <div><h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Summary</h3><p className="text-sm text-charcoal leading-relaxed">{result.summary}</p></div>
          <div><h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Key Issues ({result.keyIssues.length})</h3>
            {result.keyIssues.map((i) => (
              <div key={i.id} className="flex gap-2 mb-2">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 h-fit ${i.severity === "high" ? "bg-[#FEE2E2] text-[#DC2626]" : i.severity === "medium" ? "bg-[#FEF3C7] text-[#D97706]" : "bg-[#D1FAE5] text-[#059669]"}`}>{i.severity.toUpperCase()}</span>
                <div><p className="text-sm font-medium text-primary">{i.title}</p><p className="text-xs text-charcoal">{i.description}</p></div>
              </div>
            ))}
          </div>
          <div><h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Key Facts ({result.extractedFacts.length})</h3>
            {result.extractedFacts.slice(0, 10).map((f) => (
              <div key={f.id} className="flex gap-2 mb-1.5">
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#EEF2FF] text-[#4F46E5] flex-shrink-0 h-fit">{f.category.toUpperCase()}</span>
                <p className="text-xs text-charcoal">{f.fact}</p>
              </div>
            ))}
            {result.extractedFacts.length > 10 && <p className="text-xs text-muted mt-1">+ {result.extractedFacts.length - 10} more facts</p>}
          </div>
          <div className="pt-3 border-t border-border"><p className="text-[11px] text-muted italic">{result.disclaimer}</p></div>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return <svg className="animate-spin h-4 w-4 text-accent inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>;
}
