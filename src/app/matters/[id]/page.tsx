"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { timeAgo } from "@/lib/utils";
import type { FlagType } from "@/types";
import { ProcessingStepper } from "@/components/ProcessingStepper";
import { UploadQueuePanel } from "@/components/UploadQueuePanel";
import { useUploadQueue } from "@/hooks/useUploadQueue";
import { ChatPanel } from "@/components/ChatPanel";

interface Matter { id: string; name: string; clientName: string; matterType: string; status: string; notes: string; createdAt: string; caseIntelligence?: CaseIntelligence; }
interface Doc { id: string; fileName: string; fileType: string; fileSize: number; status: "uploading" | "processing" | "ready" | "error"; processingStage?: string; uploadedAt: string; documentKind?: string; }
interface MatterFlag { id: string; documentId: string; documentFileName: string; type: FlagType; source: "auto" | "manual"; text: string; createdAt: string; resolved: boolean; }
interface ContradictionItem {
  topic: string;
  documentA: { id: string; statement: string };
  documentB: { id: string; statement: string };
  severity: string;
  explanation?: string;
}
interface ChecklistResult {
  item: { id: string; label: string; description: string; required: boolean };
  status: "present" | "missing";
  matchedDocuments: string[];
}
interface CaseIntelligence {
  caseOverview: string;
  unifiedTimeline: { date: string; description: string; source: string; significance: string }[];
  factConsistency: ContradictionItem[];
  checklist: ChecklistResult[];
  disclaimer: string;
  builtAt?: string;
}

const STATUS_CYCLE: Record<string, string> = { active: "on_hold", on_hold: "closed", closed: "active" };
const STATUS_BADGE: Record<string, string> = { active: "bg-[#D1FAE5] text-[#059669]", on_hold: "bg-[#FEF3C7] text-[#D97706]", closed: "bg-[#F3F4F6] text-[#6B7280]" };
const STATUS_LABEL: Record<string, string> = { active: "Active", on_hold: "On Hold", closed: "Closed" };
const DOC_STATUS_BADGE: Record<string, string> = { ready: "bg-[#D1FAE5] text-[#059669]", processing: "bg-[#FEF3C7] text-[#D97706]", uploading: "bg-accent-light text-accent", error: "bg-[#FEE2E2] text-[#DC2626]" };

const FLAG_TYPES: FlagType[] = ["contradiction", "missing_info", "follow_up", "key_evidence", "deadline"];
const FLAG_LABEL: Record<FlagType, string> = { contradiction: "Contradiction", missing_info: "Missing Info", follow_up: "Follow Up", key_evidence: "Key Evidence", deadline: "Deadline" };
const FLAG_COLOR: Record<FlagType, string> = {
  contradiction: "bg-[#FEE2E2] text-[#DC2626]",
  missing_info: "bg-[#FEF3C7] text-[#D97706]",
  follow_up: "bg-[#EEF2FF] text-[#4F46E5]",
  key_evidence: "bg-[#D1FAE5] text-[#059669]",
  deadline: "bg-[#FFE4E6] text-[#E11D48]",
};

