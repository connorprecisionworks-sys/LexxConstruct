"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { timeAgo } from "@/lib/utils";
import type { DraftEditorHandle } from "@/components/workspace/DraftEditor";

const DraftEditor = dynamic(() => import("@/components/workspace/DraftEditor"), { ssr: false });
const RegenerationModal = dynamic(() => import("@/components/workspace/RegenerationModal"), { ssr: false });
const VersionHistoryPanel = dynamic(() => import("@/components/workspace/VersionHistoryPanel"), { ssr: false });

interface Doc { id: string; fileName: string; documentKind?: string; }
interface Matter { id: string; name: string; }
interface DraftRecord { id: string; title: string; draftType: string; content: string; disclaimer: string; createdAt: string; updatedAt: string; }

interface Output {
  id: string;
  type: "answer" | "draft";
  label: string;
  content: string;
  disclaimer: string;
  draftId?: string;
  editing?: boolean;
  editContent?: string;
  saved?: boolean;
  savedMsg?: string;
  showHistory?: boolean;
}

const DISCLAIMER = "This output is not legal advice and requires attorney review before any action is taken.";

const ALL_ACTIONS = [
  { key: "ask", label: "Ask a Question", desc: "Query the document directly", depositionOnly: false },
  { key: "deposition_summary_memo", label: "Deposition Summary Memo", desc: "Internal memo summarizing testimony with key admissions and recommendations", depositionOnly: true },
  { key: "cross_examination_outline", label: "Cross-Examination Outline", desc: "Topic-by-topic outline with leading questions for cross-examination", depositionOnly: true },
  { key: "witness_prep_outline", label: "Witness Prep Outline", desc: "Preparation guide covering background, prior statements, and attack areas", depositionOnly: true },
  { key: "draft_claim_letter", label: "Draft Claim Letter", desc: "Formal notice of claim for time or compensation under contract notice provisions", depositionOnly: false },
  { key: "draft_summary", label: "Draft Case Summary", desc: "Internal summary memo for attorney review", depositionOnly: false },
  { key: "draft_mediation_brief", label: "Draft Mediation Brief Outline", desc: "Outline for a pre-mediation position paper", depositionOnly: false },
  { key: "draft_deposition_outline", label: "Draft Deposition Outline", desc: "Witness deposition outline based on case documents", depositionOnly: false },
  { key: "draft_delay_narrative", label: "Draft Delay Narrative", desc: "Narrative description of delay events for expert handoff", depositionOnly: false },
  { key: "draft_defect_summary", label: "Draft Defect Summary", desc: "Summary of defect allegations with document citations", depositionOnly: false },
  { key: "draft_motion", label: "Draft Motion Outline", desc: "Outline for summary judgment or other motions", depositionOnly: false },
  { key: "draft_client_update", label: "Draft Client Update", desc: "Client-facing status update email in plain English", depositionOnly: false },
];

// For "as const" type compatibility, we compute the visible ACTIONS array at render time based on doc kind
// (see usage below)

const DRAFT_TYPE_BADGE: Record<string, string> = {
  draft_claim_letter: "Claim Letter",
  draft_summary: "Case Summary",
  draft_mediation_brief: "Mediation Brief",
  draft_deposition_outline: "Deposition Outline",
  draft_delay_narrative: "Delay Narrative",
  draft_defect_summary: "Defect Summary",
  draft_motion: "Motion",
  draft_client_update: "Client Update",
  deposition_summary_memo: "Deposition Memo",
  cross_examination_outline: "Cross-Exam Outline",
  witness_prep_outline: "Witness Prep",
};

interface RegenerationState {
  outputId: string;
  selectedText: string;
  from: number;
  to: number;
  isOpen: boolean;
  isLoading: boolean;
  variants: string[] | null;
}

