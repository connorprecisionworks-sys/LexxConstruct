"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FolderPlus, FolderX, Upload, FileCheck, Pen, StickyNote,
  Flag as FlagIcon, Sparkles, MessageCircle, Clock, Trash2, CheckCircle2, PenLine,
} from "lucide-react";
import { timeAgo, formatActivityAction } from "@/lib/utils";
import { ProcessingStepper } from "@/components/ProcessingStepper";
import { UploadQueuePanel } from "@/components/UploadQueuePanel";
import { useUploadQueue } from "@/hooks/useUploadQueue";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stat } from "@/components/ui/Stat";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import { Tooltip } from "@/components/ui/Tooltip";
import { openCommandPalette } from "@/hooks/useCommandPalette";

// ── Local types ──────────────────────────────────────────────────────────────

interface Matter {
  id: string;
  name: string;
  clientName: string;
  matterType: string;
  caseType?: string;
  status: string;
  representedParty?: string;
  pinned?: boolean;
  createdAt: string;
  updatedAt?: string;
}
interface MatterWithCount extends Matter {
  documentCount: number;
  flagCount: number;
}
interface Stats { totalMatters: number; documentsProcessed: number; draftsGenerated: number; timeSavedMinutes: number; }
interface PendingDoc { id: string; fileName: string; matterId: string; matterName: string; uploadedAt: string; processingStage?: string; documentKind?: string; }
interface Activity { id: string; action: string; entityName: string; matterId: string; timestamp: string; }

// ── Constants ────────────────────────────────────────────────────────────────

const CASE_TYPE_LABELS: Record<string, string> = {
  construction_general: "Construction",
  construction_delay: "Delay Claim",
  construction_defect: "Defect Claim",
  construction_payment: "Payment/Lien",
  other: "Other",
};


const STATUS_BADGE: Record<string, "mint" | "warn" | "neutral"> = {
  active: "mint",
  on_hold: "warn",
  closed: "neutral",
};

const STATUS_FILTERS = [
  { value: "all",     label: "All" },
  { value: "active",  label: "Active" },
  { value: "on_hold", label: "On Hold" },
  { value: "closed",  label: "Closed" },
];

const TYPE_FILTERS = [
  { value: "all",     label: "All" },
  { value: "general", label: "General" },
  { value: "delay",   label: "Delay" },
  { value: "defect",  label: "Defect" },
  { value: "payment", label: "Payment" },
];

const CASE_TYPE_FILTER_MAP: Record<string, string> = {
  general: "construction_general",
  delay:   "construction_delay",
  defect:  "construction_defect",
  payment: "construction_payment",
};

const SORT_OPTIONS = [
  { value: "updated", label: "Last updated" },
  { value: "name",    label: "Name (A–Z)" },
  { value: "docs",    label: "Most documents" },
  { value: "flags",   label: "Most flags" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  const base = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const name = process.env.NEXT_PUBLIC_DISPLAY_NAME;
  return name ? `${base}, ${name}` : base;
}

function readUrlParams() {
  if (typeof window === "undefined") return { status: "all", type: "all", sort: "updated" };
  const p = new URLSearchParams(window.location.search);
  return {
    status: p.get("status") ?? "all",
    type:   p.get("type")   ?? "all",
    sort:   p.get("sort")   ?? "updated",
  };
}

function pushUrlParams(status: string, type: string, sort: string) {
  const p = new URLSearchParams();
  if (status !== "all")   p.set("status", status);
  if (type   !== "all")   p.set("type",   type);
  if (sort   !== "updated") p.set("sort", sort);
  const qs = p.toString();
  window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
}

const ACTIVITY_ICON_MAP: Record<string, React.ElementType> = {
  matter_created:          FolderPlus,
  matter_deleted:          FolderX,
  document_uploaded:       Upload,
  document_processed:      FileCheck,
  draft_generated:         Pen,
  note_added:              StickyNote,
  flag_added:              FlagIcon,
  case_intelligence_built: Sparkles,
  chat_message_sent:       MessageCircle,
  draft_deleted:           Trash2,
  draft_finalized:         CheckCircle2,
  draft_assist_applied:    Sparkles,
};

function activityIcon(action: string) {
  const Icon = ACTIVITY_ICON_MAP[action] ?? Clock;
  return <Icon className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.75} aria-hidden="true" />;
}

// ── Star icon ────────────────────────────────────────────────────────────────

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24"
      fill={filled ? "var(--color-teal)" : "none"}
      stroke={filled ? "var(--color-teal)" : "var(--color-ink-faint)"}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  );
}

// ── Hover preview ────────────────────────────────────────────────────────────

interface PreviewPos { top: number; left: number; side: "right" | "left"; }