export default function MatterDetail() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [matter, setMatter] = useState<Matter | null>(null);
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [dropToast, setDropToast] = useState<string | null>(null);
  const dropToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { queue, enqueue, cancel, dismiss, sessionStats } = useUploadQueue();
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState("");
  const [caseIntel, setCaseIntel] = useState<CaseIntelligence | null>(null);
  const [buildingIntel, setBuildingIntel] = useState(false);
  const [intelStage, setIntelStage] = useState(0);
  const intelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [matterFlags, setMatterFlags] = useState<MatterFlag[]>([]);
  const [flagTypeFilter, setFlagTypeFilter] = useState<FlagType | null>(null);
  const [showResolvedFlags, setShowResolvedFlags] = useState(false);
  const [depositionSummaries, setDepositionSummaries] = useState<Array<{ docId: string; witnessName: string; witnessRole: string; depositionDate: string; admissionsCount: number }>>([]);
  const [showChat, setShowChat] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [matterDraftsCount, setMatterDraftsCount] = useState(0);
  const router = useRouter();

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [mattersRes, docsRes, flagsRes] = await Promise.all([
        fetch("/api/matters"),
        fetch(`/api/documents?matterId=${id}`),
        fetch(`/api/matters/${id}/flags`),
      ]);
      const matters = await mattersRes.json();
      const m = Array.isArray(matters) ? matters.find((x: Matter) => x.id === id) || null : null;
      setMatter(m);
      if (m) {
        setNotes(m.notes || "");
        if (m.caseIntelligence) setCaseIntel(m.caseIntelligence);
      }
      const docs: Doc[] = await docsRes.json();
      setDocuments(Array.isArray(docs) ? docs : []);
      if (flagsRes.ok) {
        const flags = await flagsRes.json();
        setMatterFlags(Array.isArray(flags) ? flags : []);
      }

      // Fetch deposition analyses for ready deposition docs (in parallel, skip failures)
      if (Array.isArray(docs)) {
        const depoDocs = docs.filter((d) => d.documentKind === "deposition" && d.status === "ready");
        const depoResults = await Promise.all(
          depoDocs.map(async (d) => {
            try {
              const r = await fetch(`/api/documents/${d.id}/deposition`);
              if (!r.ok) return null;
              const analysis = await r.json();
              return {
                docId: d.id,
                witnessName: analysis.witnessName || d.fileName,
                witnessRole: analysis.witnessRole || "",
                depositionDate: analysis.depositionDate || "",
                admissionsCount: (analysis.keyAdmissions || []).length,
              };
            } catch { return null; }
          })
        );
        setDepositionSummaries(depoResults.filter(Boolean) as typeof depositionSummaries);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Poll while documents are processing
  useEffect(() => {
    const hasProcessing = documents.some((d) => d.status === "processing" || d.status === "uploading");
    if (!hasProcessing) return;
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [documents, fetchData]);

  async function cycleStatus() {
    if (!matter) return;
    const next = STATUS_CYCLE[matter.status] || "active";
    await fetch("/api/matters", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: next }) });
    setMatter({ ...matter, status: next });
  }

  async function saveNotes() {
    setEditingNotes(false);
    await fetch("/api/matters", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, notes }) });
  }

  // Refresh documents whenever a queue item completes
  const prevQueueRef = useRef<typeof queue>([]);
  useEffect(() => {
    const newlyDone = queue.filter((item) => {
      if (item.status !== "done") return false;
      const prev = prevQueueRef.current.find((p) => p.id === item.id);
      return prev && prev.status !== "done";
    });
    if (newlyDone.length > 0) fetchData();
    prevQueueRef.current = [...queue];
  }, [queue, fetchData]);

  // Warn on browser navigation when uploads are in progress
  useEffect(() => {
    const hasActive = queue.some((i) =>
      i.status === "uploading" || i.status === "extracting" || i.status === "analyzing"
    );
    if (!hasActive) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      return "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [queue]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    enqueue(files, id);
    const label = `${files.length} file${files.length === 1 ? "" : "s"} queued`;
    setDropToast(label);
    if (dropToastTimerRef.current) clearTimeout(dropToastTimerRef.current);
    dropToastTimerRef.current = setTimeout(() => setDropToast(null), 2500);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    enqueue(files, id);
    const label = `${files.length} file${files.length === 1 ? "" : "s"} queued`;
    setDropToast(label);
    if (dropToastTimerRef.current) clearTimeout(dropToastTimerRef.current);
    dropToastTimerRef.current = setTimeout(() => setDropToast(null), 2500);
    e.target.value = "";
  }

  async function openDeleteModal() {
    // Fetch draft count for this matter's documents before showing the modal
    try {
      const r = await fetch("/api/drafts");
      if (r.ok) {
        const allDrafts = await r.json();
        const docIds = new Set(documents.map((d) => d.id));
        setMatterDraftsCount(
          Array.isArray(allDrafts)
            ? allDrafts.filter((d: { documentId: string }) => docIds.has(d.documentId)).length
            : 0
        );
      }
    } catch { /* leave at 0 */ }
    setDeleteConfirmText("");
    setShowDeleteModal(true);
  }

  async function handleDelete() {
    if (!matter) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/matters/${matter.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error || "Failed to delete matter.");
        return;
      }
      setToast("Matter deleted.");
      setTimeout(() => router.push("/"), 900);
    } catch {
      alert("Failed to delete matter. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  const INTEL_STAGES = ["Gathering documents", "Extracting timeline", "Detecting contradictions", "Checking case files", "Finalizing analysis"];

  async function buildCaseIntelligence() {
    setBuildingIntel(true);
    setIntelStage(0);
    // Simulate stage advances — actual call is a single GPT request we can't track
    let stage = 0;
    intelTimerRef.current = setInterval(() => {
      stage = Math.min(stage + 1, INTEL_STAGES.length - 1);
      setIntelStage(stage);
    }, 3500);
    try {
      const res = await fetch(`/api/matters/${id}/case-intelligence`, { method: "POST" });
      if (!res.ok) { const d = await res.json(); alert(d.error || "Failed"); return; }
      setCaseIntel(await res.json());
    } catch { alert("Failed to build case intelligence."); }
    finally {
      if (intelTimerRef.current) { clearInterval(intelTimerRef.current); intelTimerRef.current = null; }
      setBuildingIntel(false);
      setIntelStage(0);
    }
  }

  function formatSize(bytes: number) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / 1048576).toFixed(1)} MB`; }
  const readyCount = documents.filter((d) => d.status === "ready").length;

  if (loading) return <div className="px-8 py-20 flex items-center justify-center"><Spinner /><span className="ml-3 text-sm text-muted">Loading...</span></div>;
  if (error && !matter) return <div className="px-8 py-20 text-center"><div className="mb-4 px-4 py-3 bg-[#FEE2E2] border border-[#FECACA] rounded-lg inline-flex items-center gap-3"><span className="text-sm text-[#DC2626]">{error}</span><button onClick={fetchData} className="text-xs font-medium text-[#DC2626] hover:underline">Retry</button></div></div>;
  if (!matter) return <div className="px-8 py-20 text-center"><p className="text-sm font-medium text-primary">Matter not found.</p><Link href="/" className="text-sm text-accent hover:underline mt-2 inline-block">Back to dashboard</Link></div>;

  const SIG_BADGE: Record<string, string> = { critical: "bg-[#FEE2E2] text-[#DC2626]", important: "bg-[#FEF3C7] text-[#D97706]", contextual: "bg-[#D1FAE5] text-[#059669]" };
  const SEV_BADGE: Record<string, string> = { high: "bg-[#FEE2E2] text-[#DC2626]", medium: "bg-[#FEF3C7] text-[#D97706]", low: "bg-[#D1FAE5] text-[#059669]" };

  const visibleFlags = matterFlags.filter((f) => {
    if (!showResolvedFlags && f.resolved) return false;
    if (flagTypeFilter && f.type !== flagTypeFilter) return false;
    return true;
  });
  const activeCount = matterFlags.filter((f) => !f.resolved).length;

  return (
    <div className="px-8 py-8 max-w-[1100px]">
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 bg-[#0A0A0A] text-white text-sm font-medium rounded-lg animate-fade-slide-in" style={{ boxShadow: "var(--shadow-lg)" }}>
          {toast}
        </div>
      )}
      <div className="text-xs text-muted mb-6 flex items-center gap-1.5">
        <Link href="/" className="hover:text-accent transition-colors">Dashboard</Link><span>/</span><span className="text-primary">{matter.name}</span>
      </div>

      {error && <div className="mb-4 px-4 py-3 bg-[#FEE2E2] border border-[#FECACA] rounded-lg flex items-center justify-between"><span className="text-sm text-[#DC2626]">{error}</span><button onClick={fetchData} className="text-xs font-medium text-[#DC2626] hover:underline">Retry</button></div>}

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-primary">{matter.name}</h1>
          <button onClick={cycleStatus} className={`text-[10px] font-semibold px-2 py-0.5 rounded cursor-pointer ${STATUS_BADGE[matter.status] || STATUS_BADGE.active}`}>
            {STATUS_LABEL[matter.status] || "Active"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {readyCount >= 2 && !caseIntel && !buildingIntel && (
            <button onClick={buildCaseIntelligence}
              className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-[6px] hover:bg-accent-hover transition-colors btn-press">
              Build Case Intelligence
            </button>
          )}
          {readyCount > 0 && (
            <button
              onClick={() => setShowChat(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-surface border border-border text-sm font-medium text-charcoal rounded-[6px] hover:border-accent/40 hover:text-accent transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
              </svg>
              Chat
            </button>
          )}
        </div>
      </div>

      {showChat && (
        <ChatPanel
          matterId={id}
          matterName={matter.name}
          documentCount={readyCount}
          onClose={() => setShowChat(false)}
        />
      )}
      <p className="text-sm text-muted mb-4">{matter.clientName}</p>

      {/* Case intelligence build progress */}
      {buildingIntel && (
        <div className="mb-4 px-4 py-3 bg-surface border border-border rounded-lg animate-fade-slide-in" style={{ boxShadow: "var(--shadow)" }}>
          <p className="text-xs font-medium text-charcoal mb-2">Building case intelligence…</p>
          <ProcessingStepper stages={INTEL_STAGES} currentStage={intelStage} />
        </div>
      )}

      {/* Notes */}
      <div className="mb-6">
        {editingNotes ? (
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} autoFocus rows={2}
            className="w-full px-3 py-2 border border-border rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent bg-white" />
        ) : (
          <div onClick={() => setEditingNotes(true)} className="px-3 py-2 border border-transparent rounded-[6px] text-sm text-charcoal cursor-pointer hover:border-border hover:bg-surface transition-colors min-h-[36px]">
            {notes || <span className="text-muted">Add matter notes...</span>}
          </div>
        )}
      </div>

      {/* Upload zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center mb-6 transition-all ${dragOver ? "border-accent bg-accent-light" : "border-border bg-surface hover:border-muted/40"}`}
        style={{ boxShadow: dragOver ? "none" : "var(--shadow)" }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {dropToast ? (
          <p className="text-sm font-medium text-accent">{dropToast}</p>
        ) : dragOver ? (
          <p className="text-sm font-medium text-accent">Drop files to queue</p>
        ) : (
          <>
            <p className="text-sm text-charcoal font-medium">Drop PDF, DOCX, or TXT files here</p>
            <p className="text-xs text-muted mt-1 mb-3">Multiple files supported — or click to browse</p>
            <label className="inline-block px-4 py-2 bg-accent text-white text-sm font-medium rounded-[6px] cursor-pointer hover:bg-accent-hover transition-colors">
              Choose Files
              <input type="file" className="hidden" accept=".pdf,.docx,.txt" multiple onChange={handleFileInput} />
            </label>
          </>
        )}
      </div>

      {/* Upload queue panel */}
      <UploadQueuePanel queue={queue} sessionStats={sessionStats} onCancel={cancel} onDismiss={dismiss} />

      {/* Deposition index section */}
      {depositionSummaries.length > 0 && (
        <div className="mb-6">
          <h2 className="text-base font-semibold text-primary mb-3">Depositions</h2>
          <div className="bg-surface border border-border rounded-lg overflow-hidden mb-6" style={{ boxShadow: "var(--shadow)" }}>
            <div className="grid grid-cols-[1fr_120px_80px_80px_120px] gap-3 px-4 py-2.5 bg-row-alt border-b border-border text-[11px] font-medium text-muted uppercase tracking-wider">
              <span>Witness</span><span>Role</span><span>Date</span><span>Admissions</span><span></span>
            </div>
            {depositionSummaries.map((dep, i) => (
              <div key={dep.docId} className={`grid grid-cols-[1fr_120px_80px_80px_120px] gap-3 px-4 py-3 items-center ${i % 2 === 1 ? "bg-row-alt" : ""}`}>
                <span className="text-sm font-medium text-primary truncate">{dep.witnessName}</span>
                <span className="text-sm text-muted truncate">{dep.witnessRole}</span>
                <span className="text-xs text-muted">{dep.depositionDate || "—"}</span>
                <span className="text-xs text-muted">{dep.admissionsCount}</span>
                <Link href={`/matters/${id}/documents/${dep.docId}/deposition`} className="text-xs font-medium text-accent hover:underline text-right">
                  View Deposition
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Documents table */}
      <h2 className="text-base font-semibold text-primary mb-4">Documents</h2>
      {documents.length === 0 ? (
        <div className="text-center py-10 bg-surface border border-border rounded-lg" style={{ boxShadow: "var(--shadow)" }}><p className="text-sm text-muted">No documents yet. Drop a project document above to start processing.</p></div>
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-hidden mb-6" style={{ boxShadow: "var(--shadow)" }}>
          <div className="grid grid-cols-[1fr_50px_70px_80px_80px_32px] gap-3 px-4 py-2.5 bg-row-alt border-b border-border text-[11px] font-medium text-muted uppercase tracking-wider">
            <span>Filename</span><span>Type</span><span>Size</span><span>Status</span><span>Uploaded</span><span></span>
          </div>
          {documents.map((doc, i) => {
            const isReady = doc.status === "ready";
            const isProcessing = doc.status === "processing" || doc.status === "uploading";
            const isDepo = doc.documentKind === "deposition";
            const DOC_STAGES = isDepo
              ? ["Uploading", "Extracting", "Extracting testimony", "Done"]
              : ["Uploading", "Extracting", "Analyzing", "Done"];
            const stageIndex = doc.processingStage === "uploading" ? 0 : doc.processingStage === "extracting" ? 1 : doc.processingStage === "analyzing" ? 2 : doc.processingStage === "done" ? 3 : isProcessing ? 1 : 3;
            const docHref = isDepo
              ? `/matters/${id}/documents/${doc.id}/deposition`
              : `/matters/${id}/documents/${doc.id}`;
            const cls = `px-4 py-3 transition-colors ${isReady ? "hover:bg-accent-light/50 cursor-pointer" : ""} ${i % 2 === 1 ? "bg-row-alt" : ""}`;
            const header = (
              <div className="grid grid-cols-[1fr_50px_70px_80px_80px_32px] gap-3 items-center">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium text-primary truncate">{doc.fileName}</span>
                  {isDepo && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 flex-shrink-0">Depo</span>}
                </div>
                <span className="text-xs text-muted uppercase">{doc.fileType}</span>
                <span className="text-sm text-muted">{formatSize(doc.fileSize)}</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded w-fit ${DOC_STATUS_BADGE[doc.status] || ""}`}>
                  {isProcessing && <span className="soft-pulse mr-1 inline-block">&#9679;</span>}{doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
                </span>
                <span className="text-xs text-muted">{timeAgo(doc.uploadedAt)}</span>
                {isReady ? <svg className="h-4 w-4 text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg> : <span />}
              </div>
            );
            const inner = (<>
              {header}
              {isProcessing && (
                <div className="mt-2 pl-0.5">
                  <ProcessingStepper stages={DOC_STAGES} currentStage={stageIndex} />
                </div>
              )}
            </>);
            return isReady
              ? <Link key={doc.id} href={docHref} className={cls}>{inner}</Link>
              : <div key={doc.id} className={cls}>{inner}</div>;
          })}
        </div>
      )}

      {/* Flags section */}
      <div className="mb-6 bg-surface border border-border rounded-lg" style={{ boxShadow: "var(--shadow)" }}>
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-primary">Flags</h2>
            {activeCount > 0 && <span className="text-[10px] font-medium text-muted bg-row-alt px-1.5 py-0.5 rounded">{activeCount}</span>}
          </div>
          <button onClick={() => setShowResolvedFlags((v) => !v)} className={`text-xs px-2 py-1 rounded-[4px] border transition-colors ${showResolvedFlags ? "border-accent bg-accent-light text-accent" : "border-border text-muted hover:text-charcoal"}`}>
            Show resolved
          </button>
        </div>
        <div className="p-4">
          {/* Type filter chips */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            <button onClick={() => setFlagTypeFilter(null)}
              className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${flagTypeFilter === null ? "border-accent bg-accent-light text-accent" : "border-border text-muted hover:text-charcoal"}`}>
              All
            </button>
            {FLAG_TYPES.map((t) => (
              <button key={t} onClick={() => setFlagTypeFilter(flagTypeFilter === t ? null : t)}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${flagTypeFilter === t ? `${FLAG_COLOR[t]} border-transparent` : "border-border text-muted hover:text-charcoal"}`}>
                {FLAG_LABEL[t]}
              </button>
            ))}
          </div>

          {visibleFlags.length === 0 ? (
            <p className="text-sm text-muted text-center py-4">
              {matterFlags.length === 0
                ? "No flags yet. Flags appear here when you mark key issues or when missing info is detected during processing."
                : "No flags match the current filter."}
            </p>
          ) : (
            <div className="space-y-2">
              {visibleFlags.map((flag) => (
                <Link
                  key={flag.id}
                  href={`/matters/${id}/documents/${flag.documentId}?highlight=${flag.id}`}
                  className={`flex items-start gap-3 px-3 py-2.5 rounded-[6px] border hover:border-accent/40 hover:bg-accent-light/30 transition-colors ${flag.resolved ? "opacity-50" : "border-border bg-white"}`}
                >
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${FLAG_COLOR[flag.type]}`}>{FLAG_LABEL[flag.type]}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs text-charcoal leading-relaxed ${flag.resolved ? "line-through" : ""}`}>{flag.text}</p>
                    <p className="text-[10px] text-muted mt-0.5">{flag.documentFileName} &middot; {timeAgo(flag.createdAt)}</p>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${flag.source === "auto" ? "bg-[#F3F4F6] text-muted" : "bg-[#EEF2FF] text-[#4F46E5]"}`}>{flag.source}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Case Intelligence */}
      {caseIntel && (
        <div className="mb-6 bg-surface border border-border rounded-lg" style={{ boxShadow: "var(--shadow)" }}>
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-primary">Case Intelligence</h2>
            <div className="flex items-center gap-3">
              {caseIntel.builtAt && <span className="text-xs text-muted">Built {timeAgo(caseIntel.builtAt)}</span>}
              <button onClick={buildCaseIntelligence} disabled={buildingIntel}
                className="text-xs font-medium text-accent hover:text-accent-hover transition-colors disabled:opacity-50">
                Rebuild
              </button>
            </div>
          </div>
          <div className="p-4 space-y-6">

            {/* Case Overview */}
            <div>
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Case Overview</h3>
              <p className="text-sm text-charcoal leading-relaxed">{caseIntel.caseOverview}</p>
            </div>

            {/* Unified Timeline */}
            <div>
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Unified Timeline</h3>
              {caseIntel.unifiedTimeline.length === 0 ? <p className="text-xs text-muted">No events.</p> :
                <div className="space-y-2 border-l-2 border-accent/20 ml-2 pl-4">
                  {caseIntel.unifiedTimeline.map((e, i) => (
                    <div key={i} className="relative pb-2 last:pb-0">
                      <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-accent border-2 border-surface" />
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-mono text-muted">{e.date}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${SIG_BADGE[e.significance] || ""}`}>{e.significance.toUpperCase()}</span>
                      </div>
                      <p className="text-sm text-charcoal">{e.description}</p>
                      <p className="text-[11px] text-muted">Source: {e.source}</p>
                    </div>
                  ))}
                </div>}
            </div>

            {/* Contradictions Detected */}
            <div>
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Contradictions Detected</h3>
              {caseIntel.factConsistency.length === 0
                ? <p className="text-sm text-muted">No contradictions detected across documents.</p>
                : <div className="space-y-3">
                    {caseIntel.factConsistency.map((f, i) => (
                      <div key={i} className="border border-border rounded-[6px] p-3 bg-white">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${SEV_BADGE[f.severity] || ""}`}>{f.severity.toUpperCase()}</span>
                          <p className="text-sm font-medium text-charcoal">{f.topic}</p>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex gap-2">
                            <span className="text-[10px] font-semibold text-[#4F46E5] bg-[#EEF2FF] px-1.5 py-0.5 rounded flex-shrink-0 leading-5">{f.documentA.id}</span>
                            <p className="text-xs text-charcoal leading-relaxed">{f.documentA.statement}</p>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-[10px] font-semibold text-[#D97706] bg-[#FEF3C7] px-1.5 py-0.5 rounded flex-shrink-0 leading-5">{f.documentB.id}</span>
                            <p className="text-xs text-charcoal leading-relaxed">{f.documentB.statement}</p>
                          </div>
                          {f.explanation && (
                            <p className="text-xs text-muted italic border-t border-border pt-1.5 mt-1.5">{f.explanation}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>}
            </div>

            {/* Case Checklist */}
            {caseIntel.checklist.length > 0 && (() => {
              const docNameMap = new Map(documents.map((d) => [d.id, d.fileName]));
              const sorted = [...caseIntel.checklist].sort((a, b) => {
                if (a.status === b.status) {
                  // within missing: required before optional
                  if (a.status === "missing") return (b.item.required ? 1 : 0) - (a.item.required ? 1 : 0);
                  return 0;
                }
                // missing before present
                return a.status === "missing" ? -1 : 1;
              });
              const present = sorted.filter((r) => r.status === "present");
              const missing = sorted.filter((r) => r.status === "missing");
              return (
                <div>
                  <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Case Checklist</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {/* Present column */}
                    <div>
                      <p className="text-[11px] font-semibold text-[#059669] uppercase tracking-wider mb-2">Present</p>
                      {present.length === 0
                        ? <p className="text-xs text-muted">None confirmed yet.</p>
                        : <div className="space-y-2">
                            {present.map((r) => (
                              <div key={r.item.id} className="flex gap-2 items-start">
                                <span className="text-[#059669] flex-shrink-0 mt-0.5">✓</span>
                                <div>
                                  <p className="text-sm text-charcoal font-medium">{r.item.label}</p>
                                  {r.matchedDocuments.length > 0 && (
                                    <p className="text-[11px] text-muted mt-0.5">
                                      {r.matchedDocuments.map((docId) => docNameMap.get(docId) ?? docId).join(", ")}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>}
                    </div>
                    {/* Missing column */}
                    <div>
                      <p className="text-[11px] font-semibold text-[#DC2626] uppercase tracking-wider mb-2">Missing</p>
                      {missing.length === 0
                        ? <p className="text-xs text-muted">All items accounted for.</p>
                        : <div className="space-y-2">
                            {missing.map((r) => (
                              <div key={r.item.id} className="flex gap-2 items-start">
                                <span className={`flex-shrink-0 mt-0.5 ${r.item.required ? "text-[#DC2626]" : "text-[#D97706]"}`}>✕</span>
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <p className="text-sm text-charcoal font-medium">{r.item.label}</p>
                                    {r.item.required && <span className="text-[9px] font-semibold text-[#DC2626] bg-[#FEE2E2] px-1 py-0.5 rounded">REQUIRED</span>}
                                  </div>
                                  <p className="text-[11px] text-muted mt-0.5">{r.item.description}</p>
                                </div>
                              </div>
                            ))}
                          </div>}
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="pt-3 border-t border-border">
              <p className="text-[11px] text-muted italic">{caseIntel.disclaimer}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Danger zone ─────────────────────────────────────── */}
      <div className="mt-12 pt-5 border-t border-border">
        <button
          onClick={openDeleteModal}
          className="text-sm text-[#DC2626] hover:underline focus:outline-none"
        >
          Delete this matter…
        </button>
      </div>

      {/* ── Delete confirmation modal ────────────────────────── */}
      {showDeleteModal && matter && (
        <div
          className="fixed inset-0 bg-black/20 z-30 flex items-start justify-center pt-24"
          onClick={() => setShowDeleteModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-surface border border-border rounded-lg p-6 w-full max-w-lg"
            style={{ boxShadow: "var(--shadow-lg)" }}
          >
            <h2 className="text-base font-semibold text-primary mb-2">
              Delete &ldquo;{matter.name}&rdquo;?
            </h2>
            <p className="text-sm text-charcoal mb-5">
              This will permanently delete the matter and all{" "}
              <strong>{documents.length} document{documents.length !== 1 ? "s" : ""}</strong>,{" "}
              <strong>{matterDraftsCount} draft{matterDraftsCount !== 1 ? "s" : ""}</strong>, and{" "}
              <strong>{matterFlags.filter((f) => !f.resolved).length} open flag{matterFlags.filter((f) => !f.resolved).length !== 1 ? "s" : ""}</strong>.{" "}
              This cannot be undone.
            </p>
            <div className="mb-5">
              <label className="block text-sm font-medium text-charcoal mb-1.5">
                Type{" "}
                <span className="font-mono font-semibold text-primary">{matter.name}</span>{" "}
                to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={matter.name}
                autoFocus
                className="w-full px-3 py-2 border border-border rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626] bg-white"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-sm font-medium text-charcoal bg-white border border-border rounded-[6px] hover:bg-row-alt transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteConfirmText !== matter.name || deleting}
                className="px-4 py-2 bg-[#DC2626] text-white text-sm font-medium rounded-[6px] hover:bg-[#B91C1C] transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                {deleting ? "Deleting…" : "Delete Matter"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return <svg className="animate-spin h-4 w-4 text-accent inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>;
}