export default function Workspace() {
  const params = useParams<{ id: string; docId: string }>();
  const matterId = params?.id ?? "";
  const docId = params?.docId ?? "";
  const [doc, setDoc] = useState<Doc | null>(null);
  const [matter, setMatter] = useState<Matter | null>(null);
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState("");
  const [processing, setProcessing] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [previousDrafts, setPreviousDrafts] = useState<DraftRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [regen, setRegen] = useState<RegenerationState | null>(null);

  // Per-output editor refs
  const editorRefs = useRef<Map<string, DraftEditorHandle>>(new Map());

  useEffect(() => {
    async function load() {
      try {
        const [mattersRes, docsRes, draftsRes] = await Promise.all([
          fetch("/api/matters"), fetch(`/api/documents?matterId=${matterId}`), fetch(`/api/drafts?documentId=${docId}`),
        ]);
        const matters = await mattersRes.json();
        if (Array.isArray(matters)) setMatter(matters.find((m: Matter) => m.id === matterId) || null);
        const docs = await docsRes.json();
        if (Array.isArray(docs)) setDoc(docs.find((d: Doc) => d.id === docId) || null);
        if (draftsRes.ok) {
          const drafts = await draftsRes.json();
          if (Array.isArray(drafts)) setPreviousDrafts(drafts.sort((a: DraftRecord, b: DraftRecord) => b.createdAt.localeCompare(a.createdAt)));
        }
      } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
      finally { setLoading(false); }
    }
    load();
  }, [matterId, docId]);

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || processing) return;
    setProcessing(true); setActiveAction("ask");
    try {
      const res = await fetch("/api/workspace/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: docId, question, threadId }) });
      const data = await res.json();
      if (data.threadId) setThreadId(data.threadId);
      setOutputs((prev) => [{ id: crypto.randomUUID(), type: "answer", label: question, content: data.answer, disclaimer: DISCLAIMER }, ...prev]);
      setQuestion("");
    } catch { alert("Failed to get answer."); }
    finally { setProcessing(false); setActiveAction(null); }
  }

  async function handleDraft(actionType: string, label: string) {
    if (processing) return;
    setProcessing(true); setActiveAction(actionType);
    try {
      const res = await fetch("/api/workspace/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: docId, actionType }) });
      const data = await res.json();
      setOutputs((prev) => [{ id: crypto.randomUUID(), type: "draft", label, content: data.content, disclaimer: data.disclaimer || DISCLAIMER, draftId: data.id }, ...prev]);
      const dRes = await fetch(`/api/drafts?documentId=${docId}`);
      if (dRes.ok) { const d = await dRes.json(); if (Array.isArray(d)) setPreviousDrafts(d.sort((a: DraftRecord, b: DraftRecord) => b.createdAt.localeCompare(a.createdAt))); }
    } catch { alert("Failed to generate draft."); }
    finally { setProcessing(false); setActiveAction(null); }
  }

  function handleActionClick(key: string, label: string) {
    if (key === "ask") { setSelectedAction("ask"); } else { handleDraft(key, label); }
  }

  function loadPreviousDraft(draft: DraftRecord) {
    setOutputs((prev) => [{ id: crypto.randomUUID(), type: "draft", label: draft.title, content: draft.content, disclaimer: draft.disclaimer, draftId: draft.id }, ...prev]);
  }

  function startEdit(outputId: string) {
    setOutputs((prev) => prev.map((o) => o.id === outputId ? { ...o, editing: true, editContent: o.content } : o));
  }

  function updateEditContent(outputId: string, content: string) {
    setOutputs((prev) => prev.map((o) => o.id === outputId ? { ...o, editContent: content } : o));
  }

  async function saveDraftEdit(outputId: string) {
    const output = outputs.find((o) => o.id === outputId);
    if (!output?.draftId || output.editContent === undefined) return;
    try {
      const res = await fetch(`/api/drafts/${output.draftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: output.editContent }),
      });
      const data = await res.json();
      const versionCount: number = data.versionCount ?? 0;
      const savedMsg = versionCount > 0 ? `Saved (v${versionCount + 1})` : "Saved";
      setOutputs((prev) => prev.map((o) => o.id === outputId ? { ...o, content: o.editContent!, editing: false, saved: true, savedMsg } : o));
      setTimeout(() => setOutputs((prev) => prev.map((o) => o.id === outputId ? { ...o, saved: false, savedMsg: undefined } : o)), 3000);
    } catch { alert("Failed to save."); }
  }

  async function exportDraft(draftId: string) {
    const res = await fetch(`/api/drafts/${draftId}/export?format=docx`, { method: "POST" });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `Lexx-draft.docx`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function copyToClipboard(id: string, text: string) {
    const plain = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    await navigator.clipboard.writeText(plain);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const handleRegenerateParagraph = useCallback(
    async (outputId: string, draftType: string, selectedText: string, from: number, to: number) => {
      setRegen({ outputId, selectedText, from, to, isOpen: true, isLoading: true, variants: null });

      const output = outputs.find((o) => o.id === outputId);
      const editorHandle = editorRefs.current.get(outputId);
      const surroundingContext = editorHandle?.getPlainText()?.slice(0, 500) ?? output?.editContent ?? "";

      try {
        const res = await fetch("/api/drafts/regenerate-paragraph", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draftType, selectedText, surroundingContext }),
        });
        const data = await res.json();
        setRegen((prev) => prev ? { ...prev, isLoading: false, variants: data.variants } : null);
      } catch {
        setRegen((prev) => prev ? { ...prev, isLoading: false, variants: [] } : null);
      }
    },
    [outputs]
  );

  function handleSelectVariant(variant: string) {
    if (!regen) return;
    const { outputId, from, to } = regen;
    const editorHandle = editorRefs.current.get(outputId);
    if (editorHandle) {
      editorHandle.replaceRange(from, to, variant);
      // Sync editContent from editor HTML after replacement
      // The editor's onUpdate callback handles this automatically
    }
    setRegen(null);
  }

  async function handleRestoreVersion(outputId: string, version: { id: string; content: string }) {
    const output = outputs.find((o) => o.id === outputId);
    if (!output?.draftId) return;
    try {
      const res = await fetch(`/api/drafts/${output.draftId}/versions/${version.id}/restore`, { method: "POST" });
      const data = await res.json();
      const restored = data.content;
      setOutputs((prev) => prev.map((o) =>
        o.id === outputId ? { ...o, content: restored, editContent: restored, showHistory: false, saved: true, savedMsg: "Restored" } : o
      ));
      setTimeout(() => setOutputs((prev) => prev.map((o) => o.id === outputId ? { ...o, saved: false, savedMsg: undefined } : o)), 3000);
    } catch { alert("Failed to restore version."); }
  }

  if (loading) return <div className="px-8 py-20 flex items-center justify-center"><Spinner /><span className="ml-3 text-sm text-muted">Loading workspace...</span></div>;

  return (
    <div className="px-8 py-8 max-w-[1200px]">
      <div className="text-xs text-muted mb-6 flex items-center gap-1.5">
        <Link href="/" className="hover:text-accent transition-colors">Dashboard</Link><span>/</span>
        <Link href={`/matters/${matterId}`} className="hover:text-accent transition-colors">{matter?.name || "Matter"}</Link><span>/</span>
        <Link href={`/matters/${matterId}/documents/${docId}`} className="hover:text-accent transition-colors">{doc?.fileName || "Document"}</Link><span>/</span>
        <span className="text-primary">Workspace</span>
      </div>

      {error && <div className="mb-4 px-4 py-3 bg-[#FEE2E2] border border-[#FECACA] rounded-lg"><span className="text-sm text-[#DC2626]">{error}</span></div>}

      <div className="mb-8">
        <h1 className="text-xl font-semibold text-primary">AI Workspace</h1>
        <p className="text-sm text-muted mt-0.5">{doc?.fileName || "Document"}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Left */}
        <div className="space-y-4">
          <div>
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3 px-1">Actions</h3>
            <div className="space-y-2">
              {(doc?.documentKind === "deposition"
                ? ALL_ACTIONS
                : ALL_ACTIONS.filter((a) => !a.depositionOnly)
              ).map((action) => (
                <button key={action.key} onClick={() => handleActionClick(action.key, action.label)} disabled={processing}
                  className={`w-full text-left px-3 py-3 border rounded-[6px] transition-all disabled:opacity-50 ${selectedAction === action.key ? "border-accent bg-accent-light" : "border-border bg-surface hover:border-accent/30 hover:bg-accent-light/50"}`}
                  style={{ boxShadow: "var(--shadow)" }}>
                  {activeAction === action.key ? <span className="flex items-center gap-2 text-sm text-accent"><Spinner /> Generating...</span> : (
                    <><span className="text-sm font-medium text-primary block">{action.label}</span><span className="text-[11px] text-muted block mt-0.5">{action.desc}</span></>
                  )}
                </button>
              ))}
            </div>
          </div>

          {selectedAction === "ask" && (
            <form onSubmit={handleAsk} className="space-y-2">
              <textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What are the contract notice requirements for delay claims?" rows={3} autoFocus
                className="w-full px-3 py-2 border border-border rounded-[6px] text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent bg-white" />
              <button type="submit" disabled={!question.trim() || processing}
                className="w-full px-3 py-2 bg-accent text-white text-sm font-medium rounded-[6px] hover:bg-accent-hover transition-colors disabled:opacity-50">
                {activeAction === "ask" ? <><Spinner /> Asking...</> : "Submit Question"}
              </button>
            </form>
          )}

          {previousDrafts.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3 px-1">Previous Drafts</h3>
              <div className="space-y-1.5">
                {previousDrafts.map((d) => (
                  <button key={d.id} onClick={() => loadPreviousDraft(d)}
                    className="w-full text-left px-3 py-2 border border-border rounded-[6px] bg-surface hover:bg-accent-light/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#F3E8FF] text-[#7C3AED]">{DRAFT_TYPE_BADGE[d.draftType] || d.title}</span>
                    </div>
                    <p className="text-[11px] text-muted mt-1">{timeAgo(d.createdAt)}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right */}
        <div>
          {outputs.length === 0 && !processing ? (
            <div className="bg-surface border border-border rounded-lg py-20 text-center" style={{ boxShadow: "var(--shadow)" }}>
              <p className="text-sm text-muted">Select an action to get started</p>
            </div>
          ) : (
            <div className="space-y-4">
              {processing && outputs.length === 0 && (
                <div className="bg-surface border border-border rounded-lg p-8 flex items-center justify-center gap-3" style={{ boxShadow: "var(--shadow)" }}>
                  <Spinner /><span className="text-sm text-muted">Generating...</span>
                </div>
              )}
              {outputs.map((output) => (
                <div key={output.id} className="bg-surface border border-border rounded-lg" style={{ boxShadow: "var(--shadow)" }}>
                  <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${output.type === "answer" ? "bg-[#EEF2FF] text-[#4F46E5]" : "bg-[#F3E8FF] text-[#7C3AED]"}`}>
                        {output.type === "answer" ? "Q&A" : "DRAFT"}
                      </span>
                      <span className="text-sm font-medium text-primary truncate max-w-sm">{output.label}</span>
                      {output.saved && <span className="text-[11px] text-[#059669] font-medium toast-fade">{output.savedMsg || "Saved"}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {output.type === "draft" && output.draftId && !output.editing && (
                        <>
                          <button onClick={() => startEdit(output.id)} className="text-[11px] text-muted hover:text-accent transition-colors">Edit</button>
                          <button onClick={() => exportDraft(output.draftId!)} className="text-[11px] text-muted hover:text-accent transition-colors">Export Word</button>
                        </>
                      )}
                      {output.editing && output.draftId && (
                        <>
                          <button
                            onClick={() => setOutputs((prev) => prev.map((o) => o.id === output.id ? { ...o, showHistory: !o.showHistory } : o))}
                            className="text-[11px] text-muted hover:text-accent transition-colors"
                          >
                            History
                          </button>
                          <button onClick={() => saveDraftEdit(output.id)} className="text-[11px] font-medium text-accent hover:text-accent-hover transition-colors">Save Draft</button>
                        </>
                      )}
                      <button onClick={() => copyToClipboard(output.id, output.editing ? (output.editContent || output.content) : output.content)}
                        className="text-[11px] text-muted hover:text-accent transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-accent-light">
                        {copiedId === output.id ? (
                          <><svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>Copied</>
                        ) : (
                          <><svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" /></svg>Copy</>
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="px-4 py-4">
                    {output.editing ? (
                      <DraftEditor
                        key={output.draftId}
                        value={output.editContent ?? output.content}
                        onChange={(html) => updateEditContent(output.id, html)}
                        onRegenerateParagraph={(selectedText, from, to) => {
                          const draftType = previousDrafts.find((d) => d.id === output.draftId)?.draftType ?? "legal_document";
                          handleRegenerateParagraph(output.id, draftType, selectedText, from, to);
                        }}
                        ref={(handle) => {
                          if (handle) editorRefs.current.set(output.id, handle);
                          else editorRefs.current.delete(output.id);
                        }}
                      />
                    ) : (
                      <div
                        className="text-sm text-charcoal leading-relaxed prose-preview"
                        dangerouslySetInnerHTML={{ __html: output.content }}
                      />
                    )}
                    <div className="mt-4 pt-3 border-t border-border"><p className="text-[11px] text-muted italic">{output.disclaimer}</p></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Regeneration modal */}
      {regen && (
        <RegenerationModal
          isOpen={regen.isOpen}
          isLoading={regen.isLoading}
          variants={regen.variants}
          onSelect={handleSelectVariant}
          onClose={() => setRegen(null)}
        />
      )}

      {/* Version history panels */}
      {outputs.map((output) =>
        output.showHistory && output.draftId ? (
          <VersionHistoryPanel
            key={`history-${output.id}`}
            draftId={output.draftId}
            isOpen={true}
            onClose={() => setOutputs((prev) => prev.map((o) => o.id === output.id ? { ...o, showHistory: false } : o))}
            onRestore={(version) => handleRestoreVersion(output.id, version)}
          />
        ) : null
      )}
    </div>
  );
}

function Spinner() {
  return <svg className="animate-spin h-4 w-4 text-accent inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>;
}