function HoverPreview({ matter, pos }: { matter: MatterWithCount; pos: PreviewPos }) {
  const [opacity, setOpacity] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const t = requestAnimationFrame(() => setOpacity(1));
    return () => cancelAnimationFrame(t);
  }, []);

  const arrowOnLeft = pos.side === "right";

  const popup = (
    <div
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        zIndex: 9999,
        width: "280px",
        backgroundColor: "var(--color-paper)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-md)",
        padding: "var(--space-4)",
        pointerEvents: "none",
        opacity,
        transform: `translateX(${opacity === 0 ? (arrowOnLeft ? "-4px" : "4px") : "0"})`,
        transition: "opacity 150ms ease, transform 150ms ease",
      }}
    >
      {/* Arrow */}
      <div
        style={{
          position: "absolute",
          top: "14px",
          ...(arrowOnLeft
            ? { left: "-5px", borderLeft: "1px solid var(--color-border)", borderBottom: "1px solid var(--color-border)" }
            : { right: "-5px", borderRight: "1px solid var(--color-border)", borderTop: "1px solid var(--color-border)" }),
          width: "8px",
          height: "8px",
          backgroundColor: "var(--color-paper)",
          transform: "rotate(45deg)",
        }}
      />

      {/* Content */}
      <p
        className="truncate font-semibold"
        style={{ fontFamily: "var(--font-serif)", fontSize: "var(--text-md)", color: "var(--color-ink)" }}
      >
        {matter.name}
      </p>
      {matter.representedParty && (
        <p className="truncate mt-0.5" style={{ fontSize: "var(--text-xs)", color: "var(--color-ink-muted)" }}>
          For: {matter.representedParty}
        </p>
      )}
      <div className="flex gap-1.5 mt-2.5">
        <Badge variant={STATUS_BADGE[matter.status] ?? "neutral"} size="sm">
          {matter.status.replace("_", " ")}
        </Badge>
        <Badge variant="neutral" size="sm">
          {CASE_TYPE_LABELS[matter.caseType ?? matter.matterType] ?? "Construction"}
        </Badge>
      </div>
      <p className="mt-2.5" style={{ fontSize: "var(--text-xs)", color: "var(--color-ink-muted)" }}>
        {matter.documentCount} {matter.documentCount === 1 ? "doc" : "docs"}
        {" · "}
        {matter.flagCount} open {matter.flagCount === 1 ? "flag" : "flags"}
        {" · "}
        {timeAgo(matter.updatedAt ?? matter.createdAt)}
      </p>
      <p className="mt-2" style={{ fontSize: "var(--text-xs)", color: "var(--color-ink-subtle)" }}>
        Click to open →
      </p>
    </div>
  );

  if (!mounted) return null;
  return createPortal(popup, document.body);
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  // ── Data state ──────────────────────────────────────────────────────────
  const [matters, setMatters] = useState<MatterWithCount[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pending, setPending] = useState<PendingDoc[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Metric state (greeting subtitle) ─────────────────────────────────
  const [openFlagsCount, setOpenFlagsCount] = useState(0);
  const [recentDraftsCount, setRecentDraftsCount] = useState(0);
  const [docsThisWeek, setDocsThisWeek] = useState(0);
  const [flagsOpenedToday, setFlagsOpenedToday] = useState(0);

  // ── Create form ──────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [caseType, setCaseType] = useState("construction_general");

  // ── Filter / sort (synced to URL) ────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState("all");
  const [caseTypeFilter, setCaseTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("updated");

  // ── Pin toast ────────────────────────────────────────────────────────
  const [toast, setToast] = useState<string | null>(null);

  // ── Hover preview ────────────────────────────────────────────────────
  const [hoveredMatter, setHoveredMatter] = useState<MatterWithCount | null>(null);
  const [previewPos, setPreviewPos] = useState<PreviewPos>({ top: 0, left: 0, side: "right" });
  const [isHoverDevice, setIsHoverDevice] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Router ───────────────────────────────────────────────────────────
  const router = useRouter();

  // ── Keyboard nav ─────────────────────────────────────────────────────
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);

  // ── Refs ─────────────────────────────────────────────────────────────
  const mattersTableRef = useRef<HTMLDivElement>(null);
  const rowRefsMap = useRef<Map<string, HTMLElement>>(new Map());
  const sortSelectRef = useRef<HTMLSelectElement>(null);
  const displayedMattersRef = useRef<MatterWithCount[]>([]);
  const { queue, cancel, dismiss, sessionStats } = useUploadQueue();

  // ── Init URL params on mount ─────────────────────────────────────────
  useEffect(() => {
    const p = readUrlParams();
    setStatusFilter(p.status);
    setCaseTypeFilter(p.type);
    setSortBy(p.sort);
    setIsHoverDevice(window.matchMedia("(hover: hover)").matches);
  }, []);

  // ── Toast auto-dismiss ───────────────────────────────────────────────
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── fetchAll ─────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      setError(null);
      const [mattersRes, statsRes, activityRes, draftsRes] = await Promise.all([
        fetch("/api/matters"),
        fetch("/api/stats"),
        fetch("/api/activity?limit=10"),
        fetch("/api/drafts"),
      ]);

      const mattersData: Matter[] = mattersRes.ok ? await mattersRes.json() : [];

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayStartISO = todayStart.toISOString();
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Fetch docs + flags per matter in parallel
      const perMatter = await Promise.all(
        mattersData.map(async (m) => {
          const [docsRes, flagsRes] = await Promise.all([
            fetch(`/api/documents?matterId=${m.id}`),
            fetch(`/api/matters/${m.id}/flags`),
          ]);
          const docs = docsRes.ok
            ? (await docsRes.json()) as { id: string; fileName: string; status: string; uploadedAt: string; processedAt?: string; processingStage?: string; documentKind?: string }[]
            : [];
          const flags = flagsRes.ok ? await flagsRes.json() : [];
          const flagArr = Array.isArray(flags) ? flags : [];
          return {
            matterId: m.id,
            matterName: m.name,
            docs,
            openFlags: flagArr.filter((f: { resolved?: boolean }) => !f.resolved).length,
            todayFlags: flagArr.filter((f: { createdAt: string }) => f.createdAt >= todayStartISO).length,
          };
        })
      );

      // Aggregate metrics
      let weeklyDocCount = 0;
      const pendingDocs: PendingDoc[] = [];
      perMatter.forEach(({ matterId, matterName, docs }) => {
        docs.forEach((d) => {
          if (d.status === "ready" && (d.processedAt ?? d.uploadedAt) >= weekAgo) weeklyDocCount++;
          if (d.status === "processing" || d.status === "uploading") {
            pendingDocs.push({ id: d.id, fileName: d.fileName, matterId, matterName, uploadedAt: d.uploadedAt, processingStage: d.processingStage, documentKind: d.documentKind });
          }
        });
      });
      setDocsThisWeek(weeklyDocCount);
      setPending(pendingDocs);
      setOpenFlagsCount(perMatter.reduce((n, m) => n + m.openFlags, 0));
      setFlagsOpenedToday(perMatter.reduce((n, m) => n + m.todayFlags, 0));

      // Build MatterWithCount (no sort here — useMemo handles it)
      const withCounts: MatterWithCount[] = mattersData.map((m, i) => ({
        ...m,
        documentCount: perMatter[i]?.docs.length ?? 0,
        flagCount: perMatter[i]?.openFlags ?? 0,
      }));
      setMatters(withCounts);

      if (statsRes.ok) setStats(await statsRes.json());
      if (activityRes.ok) setActivities(await activityRes.json());

      if (draftsRes.ok) {
        const allDrafts = await draftsRes.json();
        if (Array.isArray(allDrafts)) {
          const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          setRecentDraftsCount(allDrafts.filter((d: { createdAt: string }) => d.createdAt > cutoff).length);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-refresh
  useEffect(() => {
    const ms = pending.length > 0 ? 3000 : 10000;
    const interval = setInterval(fetchAll, ms);
    return () => clearInterval(interval);
  }, [pending.length, fetchAll]);

  // Refresh when a queue item completes
  const prevQueueRef = useRef<typeof queue>([]);
  useEffect(() => {
    const newlyDone = queue.filter((item) => {
      if (item.status !== "done") return false;
      const prev = prevQueueRef.current.find((p) => p.id === item.id);
      return prev && prev.status !== "done";
    });
    if (newlyDone.length > 0) fetchAll();
    prevQueueRef.current = [...queue];
  }, [queue, fetchAll]);

  // ── Keyboard navigation ──────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const active = document.activeElement;
      const isInputFocused =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement ||
        (active as HTMLElement)?.isContentEditable;

      // `/` — focus sort select
      if (e.key === "/" && !isInputFocused) {
        e.preventDefault();
        sortSelectRef.current?.focus();
        return;
      }

      if (isInputFocused) return;

      const items = displayedMattersRef.current;
      const count = items.length;
      if (count === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedRowIndex((prev) => (prev === null ? 0 : Math.min(prev + 1, count - 1)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedRowIndex((prev) => (prev === null ? 0 : Math.max(prev - 1, 0)));
      } else if (e.key === "Enter") {
        setFocusedRowIndex((prev) => {
          if (prev === null) return prev;
          const m = items[prev];
          if (m) router.push(`/matters/${m.id}`);
          return prev;
        });
      } else if (e.key === "p") {
        setFocusedRowIndex((prev) => {
          if (prev === null) return prev;
          const m = items[prev];
          if (m) togglePinById(m.id, !!m.pinned);
          return prev;
        });
      } else if (e.key === "Escape") {
        setFocusedRowIndex(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  // togglePinById is stable within the render cycle; router is stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Scroll focused row into view
  useEffect(() => {
    if (focusedRowIndex === null) return;
    const m = displayedMattersRef.current[focusedRowIndex];
    if (m) rowRefsMap.current.get(m.id)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focusedRowIndex]);

  // ── Filter / sort setters (also update URL) ──────────────────────────
  function applyStatusFilter(v: string) {
    setStatusFilter(v);
    pushUrlParams(v, caseTypeFilter, sortBy);
  }
  function applyCaseTypeFilter(v: string) {
    setCaseTypeFilter(v);
    pushUrlParams(statusFilter, v, sortBy);
  }
  function applySort(v: string) {
    setSortBy(v);
    pushUrlParams(statusFilter, caseTypeFilter, v);
  }

  // ── Derived: filtered + sorted matters ──────────────────────────────
  const { pinnedMatters, unpinnedMatters } = useMemo(() => {
    let result = [...matters];

    if (statusFilter !== "all") result = result.filter((m) => m.status === statusFilter);

    if (caseTypeFilter !== "all") {
      const ct = CASE_TYPE_FILTER_MAP[caseTypeFilter];
      if (ct) result = result.filter((m) => (m.caseType ?? "construction_general") === ct);
    }

    if (sortBy === "name") {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "docs") {
      result.sort((a, b) => b.documentCount - a.documentCount);
    } else if (sortBy === "flags") {
      result.sort((a, b) => b.flagCount - a.flagCount);
    } else {
      result.sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
    }

    return {
      pinnedMatters: result.filter((m) => m.pinned),
      unpinnedMatters: result.filter((m) => !m.pinned),
    };
  }, [matters, statusFilter, caseTypeFilter, sortBy]);

  const displayedMatters = [...pinnedMatters, ...unpinnedMatters];
  // Keep ref in sync for the stable keyboard handler
  displayedMattersRef.current = displayedMatters;

  // ── Derived: recently active strip (always by updatedAt, top 5) ──────
  const recentlyActive = useMemo(() => {
    return [...matters]
      .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))
      .slice(0, 5);
  }, [matters]);

  const activeMattersCount = useMemo(() => matters.filter((m) => m.status === "active").length, [matters]);

  // ── Create matter ────────────────────────────────────────────────────
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !clientName.trim()) return;
    setCreating(true);
    try {
      await fetch("/api/matters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, clientName, matterType: "construction", caseType }),
      });
      setName(""); setClientName(""); setCaseType("construction_general"); setShowForm(false);
      await fetchAll();
    } finally { setCreating(false); }
  }

  // ── Pin toggle ───────────────────────────────────────────────────────
  async function togglePinById(matterId: string, currentlyPinned: boolean) {
    const pinnedCount = matters.filter((m) => m.pinned).length;
    if (!currentlyPinned && pinnedCount >= 5) {
      setToast("You can pin up to 5 matters.");
      return;
    }
    setMatters((prev) => prev.map((m) => m.id === matterId ? { ...m, pinned: !m.pinned } : m));
    try {
      await fetch(`/api/matters/${matterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !currentlyPinned }),
      });
    } catch {
      setMatters((prev) => prev.map((m) => m.id === matterId ? { ...m, pinned: currentlyPinned } : m));
    }
  }

  async function togglePin(e: React.MouseEvent, matterId: string, currentlyPinned: boolean) {
    e.preventDefault();
    e.stopPropagation();
    await togglePinById(matterId, currentlyPinned);
  }

  // ── Delete matter ────────────────────────────────────────────────────
  async function deleteMatter(matterId: string, matterName: string) {
    if (!window.confirm(`Delete "${matterName}"? This cannot be undone.`)) return;
    setMatters((prev) => prev.filter((m) => m.id !== matterId));
    setFocusedRowIndex(null);
    try {
      await fetch(`/api/matters/${matterId}`, { method: "DELETE" });
    } catch {
      await fetchAll();
      setToast("Failed to delete matter.");
    }
  }

  // ── Hover preview ────────────────────────────────────────────────────
  function onRowMouseEnter(matter: MatterWithCount, rowEl: HTMLElement) {
    if (!isHoverDevice) return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      const rect = rowEl.getBoundingClientRect();
      const GAP = 12;
      const POPUP_W = 280;
      const fitsRight = rect.right + POPUP_W + GAP <= window.innerWidth;
      // position: fixed — top/left are viewport-relative (getBoundingClientRect already is)
      const top = rect.top;
      const left = fitsRight
        ? rect.right + GAP
        : Math.max(GAP, rect.left - POPUP_W - GAP);
      setPreviewPos({ top, left, side: fitsRight ? "right" : "left" });
      setHoveredMatter(matter);
    }, 500);
  }

  function onRowMouseLeave() {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setHoveredMatter(null);
  }

  function scrollToTable() {
    mattersTableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const GRID_COLS = "28px minmax(0,2fr) minmax(0,1.4fr) 110px 90px 64px 80px 88px";

  function renderRow(m: MatterWithCount, isLast: boolean, isPinned: boolean, rowIndex: number) {
    const isFocused = focusedRowIndex === rowIndex;
    const menuItems = [
      { label: "Open matter",    onClick: () => router.push(`/matters/${m.id}`) },
      { label: "Open chat",      onClick: () => router.push(`/chat?matterId=${m.id}`) },
      { label: "Open workspace", onClick: () => router.push(`/matters/${m.id}/workspace`) },
      { label: m.pinned ? "Unpin" : "Pin", onClick: () => togglePinById(m.id, !!m.pinned), dividerBefore: true },
      { label: "Delete", onClick: () => deleteMatter(m.id, m.name), danger: true, dividerBefore: true },
    ];
    return (
      <div
        key={m.id}
        ref={(el) => {
          if (el) rowRefsMap.current.set(m.id, el);
          else rowRefsMap.current.delete(m.id);
        }}
        className="relative"
        style={{
          backgroundColor: isPinned ? "var(--color-teal-soft)" : "transparent",
          borderBottom: !isLast ? "1px solid var(--color-border-subtle)" : "none",
          borderLeft: isFocused ? "2px solid var(--color-teal)" : "2px solid transparent",
          outline: "none",
        }}
        onMouseEnter={(e) => {
          onRowMouseEnter(m, e.currentTarget as HTMLElement);
          const star = (e.currentTarget as HTMLElement).querySelector<HTMLButtonElement>("[data-star]");
          if (star && !m.pinned) star.style.opacity = "1";
          const actions = (e.currentTarget as HTMLElement).querySelector<HTMLElement>("[data-actions]");
          if (actions) actions.style.opacity = "1";
        }}
        onMouseLeave={(e) => {
          onRowMouseLeave();
          const star = (e.currentTarget as HTMLElement).querySelector<HTMLButtonElement>("[data-star]");
          if (star && !m.pinned) star.style.opacity = "0";
          const actions = (e.currentTarget as HTMLElement).querySelector<HTMLElement>("[data-actions]");
          if (actions) actions.style.opacity = "0";
        }}
      >
        <Link
          href={`/matters/${m.id}`}
          className="grid items-center"
          style={{
            gridTemplateColumns: GRID_COLS,
            padding: "var(--space-3) var(--space-5)",
            transition: "background-color var(--duration-fast) ease",
            textDecoration: "none",
            backgroundColor: isFocused ? (isPinned ? "rgba(16,118,110,0.12)" : "var(--color-paper-raised)") : "transparent",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = isPinned ? "rgba(16,118,110,0.12)" : "var(--color-paper-raised)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = isFocused
              ? (isPinned ? "rgba(16,118,110,0.12)" : "var(--color-paper-raised)")
              : "transparent";
          }}
          onClick={() => setHoveredMatter(null)}
        >
          {/* Pin star */}
          <button
            type="button"
            data-star
            onClick={(e) => togglePin(e, m.id, !!m.pinned)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: "20px", height: "20px",
              opacity: m.pinned ? 1 : 0,
              background: "none", border: "none", cursor: "pointer", padding: 0,
              transition: "opacity var(--duration-fast) ease",
            }}
            title={m.pinned ? "Unpin matter" : "Pin matter"}
          >
            <StarIcon filled={!!m.pinned} />
          </button>

          <span
            className="truncate font-medium"
            style={{ fontFamily: "var(--font-serif)", fontSize: "var(--text-md)", color: "var(--color-ink)" }}
          >
            {m.name}
          </span>
          <span className="truncate" style={{ fontSize: "var(--text-sm)", color: "var(--color-ink-muted)" }}>
            {m.clientName}
          </span>
          <div>
            <Badge variant="neutral" size="sm">
              {CASE_TYPE_LABELS[m.caseType ?? m.matterType] ?? "Construction"}
            </Badge>
          </div>
          <div>
            <Badge variant={STATUS_BADGE[m.status] ?? "neutral"} size="sm">
              {m.status?.replace("_", " ") ?? "active"}
            </Badge>
          </div>
          <span style={{ fontSize: "var(--text-sm)", color: "var(--color-ink-subtle)" }}>
            {m.documentCount}
          </span>
          <span style={{ fontSize: "var(--text-sm)", color: "var(--color-ink-subtle)" }}>
            {timeAgo(m.updatedAt ?? m.createdAt)}
          </span>
          {/* Actions group — last column: chat · workspace · overflow menu */}
          <div
            data-actions
            style={{
              opacity: 0,
              transition: "opacity 100ms ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "var(--space-1)",
            }}
          >
            <Tooltip content="Open chat" side="top">
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/chat?matterId=${m.id}`); }}
                aria-label="Open chat"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: "28px", height: "28px",
                  background: "transparent", border: "none", cursor: "pointer", padding: 0,
                  borderRadius: "var(--radius-md)",
                  color: "var(--color-ink-muted)",
                  transition: "color 100ms ease, background-color 100ms ease",
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget;
                  el.style.color = "var(--color-teal)";
                  el.style.backgroundColor = "var(--color-paper-raised)";
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget;
                  el.style.color = "var(--color-ink-muted)";
                  el.style.backgroundColor = "transparent";
                }}
              >
                <MessageCircle size={16} strokeWidth={1.75} />
              </button>
            </Tooltip>
            <Tooltip content="Open workspace" side="top">
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/matters/${m.id}/workspace`); }}
                aria-label="Open workspace"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: "28px", height: "28px",
                  background: "transparent", border: "none", cursor: "pointer", padding: 0,
                  borderRadius: "var(--radius-md)",
                  color: "var(--color-ink-muted)",
                  transition: "color 100ms ease, background-color 100ms ease",
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget;
                  el.style.color = "var(--color-teal)";
                  el.style.backgroundColor = "var(--color-paper-raised)";
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget;
                  el.style.color = "var(--color-ink-muted)";
                  el.style.backgroundColor = "transparent";
                }}
              >
                <PenLine size={16} strokeWidth={1.75} />
              </button>
            </Tooltip>
            <DropdownMenu items={menuItems} />
          </div>
        </Link>
      </div>
    );
  }

  return (
    <div style={{ paddingLeft: "var(--space-8)", paddingRight: "var(--space-8)", maxWidth: "1200px" }}>
      {/* Error banner */}
      {error && (
        <div
          className="flex items-center justify-between px-4 py-3 rounded-[var(--radius-md)] mb-6"
          style={{ marginTop: "var(--space-8)", backgroundColor: "var(--color-danger-soft)", border: "1px solid #FECACA" }}
        >
          <span style={{ fontSize: "var(--text-sm)", color: "var(--color-danger)" }}>{error}</span>
          <button onClick={fetchAll} className="font-medium hover:underline" style={{ fontSize: "var(--text-xs)", color: "var(--color-danger)" }}>
            Retry
          </button>
        </div>
      )}

      <PageHeader
        title={getGreeting()}
        subtitle={`${activeMattersCount} matters active \u00b7 ${docsThisWeek} documents processed this week \u00b7 ${flagsOpenedToday} flags opened today`}
        action={
          <Button variant="primary" onClick={() => setShowForm(true)}>
            New Matter
          </Button>
        }
      />

      {/* ── Create Matter Modal ────────────────────────────────── */}
      {showForm && (
        <div
          className="fixed inset-0 z-30 flex items-start justify-center"
          style={{ backgroundColor: "rgba(10,10,10,0.3)", paddingTop: "6rem" }}
          onClick={() => setShowForm(false)}
        >
          <form
            onSubmit={handleCreate}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg"
            style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-xl)", padding: "var(--space-6)", boxShadow: "var(--shadow-lg)" }}
          >
            <h2 className="font-semibold mb-5" style={{ fontFamily: "var(--font-serif)", fontSize: "var(--text-lg)", color: "var(--color-ink)" }}>
              Create New Matter
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
              <Input label="Matter Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Construction v. Bayshore Development" required autoFocus />
              <Input label="Client Name" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="e.g. Acme Construction, Inc." required />
              <div>
                <label className="block font-medium mb-1.5" style={{ fontSize: "var(--text-sm)", color: "var(--color-ink-muted)" }}>
                  Case Type
                </label>
                <select
                  value={caseType}
                  onChange={(e) => setCaseType(e.target.value)}
                  className="h-9 w-full px-3 rounded-[var(--radius-md)] focus:outline-none"
                  style={{ border: "1px solid var(--color-border-strong)", backgroundColor: "var(--color-paper)", fontSize: "var(--text-base)", color: "var(--color-ink)" }}
                >
                  <option value="construction_general">Construction — General Dispute</option>
                  <option value="construction_delay">Construction — Delay Claim</option>
                  <option value="construction_defect">Construction — Defect Claim</option>
                  <option value="construction_payment">Construction — Payment / Lien</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" variant="primary" loading={creating}>{creating ? "Creating…" : "Create Matter"}</Button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <svg className="animate-spin h-5 w-5 mr-3" style={{ color: "var(--color-teal)" }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span style={{ fontSize: "var(--text-sm)", color: "var(--color-ink-muted)" }}>Loading…</span>
        </div>
      ) : (
        <>
          {/* ── Stat strip ──────────────────────────────────────── */}
          <div className="grid grid-cols-4 mb-8" style={{ gap: "var(--space-6)" }}>
            <Stat
              label="Active Matters"
              value={activeMattersCount}
              onClick={() => { applyStatusFilter("active"); scrollToTable(); }}
            />
            <Stat label="Documents Processed" value={stats?.documentsProcessed ?? 0} onClick={scrollToTable} />
            <Stat label="Open Flags" value={openFlagsCount} onClick={openCommandPalette} />
            <Stat label="Drafts in Progress" value={recentDraftsCount} meta="last 7 days" href="/workspace" />
          </div>

          {/* ── Recently active strip ────────────────────────────── */}
          {recentlyActive.length > 0 && (
            <div style={{ marginBottom: "var(--space-6)", marginTop: "var(--space-6)" }}>
              <h2
                className="font-semibold mb-3"
                style={{ fontFamily: "var(--font-serif)", fontSize: "var(--text-lg)", color: "var(--color-ink)" }}
              >
                Recently active
              </h2>
              <div className="grid" style={{ gridTemplateColumns: `repeat(${recentlyActive.length}, 1fr)`, gap: "var(--space-3)" }}>
                {recentlyActive.map((m) => {
                  const recent24h = (m.updatedAt ?? m.createdAt) >= new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
                  return (
                    <Link key={m.id} href={`/matters/${m.id}`} style={{ textDecoration: "none" }}>
                      <div
                        style={{
                          backgroundColor: "var(--color-paper)",
                          border: "1px solid var(--color-border)",
                          borderRadius: "var(--radius-lg)",
                          padding: "var(--space-4)",
                          cursor: "pointer",
                          transition: "background-color var(--duration-fast) ease, transform var(--duration-fast) ease",
                        }}
                        onMouseEnter={(e) => {
                          const el = e.currentTarget as HTMLElement;
                          el.style.backgroundColor = "var(--color-paper-raised)";
                          el.style.transform = "translateY(-1px)";
                        }}
                        onMouseLeave={(e) => {
                          const el = e.currentTarget as HTMLElement;
                          el.style.backgroundColor = "var(--color-paper)";
                          el.style.transform = "translateY(0)";
                        }}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p
                            className="truncate font-medium"
                            style={{ fontFamily: "var(--font-serif)", fontSize: "var(--text-base)", color: "var(--color-ink)" }}
                          >
                            {m.name}
                          </p>
                          {/* Activity dot */}
                          <div
                            style={{
                              width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0, marginTop: "5px",
                              backgroundColor: recent24h ? "var(--color-teal)" : "var(--color-ink-faint)",
                            }}
                            title={recent24h ? "Updated in last 24h" : ""}
                          />
                        </div>
                        <p className="truncate" style={{ fontSize: "var(--text-xs)", color: "var(--color-ink-muted)" }}>
                          {m.clientName}
                        </p>
                        <p className="mt-2" style={{ fontSize: "var(--text-xs)", color: "var(--color-ink-subtle)" }}>
                          {timeAgo(m.updatedAt ?? m.createdAt)}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Matters table ───────────────────────────────────── */}
          <div className="mb-8" ref={mattersTableRef}>
            {/* Filter + sort bar */}
            {matters.length > 0 && (
              <div className="flex items-center justify-between mb-3" style={{ gap: "var(--space-3)" }}>
                {/* Filter chips */}
                <div className="flex items-center flex-wrap" style={{ gap: "var(--space-2)" }}>
                  {/* Status */}
                  {STATUS_FILTERS.map((f) => (
                    <button
                      key={f.value}
                      onClick={() => applyStatusFilter(f.value)}
                      style={{
                        display: "inline-flex", alignItems: "center",
                        padding: "3px 10px",
                        borderRadius: "9999px",
                        fontSize: "var(--text-xs)", fontWeight: 600,
                        border: statusFilter === f.value ? "none" : "1px solid var(--color-border-strong)",
                        backgroundColor: statusFilter === f.value ? "var(--color-teal-soft)" : "var(--color-paper)",
                        color: statusFilter === f.value ? "var(--color-teal)" : "var(--color-ink-muted)",
                        cursor: "pointer",
                        transition: "background-color var(--duration-fast) ease",
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                  <div style={{ width: "1px", height: "16px", backgroundColor: "var(--color-border)", margin: "0 var(--space-1)" }} />
                  {/* Case type */}
                  {TYPE_FILTERS.map((f) => (
                    <button
                      key={f.value}
                      onClick={() => applyCaseTypeFilter(f.value)}
                      style={{
                        display: "inline-flex", alignItems: "center",
                        padding: "3px 10px",
                        borderRadius: "9999px",
                        fontSize: "var(--text-xs)", fontWeight: 600,
                        border: caseTypeFilter === f.value ? "none" : "1px solid var(--color-border-strong)",
                        backgroundColor: caseTypeFilter === f.value ? "var(--color-teal-soft)" : "var(--color-paper)",
                        color: caseTypeFilter === f.value ? "var(--color-teal)" : "var(--color-ink-muted)",
                        cursor: "pointer",
                        transition: "background-color var(--duration-fast) ease",
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Sort dropdown */}
                <select
                  ref={sortSelectRef}
                  value={sortBy}
                  onChange={(e) => applySort(e.target.value)}
                  style={{
                    height: "30px", paddingLeft: "var(--space-3)", paddingRight: "var(--space-3)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-border-strong)",
                    backgroundColor: "var(--color-paper)",
                    fontSize: "var(--text-xs)",
                    color: "var(--color-ink-muted)",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            )}

            {matters.length === 0 ? (
              <Card padding="none">
                <div className="text-center py-16 px-6">
                  <p className="font-medium" style={{ fontSize: "var(--text-md)", color: "var(--color-ink)" }}>No matters yet</p>
                  <p className="mt-1" style={{ fontSize: "var(--text-sm)", color: "var(--color-ink-muted)" }}>Create your first matter to get started.</p>
                  <div className="mt-5">
                    <Button variant="primary" onClick={() => setShowForm(true)}>New Matter</Button>
                  </div>
                </div>
              </Card>
            ) : displayedMatters.length === 0 ? (
              <Card padding="none">
                <div className="text-center py-12 px-6">
                  <p className="font-medium" style={{ fontSize: "var(--text-base)", color: "var(--color-ink)" }}>No matters match these filters</p>
                  <button
                    onClick={() => { applyStatusFilter("all"); applyCaseTypeFilter("all"); }}
                    className="mt-2 font-medium hover:underline"
                    style={{ fontSize: "var(--text-sm)", color: "var(--color-teal)" }}
                  >
                    Clear filters
                  </button>
                </div>
              </Card>
            ) : (
              <Card padding="none" className="overflow-hidden">
                {/* Table header */}
                <div
                  className="grid items-center"
                  style={{
                    gridTemplateColumns: GRID_COLS,
                    padding: "0 var(--space-5)",
                    height: "36px",
                    borderBottom: "1px solid var(--color-border)",
                  }}
                >
                  {["", "Matter", "Client", "Case Type", "Status", "Docs", "Updated", ""].map((h, i) => (
                    <span
                      key={i}
                      style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--color-ink-subtle)", textTransform: "uppercase", letterSpacing: "0.06em" }}
                    >
                      {h}
                    </span>
                  ))}
                </div>

                {/* Pinned rows */}
                {pinnedMatters.map((m, i) =>
                  renderRow(m, i === pinnedMatters.length - 1 && unpinnedMatters.length === 0, true, i)
                )}

                {/* Divider between pinned and unpinned */}
                {pinnedMatters.length > 0 && unpinnedMatters.length > 0 && (
                  <div style={{ height: "1px", backgroundColor: "var(--color-teal-border)" }} />
                )}

                {/* Unpinned rows */}
                {unpinnedMatters.map((m, i) =>
                  renderRow(m, i === unpinnedMatters.length - 1, false, pinnedMatters.length + i)
                )}
              </Card>
            )}
          </div>

          {/* ── Two-column section ──────────────────────────────── */}
          <div className="grid pb-12" style={{ gridTemplateColumns: "3fr 2fr", gap: "var(--space-6)" }}>
            {/* Recent Activity */}
            <Card padding="none" className="overflow-hidden">
              <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                <h2 className="font-semibold" style={{ fontFamily: "var(--font-serif)", fontSize: "var(--text-lg)", color: "var(--color-ink)" }}>
                  Recent Activity
                </h2>
              </div>
              <div className="px-5">
                {activities.length === 0 ? (
                  <p className="py-8 text-center" style={{ fontSize: "var(--text-sm)", color: "var(--color-ink-muted)" }}>
                    Activity will appear here once you create a matter and upload a document.
                  </p>
                ) : (
                  activities.map((a, i) => (
                    <div
                      key={a.id}
                      className="flex items-start gap-3 py-3"
                      style={{ borderBottom: i < activities.length - 1 ? "1px solid var(--color-border-subtle)" : "none" }}
                    >
                      <div
                        className="mt-0.5 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ width: "24px", height: "24px", backgroundColor: "var(--color-paper-sunken)", color: "var(--color-ink-subtle)" }}
                      >
                        {activityIcon(a.action)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p style={{ fontSize: "var(--text-sm)", color: "var(--color-ink)" }}>
                          <span className="font-medium">{formatActivityAction(a.action)}</span>
                          {" — "}
                          <span style={{ color: "var(--color-ink-muted)" }}>{a.entityName}</span>
                        </p>
                      </div>
                      <span className="flex-shrink-0" style={{ fontSize: "var(--text-xs)", color: "var(--color-ink-subtle)" }}>
                        {timeAgo(a.timestamp)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </Card>

            {/* Pending Documents */}
            <Card padding="none" className="overflow-hidden">
              <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                <h2 className="font-semibold" style={{ fontFamily: "var(--font-serif)", fontSize: "var(--text-lg)", color: "var(--color-ink)" }}>
                  Pending Documents
                </h2>
              </div>
              <div className="px-5">
                {pending.length === 0 && queue.filter((q) => q.status !== "done" && q.status !== "error" && q.status !== "canceled").length === 0 ? (
                  <p className="py-8 text-center" style={{ fontSize: "var(--text-sm)", color: "var(--color-ink-muted)" }}>
                    Everything is up to date — no documents are currently being processed.
                  </p>
                ) : (
                  <>
                    {pending.map((d) => {
                      const stages = d.documentKind === "deposition"
                        ? ["Uploading", "Extracting", "Extracting testimony", "Done"]
                        : ["Uploading", "Extracting", "Analyzing", "Done"];
                      const stageIndex =
                        d.processingStage === "uploading" ? 0
                        : d.processingStage === "extracting" ? 1
                        : d.processingStage === "analyzing" ? 2
                        : 1;
                      return (
                        <div key={d.id} className="py-3" style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                          <div className="flex justify-between items-start mb-2">
                            <div className="min-w-0">
                              <p className="truncate font-medium" style={{ fontSize: "var(--text-sm)", color: "var(--color-ink)", maxWidth: "180px" }}>
                                {d.fileName}
                              </p>
                              <p style={{ fontSize: "var(--text-xs)", color: "var(--color-ink-muted)" }}>{d.matterName}</p>
                            </div>
                            <span className="flex-shrink-0" style={{ fontSize: "var(--text-xs)", color: "var(--color-warn)" }}>
                              {timeAgo(d.uploadedAt)}
                            </span>
                          </div>
                          <ProcessingStepper stages={stages} currentStage={stageIndex} />
                        </div>
                      );
                    })}
                    <UploadQueuePanel queue={queue} sessionStats={sessionStats} onCancel={cancel} onDismiss={dismiss} />
                  </>
                )}
              </div>
            </Card>
          </div>
        </>
      )}

      {/* ── Hover preview overlay ────────────────────────────────── */}
      {hoveredMatter && isHoverDevice && (
        <HoverPreview matter={hoveredMatter} pos={previewPos} />
      )}

      {/* ── Pin toast ────────────────────────────────────────────── */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-[var(--radius-md)]"
          style={{
            backgroundColor: "var(--color-ink)",
            color: "var(--color-paper)",
            fontSize: "var(--text-sm)",
            fontWeight: 500,
            boxShadow: "var(--shadow-lg)",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
