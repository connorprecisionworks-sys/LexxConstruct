"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { timeAgo } from "@/lib/utils";
import type { DraftEditorHandle } from "@/components/workspace/DraftEditor";
import { ProcessingStepper } from "@/components/ProcessingStepper";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import type { SuggestedEdit } from "@/types";
import {
  Pencil, Check, Download, Save, Clock,
  CheckCircle2, Undo2, MoreHorizontal, Sparkles,
} from "lucide-react";

const DraftEditor = dynamic(() => import("@/components/workspace/DraftEditor"), { ssr: false });
const RegenerationModal = dynamic(() => import("@/components/workspace/RegenerationModal"), { ssr: false });
const VersionHistoryPanel = dynamic(() => import("@/components/workspace/VersionHistoryPanel"), { ssr: false });
const FloatingAssistant = dynamic(() => import("@/components/workspace/FloatingAssistant"), { ssr: false });

interface Matter { id: string; name: string; clientName: string; }
interface Doc { id: string; fileName: string; documentKind?: string; }
interface DraftRecord {
  id: string;
  title: string;
  draftType: string;
  documentId: string | null;
  matterId?: string;
  content: string;
  disclaimer: string;
  status?: "draft" | "final";
  finalizedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface ActiveDraft {
  id: string;
  draftId?: string;
  label: string;
  content: string;
  disclaimer: string;
  draftType: string;
  editing: boolean;
  editContent?: string;
  saved?: boolean;
  savedMsg?: string;
  showHistory?: boolean;
  // lifecycle management
  status?: "draft" | "final";
  openedAsFinal?: boolean;
  isRenamingTitle?: boolean;
  renameValue?: string;
  showFinalizeWarning?: boolean;
  finalizeWarningDismissed?: boolean;
}

interface DeleteModal { outputId: string; title: string; versionCount: number; }

const DISCLAIMER = "This output is not legal advice and requires attorney review before any action is taken.";

const DRAFT_ACTIONS = [
  { key: "deposition_summary_memo",   label: "Deposition Summary Memo",     desc: "Internal memo summarising testimony, admissions, and recommendations", depositionFirst: true },
  { key: "cross_examination_outline", label: "Cross-Examination Outline",    desc: "Topic-by-topic outline with leading questions", depositionFirst: true },
  { key: "witness_prep_outline",      label: "Witness Prep Outline",         desc: "Preparation guide covering prior statements and attack areas", depositionFirst: true },
  { key: "draft_claim_letter",        label: "Claim Letter",                 desc: "Formal notice of claim under contract notice provisions", depositionFirst: false },
  { key: "draft_summary",             label: "Case Summary",                 desc: "Internal summary memo for attorney review", depositionFirst: false },
  { key: "draft_mediation_brief",     label: "Mediation Brief Outline",      desc: "Outline for a pre-mediation position paper", depositionFirst: false },
  { key: "draft_deposition_outline",  label: "Deposition Outline",           desc: "Witness deposition outline based on case documents", depositionFirst: false },
  { key: "draft_delay_narrative",     label: "Delay Narrative",              desc: "Narrative of delay events for expert handoff", depositionFirst: false },
  { key: "draft_defect_summary",      label: "Defect Summary",               desc: "Summary of defect allegations with document citations", depositionFirst: false },
  { key: "draft_motion",              label: "Motion Outline",               desc: "Outline for summary judgment or other motions", depositionFirst: false },
  { key: "draft_client_update",       label: "Client Update",                desc: "Client-facing status update in plain English", depositionFirst: false },
];

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

const STAGES = ["Gathering matter context", "Drafting with AI", "Finalizing"];

interface RegenerationState {
  outputId: string;
  selectedText: string;
  from: number;
  to: number;
  isOpen: boolean;
  isLoading: boolean;
  variants: string[] | null;
}

// Maps ChatAction types to the DRAFT_ACTIONS keys used in this workspace
const CHAT_ACTION_TO_DRAFT_KEY: Record<string, string> = {
  draft_claim_letter: "draft_claim_letter",
  draft_mediation_brief: "draft_mediation_brief",
  draft_motion_outline: "draft_motion",
  draft_demand_letter: "draft_claim_letter",
  draft_case_summary: "draft_summary",
  draft_client_update: "draft_client_update",
  draft_delay_narrative: "draft_delay_narrative",
  draft_defect_summary: "draft_defect_summary",
};

export default function MatterWorkspace() {
  const params = useParams<{ id: string }>();
  const matterId = params?.id ?? "";
  const router = useRouter();
  const searchParams = useSearchParams();
  const preloadDraftId = searchParams?.get("draftId") ?? null;
  const actionParam = searchParams?.get("action") ?? null;
  const prefillParam = searchParams?.get("prefill") ?? null;

  const [matter, setMatter] = useState<Matter | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [stageIdx, setStageIdx] = useState(0);
  const [outputs, setOutputs] = useState<ActiveDraft[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regen, setRegen] = useState<RegenerationState | null>(null);
  const [deleteModal, setDeleteModal] = useState<DeleteModal | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [assistantPanelState, setAssistantPanelState] = useState<"open" | "minimized" | "closed">("closed");
  const [cursorInfo, setCursorInfo] = useState({ paragraphText: "", hasSelection: false, selectionText: "" });
  const autoOpenedRef = useRef(false);

  const editorRefs = useRef<Map<string, DraftEditorHandle>>(new Map());
  const stageTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasDeposition = docs.some((d) => d.documentKind === "deposition");
  const sortedActions = hasDeposition
    ? [...DRAFT_ACTIONS.filter((a) => a.depositionFirst), ...DRAFT_ACTIONS.filter((a) => !a.depositionFirst)]
    : DRAFT_ACTIONS.filter((a) => !a.depositionFirst);

  useEffect(() => {
    async function load() {
      try {
        const [mattersRes, docsRes, draftsRes] = await Promise.all([
          fetch("/api/matters"),
          fetch(`/api/documents?matterId=${matterId}`),
          fetch(`/api/drafts?matterId=${matterId}`),
        ]);
        const matters = await mattersRes.json();
        if (Array.isArray(matters)) setMatter(matters.find((m: Matter) => m.id === matterId) ?? null);
        const docsData = await docsRes.json();
        if (Array.isArray(docsData)) setDocs(docsData.filter((d: Doc & { status: string }) => d.status === "ready"));
        if (draftsRes.ok) {
          const d = await draftsRes.json();
          if (Array.isArray(d)) setDrafts(d);
        }
      } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
      finally { setLoading(false); }
    }
    load();
  }, [matterId]);

  // Auto-load a draft specified via ?draftId= query param (fires once after initial load)
  const didPreload = useRef(false);
  useEffect(() => {
    if (!preloadDraftId || loading || drafts.length === 0 || didPreload.current) return;
    const target = drafts.find((d) => d.id === preloadDraftId);
    if (!target) return;
    didPreload.current = true;
    loadDraft(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preloadDraftId, loading, drafts]);

  // Auto-trigger draft generation from ?action= query param (fires once after initial load)
  // If both ?draftId= and ?action= are present, ?draftId= takes priority (handled above)
  const didActionTrigger = useRef(false);
  useEffect(() => {
    if (!actionParam || preloadDraftId || loading || didActionTrigger.current) return;
    const draftKey = CHAT_ACTION_TO_DRAFT_KEY[actionParam];
    if (!draftKey) return; // Unrecognized action — degrade gracefully
    const action = DRAFT_ACTIONS.find((a) => a.key === draftKey);
    if (!action) return;
    didActionTrigger.current = true;
    // Clear query params so a refresh doesn't re-trigger generation
    router.replace(`/matters/${matterId}/workspace`, { scroll: false });
    handleGenerate(action, prefillParam ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionParam, preloadDraftId, loading, matterId]);

  useEffect(() => {
    if (generating) {
      setStageIdx(0);
      stageTimerRef.current = setInterval(() => {
        setStageIdx((i) => Math.min(i + 1, STAGES.length - 1));
      }, 3500);
    } else {
      if (stageTimerRef.current) { clearInterval(stageTimerRef.current); stageTimerRef.current = null; }
    }
    return () => { if (stageTimerRef.current) clearInterval(stageTimerRef.current); };
  }, [generating]);

  // ── Helpers ──────────────────────────────────────────────────────────────

  async function refreshDrafts() {
    const dRes = await fetch(`/api/drafts?matterId=${matterId}`);
    if (dRes.ok) { const d = await dRes.json(); if (Array.isArray(d)) setDrafts(d); }
  }

  function showToast(msg: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }

  // ── Generation ────────────────────────────────────────────────────────────

  async function handleGenerate(action: typeof DRAFT_ACTIONS[0], additionalInstructions?: string) {
    if (generating) return;
    setGenerating(true);
    setActiveAction(action.key);
    setError(null);
    try {
      const res = await fetch(`/api/matters/${matterId}/workspace/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftType: action.key,
          ...(additionalInstructions ? { additionalInstructions } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Draft generation failed");
      }
      const draft: DraftRecord = await res.json();
      setOutputs((prev) => [{
        id: crypto.randomUUID(),
        draftId: draft.id,
        label: action.label,
        content: draft.content,
        disclaimer: draft.disclaimer,
        draftType: action.key,
        editing: false,
        status: "draft",
        openedAsFinal: false,
      }, ...prev]);
      await refreshDrafts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Draft generation failed");
    } finally {
      setGenerating(false);
      setActiveAction(null);
    }
  }

  function loadDraft(draft: DraftRecord) {
    setOutputs((prev) => [{
      id: crypto.randomUUID(),
      draftId: draft.id,
      label: draft.title,
      content: draft.content,
      disclaimer: draft.disclaimer,
      draftType: draft.draftType,
      editing: false,
      status: draft.status ?? "draft",
      openedAsFinal: draft.status === "final",
    }, ...prev]);
  }

  // ── Edit ──────────────────────────────────────────────────────────────────

  function enterEdit(outputId: string) {
    setOutputs((prev) => prev.map((o) => {
      if (o.id !== outputId) return o;
      return {
        ...o,
        editing: true,
        editContent: o.content,
        showFinalizeWarning: o.openedAsFinal === true && !o.finalizeWarningDismissed,
      };
    }));
    // Auto-open assistant on first edit entry this session
    if (!autoOpenedRef.current) {
      autoOpenedRef.current = true;
      setAssistantPanelState("open");
    }
  }

  function dismissFinalizeWarning(outputId: string) {
    setOutputs((prev) => prev.map((o) =>
      o.id === outputId ? { ...o, showFinalizeWarning: false, finalizeWarningDismissed: true } : o
    ));
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
      setOutputs((prev) => prev.map((o) =>
        o.id === outputId ? { ...o, content: o.editContent!, editing: false, saved: true, savedMsg } : o
      ));
      setTimeout(() => setOutputs((prev) => prev.map((o) =>
        o.id === outputId ? { ...o, saved: false, savedMsg: undefined } : o
      )), 3000);
      setAssistantPanelState("closed");
      await refreshDrafts();
    } catch { setError("Failed to save draft."); }
  }

  // ── Rename ────────────────────────────────────────────────────────────────

  function startRename(outputId: string) {
    setOutputs((prev) => prev.map((o) =>
      o.id === outputId ? { ...o, isRenamingTitle: true, renameValue: o.label } : o
    ));
  }

  function cancelRename(outputId: string) {
    setOutputs((prev) => prev.map((o) =>
      o.id === outputId ? { ...o, isRenamingTitle: false, renameValue: undefined } : o
    ));
  }

  async function commitRename(outputId: string) {
    const output = outputs.find((o) => o.id === outputId);
    if (!output?.draftId) { cancelRename(outputId); return; }
    const newTitle = (output.renameValue ?? output.label).trim();
    if (!newTitle || newTitle === output.label) { cancelRename(outputId); return; }
    try {
      await fetch(`/api/drafts/${output.draftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
      setOutputs((prev) => prev.map((o) =>
        o.id === outputId ? { ...o, label: newTitle, isRenamingTitle: false, renameValue: undefined } : o
      ));
      await refreshDrafts();
    } catch {
      cancelRename(outputId);
      setError("Failed to rename draft.");
    }
  }

  // ── Finalize / revert ─────────────────────────────────────────────────────

  async function markAsFinal(outputId: string) {
    const output = outputs.find((o) => o.id === outputId);
    if (!output?.draftId) return;
    const confirmed = window.confirm(
      "Mark this draft as final? It will be flagged as completed but you can still edit it if needed."
    );
    if (!confirmed) return;
    try {
      await fetch(`/api/drafts/${output.draftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "final" }),
      });
      setOutputs((prev) => prev.map((o) => o.id === outputId ? { ...o, status: "final" } : o));
      await refreshDrafts();
      showToast("Draft marked as final");
    } catch { setError("Failed to finalize draft."); }
  }

  async function revertToDraft(outputId: string) {
    const output = outputs.find((o) => o.id === outputId);
    if (!output?.draftId) return;
    try {
      await fetch(`/api/drafts/${output.draftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "draft" }),
      });
      setOutputs((prev) => prev.map((o) => o.id === outputId ? { ...o, status: "draft" } : o));
      await refreshDrafts();
      showToast("Draft reverted to in-progress");
    } catch { setError("Failed to revert draft."); }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function startDelete(outputId: string) {
    const output = outputs.find((o) => o.id === outputId);
    if (!output?.draftId) return;
    try {
      const res = await fetch(`/api/drafts/${output.draftId}/versions`);
      const versions = res.ok ? await res.json() : [];
      setDeleteModal({ outputId, title: output.label, versionCount: Array.isArray(versions) ? versions.length : 0 });
    } catch {
      setDeleteModal({ outputId, title: output.label, versionCount: 0 });
    }
  }

  async function confirmDelete() {
    if (!deleteModal) return;
    const { outputId } = deleteModal;
    const output = outputs.find((o) => o.id === outputId);
    if (!output?.draftId) { setDeleteModal(null); return; }
    setDeleteModal(null);
    try {
      await fetch(`/api/drafts/${output.draftId}`, { method: "DELETE" });
      setOutputs((prev) => prev.filter((o) => o.id !== outputId));
      await refreshDrafts();
      showToast("Draft deleted");
    } catch { setError("Failed to delete draft."); }
  }

  // ── Export / copy / regen ─────────────────────────────────────────────────

  async function exportDraft(draftId: string, format: "docx" | "pdf" = "docx") {
    const res = await fetch(`/api/drafts/${draftId}/export?format=${format}`, { method: "POST" });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `Lexx-draft.${format}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function copyToClipboard(id: string, html: string) {
    const plain = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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
    editorRefs.current.get(outputId)?.replaceRange(from, to, variant);
    setRegen(null);
  }

  const handleAssistantApply = useCallback((edit: SuggestedEdit) => {
    const target = outputs.find((o) => o.editing);
    if (!target) return;
    const handle = editorRefs.current.get(target.id);
    if (!handle) return;
    if (edit.type === "add_paragraph") {
      handle.appendAfterCurrentParagraph(edit.proposedText);
    } else if (edit.type === "rewrite_paragraph") {
      handle.replaceCurrentParagraph(edit.proposedText);
    } else if (edit.type === "add_citation") {
      handle.insertAtEndOfCurrentParagraph(edit.proposedText);
    }
  }, [outputs]);

  async function handleRestoreVersion(outputId: string, version: { id: string; content: string }) {
    const output = outputs.find((o) => o.id === outputId);
    if (!output?.draftId) return;
    try {
      const res = await fetch(`/api/drafts/${output.draftId}/versions/${version.id}/restore`, { method: "POST" });
      const data = await res.json();
      setOutputs((prev) => prev.map((o) =>
        o.id === outputId ? { ...o, content: data.content, editContent: data.content, showHistory: false, saved: true, savedMsg: "Restored" } : o
      ));
      setTimeout(() => setOutputs((prev) => prev.map((o) => o.id === outputId ? { ...o, saved: false, savedMsg: undefined } : o)), 3000);
    } catch { setError("Failed to restore version."); }
  }

  // ── Sorted drafts list (in-progress first, then final) ────────────────────

  const sortedDrafts = [
    ...drafts.filter((d) => (d.status ?? "draft") !== "final")
      .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt)),
    ...drafts.filter((d) => d.status === "final")
      .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt)),
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="px-8 py-20 flex items-center justify-center">
      <Spinner /><span className="ml-3 text-sm text-muted">Loading workspace...</span>
    </div>
  );

  const readyCount = docs.length;

  return (
    <div className="h-screen flex flex-col">
      {/* Top bar */}
      <div className="flex-shrink-0 px-6 py-2.5 border-b border-border bg-surface flex items-center gap-3">
        <Link href={`/matters/${matterId}`} className="flex items-center gap-1.5 text-xs text-muted hover:text-charcoal transition-colors">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          Back to matter
        </Link>
        <span className="text-muted text-xs">·</span>
        <span className="text-sm font-medium text-primary">{matter?.name ?? "Matter"}</span>
        <span className="text-muted text-xs">·</span>
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
          {readyCount} document{readyCount !== 1 ? "s" : ""} in scope
        </span>
      </div>

      {error && (
        <div className="flex-shrink-0 mx-6 mt-3 px-4 py-2.5 bg-[#FEE2E2] border border-[#FECACA] rounded-lg flex items-center justify-between">
          <span className="text-sm text-[#DC2626]">{error}</span>
          <button onClick={() => setError(null)} className="text-[#DC2626] text-xs hover:underline">Dismiss</button>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 min-h-0 grid grid-cols-[1fr_340px]">
        {/* Left — editor */}
        <div className="overflow-y-auto border-r border-border px-6 py-6">
          {generating && (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-6">
              <Spinner />
              <ProcessingStepper stages={STAGES} currentStage={stageIdx} />
            </div>
          )}

          {!generating && outputs.length === 0 && (
            <div className="flex items-center justify-center h-full min-h-[300px]">
              <div className="text-center max-w-sm">
                <div className="w-10 h-10 rounded-lg bg-accent-light flex items-center justify-center mx-auto mb-3">
                  <svg className="h-5 w-5 text-accent" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-primary mb-1">Select a draft action to begin</p>
                <p className="text-xs text-muted">or open an existing draft from the list on the right</p>
                {readyCount === 0 && (
                  <p className="text-xs text-[#D97706] mt-3 bg-[#FEF3C7] px-3 py-2 rounded-[6px]">
                    No ready documents in this matter yet. Upload and process documents first.
                  </p>
                )}
              </div>
            </div>
          )}

          {!generating && outputs.length > 0 && (
            <div className="space-y-4">
              {outputs.map((output) => (
                <div key={output.id} className="bg-surface border border-border rounded-lg" style={{ boxShadow: "var(--shadow)" }}>
                  {/* ── Card header ── */}
                  <div
                    className="flex items-center justify-between gap-3"
                    style={{
                      padding: "var(--space-6) var(--space-5)",
                      borderBottom: "1px solid var(--color-border-subtle)",
                    }}
                  >
                    {/* Left: status badge + clickable title */}
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge
                        variant={output.status === "final" ? "mint" : "neutral"}
                        size="sm"
                        className="flex-shrink-0"
                      >
                        {output.status === "final" ? "Final" : "Draft"}
                      </Badge>

                      {output.isRenamingTitle ? (
                        <input
                          autoFocus
                          value={output.renameValue ?? output.label}
                          onChange={(e) => setOutputs((p) => p.map((o) => o.id === output.id ? { ...o, renameValue: e.target.value } : o))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); commitRename(output.id); }
                            if (e.key === "Escape") cancelRename(output.id);
                          }}
                          onBlur={() => commitRename(output.id)}
                          className="text-sm font-medium text-primary bg-transparent border-b border-accent outline-none min-w-0 w-[280px] max-w-full"
                          maxLength={120}
                        />
                      ) : (
                        <button
                          onClick={() => startRename(output.id)}
                          className="text-sm font-medium text-primary truncate hover:text-accent transition-colors text-left max-w-[280px]"
                          title="Click to rename"
                        >
                          {output.label}
                        </button>
                      )}

                    </div>

                    {/* Right: action buttons */}
                    <div className="flex items-center flex-wrap gap-[var(--space-2)] flex-shrink-0">
                      {/* 1. Edit / Done editing — primary teal */}
                      {output.draftId && (
                        output.editing ? (
                          <Button variant="secondary" size="base" onClick={() => saveDraftEdit(output.id)}>
                            <Check className="h-4 w-4" />
                            Done editing
                          </Button>
                        ) : (
                          <Button variant="primary" size="base" onClick={() => enterEdit(output.id)}>
                            <Pencil className="h-4 w-4" />
                            Edit
                          </Button>
                        )
                      )}

                      {/* Ask Assistant button (edit mode only) */}
                      {output.editing && output.draftId && (
                        <Button
                          variant="secondary"
                          size="base"
                          className="hidden lg:inline-flex"
                          onClick={() => setAssistantPanelState("open")}
                        >
                          <Sparkles className="h-4 w-4" />
                          Ask Assistant
                        </Button>
                      )}

                      {/* 2. Export Word — secondary */}
                      {output.draftId && !output.editing && (
                        <Button variant="secondary" size="base" onClick={() => exportDraft(output.draftId!, "docx")}>
                          <Download className="h-4 w-4" />
                          Export Word
                        </Button>
                      )}

                      {/* 3. Save (edit mode only) — secondary */}
                      {output.editing && output.draftId && (
                        <Button variant="secondary" size="base" onClick={() => saveDraftEdit(output.id)}>
                          <Save className="h-4 w-4" />
                          Save
                        </Button>
                      )}

                      {/* 4. History (edit mode only) — ghost */}
                      {output.editing && output.draftId && (
                        <Button
                          variant="ghost"
                          size="base"
                          onClick={() => setOutputs((p) => p.map((o) => o.id === output.id ? { ...o, showHistory: !o.showHistory } : o))}
                        >
                          <Clock className="h-4 w-4" />
                          History
                        </Button>
                      )}

                      {/* 5. Mark as final / Revert — secondary */}
                      {output.draftId && (
                        output.status === "final" ? (
                          <Button variant="secondary" size="base" onClick={() => revertToDraft(output.id)}>
                            <Undo2 className="h-4 w-4" />
                            Revert to draft
                          </Button>
                        ) : (
                          <Button variant="secondary" size="base" onClick={() => markAsFinal(output.id)}>
                            <CheckCircle2 className="h-4 w-4" />
                            Mark as final
                          </Button>
                        )
                      )}

                      {/* 6. Overflow menu (Delete) — ghost icon-only */}
                      {output.draftId && (
                        <DropdownMenu
                          items={[{ label: "Delete draft", onClick: () => startDelete(output.id), danger: true }]}
                        />
                      )}

                      {/* Saved indicator */}
                      {output.saved && (
                        <span className="text-xs text-[var(--color-mint)] font-medium">
                          {output.savedMsg || "Saved"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Finalize warning banner */}
                  {output.editing && output.openedAsFinal && output.showFinalizeWarning && !output.finalizeWarningDismissed && (
                    <div className="px-4 py-2 bg-[#FFFBEB] border-b border-[#FDE68A] flex items-center justify-between">
                      <p className="text-[11px] text-[#92400E]">
                        You&apos;re editing a finalized draft. Changes will create a new version.
                      </p>
                      <button
                        onClick={() => dismissFinalizeWarning(output.id)}
                        className="ml-3 flex-shrink-0 text-[#92400E] hover:text-[#78350F]"
                        aria-label="Dismiss"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}

                  {/* Card body */}
                  <div className="px-4 py-4">
                    {output.editing ? (
                      <DraftEditor
                        key={output.draftId}
                        value={output.editContent ?? output.content}
                        onChange={(html) => setOutputs((p) => p.map((o) => o.id === output.id ? { ...o, editContent: html } : o))}
                        onRegenerateParagraph={(selectedText, from, to) =>
                          handleRegenerateParagraph(output.id, output.draftType, selectedText, from, to)
                        }
                        onCursorChange={(info) => setCursorInfo(info)}
                        ref={(handle) => {
                          if (handle) editorRefs.current.set(output.id, handle);
                          else editorRefs.current.delete(output.id);
                        }}
                      />
                    ) : (
                      <div className="text-sm text-charcoal leading-relaxed prose-preview" dangerouslySetInnerHTML={{ __html: output.content }} />
                    )}
                    <div className="mt-4 pt-3 border-t border-border">
                      <p className="text-[11px] text-muted italic">{output.disclaimer}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right — actions + drafts list */}
        <div className="overflow-y-auto px-4 py-4 space-y-6 bg-[#FAFAFA]">
          {/* Action buttons */}
          <div>
            <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-3 px-1">Draft Actions</p>
            <div className="space-y-1.5">
              {sortedActions.map((action) => (
                <button
                  key={action.key}
                  onClick={() => handleGenerate(action)}
                  disabled={generating || readyCount === 0}
                  className={`w-full text-left px-3 py-2.5 border rounded-[6px] transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    activeAction === action.key
                      ? "border-accent bg-accent-light"
                      : "border-border bg-white hover:border-accent/30 hover:bg-accent-light/40"
                  }`}
                  style={{ boxShadow: "var(--shadow)" }}
                >
                  {activeAction === action.key ? (
                    <span className="flex items-center gap-2 text-sm text-accent"><Spinner /> Generating…</span>
                  ) : (
                    <>
                      <span className="text-sm font-medium text-primary block">{action.label}</span>
                      <span className="text-[11px] text-muted block mt-0.5">{action.desc}</span>
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Drafts list */}
          <div>
            <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-3 px-1">
              Drafts in this matter
              {drafts.length > 0 && <span className="ml-1.5 font-normal">({drafts.length})</span>}
            </p>
            {drafts.length === 0 ? (
              <p className="text-xs text-muted px-1">No drafts yet. Select an action above to create one.</p>
            ) : (
              <div className="space-y-1.5">
                {sortedDrafts.map((draft) => {
                  const isFinal = draft.status === "final";
                  const sourceDoc = draft.documentId ? docs.find((d) => d.id === draft.documentId) : null;
                  return (
                    <button
                      key={draft.id}
                      onClick={() => loadDraft(draft)}
                      className="w-full text-left px-3 py-2 border border-border rounded-[6px] hover:bg-accent-light/40 transition-colors"
                      style={{
                        boxShadow: "var(--shadow)",
                        backgroundColor: isFinal ? "var(--color-mint-soft)" : "white",
                      }}
                    >
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#F3E8FF] text-[#7C3AED] flex-shrink-0">
                          {DRAFT_TYPE_BADGE[draft.draftType] ?? draft.title}
                        </span>
                        {isFinal && <Badge variant="mint" size="sm">Final</Badge>}
                      </div>
                      <p className="text-xs font-medium text-primary truncate">{draft.title}</p>
                      {sourceDoc && (
                        <p className="text-[10px] text-muted mt-0.5 truncate">from {sourceDoc.fileName}</p>
                      )}
                      <p className="text-[10px] text-muted mt-0.5">{timeAgo(draft.updatedAt ?? draft.createdAt)}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Floating Writing Assistant */}
      {(() => {
        const editingOutput = outputs.find((o) => o.editing);
        return editingOutput?.draftId ? (
          <FloatingAssistant
            draftId={editingOutput.draftId}
            draftTitle={editingOutput.label}
            matterId={matterId}
            panelState={assistantPanelState}
            onStateChange={setAssistantPanelState}
            currentParagraph={cursorInfo.paragraphText}
            hasSelection={cursorInfo.hasSelection}
            selectionText={cursorInfo.selectionText}
            onApply={handleAssistantApply}
          />
        ) : null;
      })()}

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
            onClose={() => setOutputs((p) => p.map((o) => o.id === output.id ? { ...o, showHistory: false } : o))}
            onRestore={(version) => handleRestoreVersion(output.id, version)}
          />
        ) : null
      )}

      {/* Delete confirmation modal */}
      {deleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          onClick={() => setDeleteModal(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-primary mb-2">Delete draft</h3>
            <p className="text-sm text-charcoal mb-4">
              Delete &ldquo;<strong>{deleteModal.title}</strong>&rdquo;? This will permanently delete the draft
              and all {deleteModal.versionCount} saved {deleteModal.versionCount === 1 ? "version" : "versions"}.{" "}
              This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteModal(null)}
                className="text-sm text-muted hover:text-primary transition-colors"
              >
                Cancel
              </button>
              <Button variant="danger" size="sm" onClick={confirmDelete}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-[#1C1917] text-white text-sm rounded-lg shadow-lg pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return <svg className="animate-spin h-4 w-4 text-accent inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>;
}
