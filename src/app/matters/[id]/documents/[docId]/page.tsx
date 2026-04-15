"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { timeAgo } from "@/lib/utils";
import type { FlagType } from "@/types";

interface KeyIssue { id: string; title: string; description: string; severity: "high" | "medium" | "low"; pageRef?: string; }
interface ExtractedFact { id: string; fact: string; category: string; pageRef?: string; confidence: "high" | "medium" | "low"; }
interface TimelineEvent { id: string; date: string; description: string; significance: "critical" | "important" | "contextual"; }
interface MissingInfo { id: string; description: string; importance: "required" | "helpful" | "optional"; }
interface Flag { id: string; documentId: string; type: FlagType; source: "auto" | "manual"; text: string; location?: string; createdAt: string; resolved: boolean; resolvedAt?: string; }
interface ProcessingResult { summary: string; keyIssues: KeyIssue[]; extractedFacts: ExtractedFact[]; timeline: TimelineEvent[]; missingInformation: MissingInfo[]; flags: Flag[]; disclaimer: string; }
interface Doc { id: string; fileName: string; status: string; notes: string; matterId: string; documentKind?: string; extractionMethod?: "text" | "ocr" | "mixed" | "failed"; ocrConfidence?: number; ocrQuality?: "low" | "high"; }
interface Matter { id: string; name: string; }

const FLAG_TYPES: FlagType[] = ["contradiction", "missing_info", "follow_up", "key_evidence", "deadline"];
const FLAG_LABEL: Record<FlagType, string> = { contradiction: "Contradiction", missing_info: "Missing Info", follow_up: "Follow Up", key_evidence: "Key Evidence", deadline: "Deadline" };
const FLAG_COLOR: Record<FlagType, string> = {
  contradiction: "bg-[#FEE2E2] text-[#DC2626]",
  missing_info: "bg-[#FEF3C7] text-[#D97706]",
  follow_up: "bg-[#EEF2FF] text-[#4F46E5]",
  key_evidence: "bg-[#D1FAE5] text-[#059669]",
  deadline: "bg-[#FFE4E6] text-[#E11D48]",
};

export default function DocumentIntelligence() {
  const params = useParams<{ id: string; docId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const highlightFlagId = searchParams?.get("highlight") ?? null;
  const matterId = params?.id ?? "";
  const docId = params?.docId ?? "";

  const [doc, setDoc] = useState<Doc | null>(null);
  const [matter, setMatter] = useState<Matter | null>(null);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [docNotes, setDocNotes] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [otherDocs, setOtherDocs] = useState<Doc[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [openPopover, setOpenPopover] = useState<string | null>(null);
  const [popoverType, setPopoverType] = useState<FlagType>("follow_up");
  const [popoverNote, setPopoverNote] = useState("");
  const [flagging, setFlagging] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [newFlagId, setNewFlagId] = useState<string | null>(null);

  const flagRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    async function load() {
      try {
        setError(null);
        const [mattersRes, docsRes, resultRes] = await Promise.all([
          fetch("/api/matters"), fetch(`/api/documents?matterId=${matterId}`), fetch(`/api/documents/result?documentId=${docId}`),
        ]);
        const matters = await mattersRes.json();
        if (Array.isArray(matters)) setMatter(matters.find((m: Matter) => m.id === matterId) || null);
        const docs = await docsRes.json();
        if (Array.isArray(docs)) {
          const d = docs.find((x: Doc) => x.id === docId) || null;
          setDoc(d);
          if (d) setDocNotes(d.notes || "");
          setOtherDocs(docs.filter((x: Doc) => x.id !== docId && x.status === "ready"));
          // Back-compat redirect: deposition docs go to the deposition view
          if (d?.documentKind === "deposition") {
            router.replace(`/matters/${matterId}/documents/${docId}/deposition`);
            return;
          }
        }
        if (resultRes.ok) {
          const r = await resultRes.json();
          setResult(r);
          setFlags(r.flags ?? []);
        }
      } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
      finally { setLoading(false); }
    }
    load();
  }, [matterId, docId]);

  useEffect(() => {
    if (!highlightFlagId || loading) return;
    const el = flagRefs.current.get(highlightFlagId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.style.transition = "background-color 0.3s";
      el.style.backgroundColor = "var(--accent-light)";
      setTimeout(() => { el.style.backgroundColor = ""; }, 2000);
    }
  }, [highlightFlagId, loading]);

  async function saveDocNotes() {
    setEditingNotes(false);
    await fetch("/api/documents/notes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: docId, notes: docNotes }) });
  }

  async function submitFlag(issueId: string, issueTitle: string) {
    setFlagging(true);
    try {
      const text = popoverNote.trim() || issueTitle;
      const res = await fetch(`/api/documents/${docId}/flags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: popoverType, text, location: issueId }),
      });
      if (res.ok) { const flag: Flag = await res.json(); setFlags((prev) => [flag, ...prev]); setNewFlagId(flag.id); setTimeout(() => setNewFlagId(null), 2000); }
    } finally {
      setFlagging(false);
      setOpenPopover(null);
      setPopoverNote("");
      setPopoverType("follow_up");
    }
  }

  async function toggleResolved(flagId: string) {
    const flag = flags.find((f) => f.id === flagId);
    if (!flag) return;
    const res = await fetch(`/api/flags/${flagId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resolved: !flag.resolved }) });
    if (res.ok) { const updated: Flag = await res.json(); setFlags((prev) => prev.map((f) => (f.id === flagId ? updated : f))); }
  }

  async function deleteFlag(flagId: string) {
    const res = await fetch(`/api/flags/${flagId}`, { method: "DELETE" });
    if (res.ok || res.status === 204) setFlags((prev) => prev.filter((f) => f.id !== flagId));
  }

  if (loading) return <div className="px-8 py-20 flex items-center justify-center"><Spinner /><span className="ml-3 text-sm text-muted">Loading...</span></div>;
  if (error && !doc) return <div className="px-8 py-20 text-center"><div className="mb-4 px-4 py-3 bg-[#FEE2E2] border border-[#FECACA] rounded-lg inline-flex items-center gap-3"><span className="text-sm text-[#DC2626]">{error}</span><button onClick={() => window.location.reload()} className="text-xs font-medium text-[#DC2626] hover:underline">Retry</button></div></div>;
  if (!doc || !result) return <div className="px-8 py-20 text-center"><p className="text-sm font-medium text-primary">Document or results not found.</p><Link href={`/matters/${matterId}`} className="text-sm text-accent hover:underline mt-2 inline-block">Back to matter</Link></div>;

  const SEV: Record<string, string> = { high: "bg-[#FEE2E2] text-[#DC2626]", medium: "bg-[#FEF3C7] text-[#D97706]", low: "bg-[#D1FAE5] text-[#059669]" };
  const CAT: Record<string, string> = { party: "bg-[#EEF2FF] text-[#4F46E5]", date: "bg-[#EEF2FF] text-[#4F46E5]", amount: "bg-[#EEF2FF] text-[#4F46E5]", event: "bg-[#EEF2FF] text-[#4F46E5]", obligation: "bg-[#EEF2FF] text-[#4F46E5]", other: "bg-[#EEF2FF] text-[#4F46E5]" };
  const SIG: Record<string, string> = { critical: "bg-[#FEE2E2] text-[#DC2626]", important: "bg-[#FEF3C7] text-[#D97706]", contextual: "bg-[#D1FAE5] text-[#059669]" };
  const IMP: Record<string, string> = { required: "bg-[#FEE2E2] text-[#DC2626]", helpful: "bg-[#FEF3C7] text-[#D97706]", optional: "bg-[#D1FAE5] text-[#059669]" };
  const CONF: Record<string, string> = { high: "text-[#059669]", medium: "text-[#D97706]", low: "text-[#DC2626]" };

  const activeFlags = flags.filter((f) => !f.resolved);
  const resolvedFlags = flags.filter((f) => f.resolved);

  return (
    <div className="px-8 py-8 max-w-[1100px]" onClick={() => openPopover && setOpenPopover(null)}>
      <div className="text-xs text-muted mb-6 flex items-center gap-1.5">
        <Link href="/" className="hover:text-accent transition-colors">Dashboard</Link><span>/</span>
        <Link href={`/matters/${matterId}`} className="hover:text-accent transition-colors">{matter?.name || "Matter"}</Link><span>/</span>
        <span className="text-primary">{doc.fileName}</span>
      </div>

      {error && <div className="mb-4 px-4 py-3 bg-[#FEE2E2] border border-[#FECACA] rounded-lg"><span className="text-sm text-[#DC2626]">{error}</span></div>}

      {doc.ocrQuality === "low" && (
        <div className="mb-4 px-4 py-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-lg flex items-start gap-3">
          <span className="text-[#D97706] text-lg leading-none flex-shrink-0 mt-0.5">⚠</span>
          <p className="text-sm text-[#92400E]">
            <span className="font-semibold">Low-quality scan detected.</span> AI analysis may be less reliable for this document. Consider re-scanning at higher resolution if critical details are missing.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold text-primary">{doc.fileName}</h1>
            {(doc.extractionMethod === "ocr" || doc.extractionMethod === "mixed") && (
              <span
                title={`Text extracted via OCR${doc.ocrConfidence !== undefined ? ` (avg confidence: ${doc.ocrConfidence}%)` : ""}. Minor transcription errors may be present — verify critical details against the source.`}
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border cursor-default select-none ${
                  doc.ocrQuality === "low"
                    ? "bg-[#FEF3C7] text-[#D97706] border-[#FDE68A]"
                    : "bg-[#F4F4F4] text-[#767676] border-[#E8E8E8]"
                }`}
              >
                OCR
              </span>
            )}
            <button
              onClick={async () => {
                const nextKind = doc.documentKind === "deposition" ? "standard" : "deposition";
                await fetch(`/api/documents/${docId}/kind`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ documentKind: nextKind }),
                });
                window.location.reload();
              }}
              title="Click to toggle document kind and re-process"
              className={`text-[10px] font-semibold px-2 py-0.5 rounded cursor-pointer transition-opacity hover:opacity-80 ${doc.documentKind === "deposition" ? "bg-emerald-100 text-emerald-700" : "bg-[#F3F4F6] text-muted"}`}
            >
              {doc.documentKind === "deposition" ? "Deposition" : "Standard Document"}
            </button>
          </div>
          <p className="text-sm text-muted mt-0.5">Document Intelligence Report</p>
        </div>
        <div className="flex items-center gap-3">
          {otherDocs.length > 0 ? (
            <button
              onClick={() => setShowCompare(true)}
              className="px-4 py-2 text-sm font-medium text-charcoal bg-white border border-border rounded-[6px] hover:bg-surface transition-colors"
            >
              Compare Documents
            </button>
          ) : (
            <button
              disabled
              title="Upload at least one other ready document to enable comparison."
              className="px-4 py-2 text-sm font-medium text-muted bg-[#F3F4F6] border border-border rounded-[6px] cursor-not-allowed"
            >
              Compare Documents
            </button>
          )}
          <Link href={`/matters/${matterId}/documents/${docId}/workspace`} className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-[6px] hover:bg-accent-hover transition-colors hover-lift btn-press">
            Open Workspace &rarr;
          </Link>
        </div>
      </div>

      <div className="mb-6">
        {editingNotes ? (
          <textarea value={docNotes} onChange={(e) => setDocNotes(e.target.value)} onBlur={saveDocNotes} autoFocus rows={2}
            className="w-full px-3 py-2 border border-border rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent bg-white" placeholder="Add a note..." />
        ) : (
          <div onClick={() => setEditingNotes(true)} className="px-3 py-2 border border-transparent rounded-[6px] text-sm text-charcoal cursor-pointer hover:border-border hover:bg-surface transition-colors min-h-[36px]">
            {docNotes ? <span>{docNotes}</span> : <span className="text-muted">Add a note...</span>}
          </div>
        )}
      </div>

      {showCompare && (
        <div className="fixed inset-0 bg-black/20 z-30 flex items-start justify-center pt-24" onClick={() => setShowCompare(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-surface border border-border rounded-lg p-6 w-full max-w-md shadow-lg">
            <h2 className="text-base font-semibold text-primary mb-4">Select document to compare</h2>
            <div className="space-y-2">
              {otherDocs.map((d) => (
                <Link key={d.id} href={`/matters/${matterId}/compare?docA=${docId}&docB=${d.id}`}
                  className="block px-3 py-2.5 border border-border rounded-[6px] text-sm hover:bg-accent-light hover:border-accent/30 transition-colors">
                  {d.fileName}
                </Link>
              ))}
            </div>
            <button onClick={() => setShowCompare(false)} className="mt-4 text-sm text-muted hover:text-charcoal">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-6 animate-card-stagger">
        <Card title="Summary">
          <p className="text-sm text-charcoal leading-relaxed">{result.summary}</p>
          <Disclaimer text={result.disclaimer} />
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card title="Key Issues" count={result.keyIssues.length}>
            {result.keyIssues.length === 0 ? <p className="text-sm text-muted">No key issues identified.</p> : (
              <div className="space-y-3">{result.keyIssues.map((issue, idx) => {
                const isOpen = openPopover === issue.id;
                const alreadyFlagged = activeFlags.some((f) => f.location === issue.id && f.source === "manual");
                return (
                  <div key={`issue-${idx}-${issue.id ?? ""}`} className="flex gap-2">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 h-fit mt-0.5 ${SEV[issue.severity]}`}>{issue.severity.toUpperCase()}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-primary">{issue.title}</p>
                      <p className="text-sm text-charcoal mt-0.5 leading-relaxed">{issue.description}</p>
                      {issue.pageRef && <p className="text-xs text-muted mt-1">Ref: {issue.pageRef}</p>}
                    </div>
                    <div className="relative flex-shrink-0 mt-0.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => { setOpenPopover(isOpen ? null : issue.id); setPopoverType("follow_up"); setPopoverNote(""); }}
                        className={`text-sm transition-colors ${alreadyFlagged ? "text-[#4F46E5]" : "text-muted hover:text-[#4F46E5]"}`}
                        title="Add flag"
                      >
                        &#9873;
                      </button>
                      {isOpen && (
                        <div className="absolute right-0 top-6 z-20 w-56 bg-white border border-border rounded-lg shadow-lg p-3 space-y-2">
                          <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">Add Flag</p>
                          <select value={popoverType} onChange={(e) => setPopoverType(e.target.value as FlagType)}
                            className="w-full px-2 py-1.5 text-xs border border-border rounded-[4px] focus:outline-none focus:ring-1 focus:ring-accent bg-white">
                            {FLAG_TYPES.map((t) => <option key={t} value={t}>{FLAG_LABEL[t]}</option>)}
                          </select>
                          <input type="text" value={popoverNote} onChange={(e) => setPopoverNote(e.target.value)}
                            placeholder="Note (optional)" onKeyDown={(e) => e.key === "Enter" && submitFlag(issue.id, issue.title)}
                            className="w-full px-2 py-1.5 text-xs border border-border rounded-[4px] focus:outline-none focus:ring-1 focus:ring-accent bg-white" />
                          <button disabled={flagging} onClick={() => submitFlag(issue.id, issue.title)}
                            className="w-full px-2 py-1.5 bg-accent text-white text-xs font-medium rounded-[4px] hover:bg-accent-hover transition-colors disabled:opacity-50">
                            {flagging ? "Flagging..." : "Flag"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}</div>
            )}
            <Disclaimer text={result.disclaimer} />
          </Card>

          <Card title="Extracted Facts" count={result.extractedFacts.length}>
            {result.extractedFacts.length === 0 ? <p className="text-sm text-muted">No facts extracted.</p> : (
              <div className="space-y-2">{result.extractedFacts.map((fact, i) => (
                <div key={`fact-${i}-${fact.id ?? ""}`} className={`flex items-start gap-2 px-2 py-1.5 rounded ${i % 2 === 1 ? "bg-row-alt" : ""}`}>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${CAT[fact.category] || CAT.other}`}>{fact.category.toUpperCase()}</span>
                  <p className="text-sm text-charcoal flex-1">{fact.fact}</p>
                  <span className={`text-lg leading-none flex-shrink-0 ${CONF[fact.confidence]}`} title={`${fact.confidence} confidence`}>&#9679;</span>
                </div>
              ))}</div>
            )}
            <Disclaimer text={result.disclaimer} />
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card title="Timeline" count={result.timeline.length}>
            {result.timeline.length === 0 ? <p className="text-sm text-muted">No timeline events identified.</p> : (
              <div className="space-y-0 border-l-2 border-accent/20 ml-2 pl-4">
                {[...result.timeline].sort((a, b) => a.date.localeCompare(b.date)).map((event, idx) => (
                  <div key={`event-${idx}-${event.id ?? ""}`} className="relative pb-4 last:pb-0">
                    <div className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-accent border-2 border-surface" />
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-mono text-muted">{event.date}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${SIG[event.significance]}`}>{event.significance.toUpperCase()}</span>
                    </div>
                    <p className="text-sm text-charcoal leading-relaxed">{event.description}</p>
                  </div>
                ))}
              </div>
            )}
            <Disclaimer text={result.disclaimer} />
          </Card>

          <Card title="Missing Information" count={result.missingInformation.length}>
            {result.missingInformation.length === 0 ? <p className="text-sm text-muted">No missing information identified.</p> : (
              <div className="space-y-2">{result.missingInformation.map((info, idx) => (
                <div key={`missing-${idx}-${info.id ?? ""}`} className="flex items-start gap-2">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${IMP[info.importance]}`}>{info.importance.toUpperCase()}</span>
                  <p className="text-sm text-charcoal">{info.description}</p>
                </div>
              ))}</div>
            )}
            <Disclaimer text={result.disclaimer} />
          </Card>
        </div>

        {/* Flags panel */}
        <Card title="Flags" count={activeFlags.length}>
          {flags.length === 0 ? (
            <p className="text-sm text-muted">No flags yet. Click &#9873; next to a key issue to flag it. Missing info is auto-flagged during processing.</p>
          ) : (
            <div className="space-y-4">
              {FLAG_TYPES.map((type) => {
                const group = activeFlags.filter((f) => f.type === type);
                if (group.length === 0) return null;
                return (
                  <div key={type}>
                    <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">{FLAG_LABEL[type]}</p>
                    <div className="space-y-1.5">
                      {group.map((flag) => (
                        <div key={flag.id} ref={(el) => { if (el) flagRefs.current.set(flag.id, el); else flagRefs.current.delete(flag.id); }}
                          className={`flex items-start gap-2 px-3 py-2 rounded-[6px] border border-border bg-white${flag.id === newFlagId ? " flag-flash" : ""}`}>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${FLAG_COLOR[flag.type]}`}>{FLAG_LABEL[flag.type]}</span>
                          <p className="text-xs text-charcoal flex-1 leading-relaxed">{flag.text}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${flag.source === "auto" ? "bg-[#F3F4F6] text-muted" : "bg-[#EEF2FF] text-[#4F46E5]"}`}>{flag.source}</span>
                          <input type="checkbox" checked={flag.resolved} onChange={() => toggleResolved(flag.id)} title="Mark resolved" className="mt-0.5 flex-shrink-0 cursor-pointer accent-accent" />
                          <button onClick={() => deleteFlag(flag.id)} className="text-muted hover:text-[#DC2626] transition-colors flex-shrink-0 text-xs mt-0.5 leading-none" title="Delete">✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {resolvedFlags.length > 0 && (
                <div>
                  <button onClick={() => setShowResolved((v) => !v)} className="text-xs text-muted hover:text-charcoal transition-colors flex items-center gap-1">
                    <span>{showResolved ? "▾" : "▸"}</span> Resolved ({resolvedFlags.length})
                  </button>
                  {showResolved && (
                    <div className="mt-2 space-y-1.5 opacity-60">
                      {resolvedFlags.map((flag) => (
                        <div key={flag.id} ref={(el) => { if (el) flagRefs.current.set(flag.id, el); else flagRefs.current.delete(flag.id); }}
                          className="flex items-start gap-2 px-3 py-2 rounded-[6px] border border-border bg-white">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${FLAG_COLOR[flag.type]}`}>{FLAG_LABEL[flag.type]}</span>
                          <p className="text-xs text-charcoal flex-1 leading-relaxed line-through">{flag.text}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${flag.source === "auto" ? "bg-[#F3F4F6] text-muted" : "bg-[#EEF2FF] text-[#4F46E5]"}`}>{flag.source}</span>
                          <input type="checkbox" checked={flag.resolved} onChange={() => toggleResolved(flag.id)} title="Mark resolved" className="mt-0.5 flex-shrink-0 cursor-pointer accent-accent" />
                          <button onClick={() => deleteFlag(flag.id)} className="text-muted hover:text-[#DC2626] transition-colors flex-shrink-0 text-xs mt-0.5 leading-none" title="Delete">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Card({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-lg" style={{ boxShadow: "var(--shadow)" }}>
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <h2 className="text-sm font-semibold text-primary">{title}</h2>
        {count !== undefined && <span className="text-[10px] font-medium text-muted bg-row-alt px-1.5 py-0.5 rounded">{count}</span>}
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

function Disclaimer({ text }: { text: string }) {
  return <div className="mt-4 pt-3 border-t border-border"><p className="text-[11px] text-muted italic">{text}</p></div>;
}

function Spinner() {
  return <svg className="animate-spin h-5 w-5 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>;
}
