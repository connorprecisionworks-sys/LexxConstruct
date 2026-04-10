"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { timeAgo } from "@/lib/utils";
import { ProcessingStepper } from "@/components/ProcessingStepper";
import { UploadQueuePanel } from "@/components/UploadQueuePanel";
import { useUploadQueue } from "@/hooks/useUploadQueue";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stat } from "@/components/ui/Stat";

interface Matter {
  id: string;
  name: string;
  clientName: string;
  matterType: string;
  caseType?: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
}
interface MatterWithCount extends Matter { documentCount: number; }
interface Stats { totalMatters: number; documentsProcessed: number; draftsGenerated: number; timeSavedMinutes: number; }
interface PendingDoc { id: string; fileName: string; matterId: string; matterName: string; uploadedAt: string; processingStage?: string; documentKind?: string; }
interface RecentDraft { id: string; title: string; draftType: string; documentId: string; documentName: string; matterId: string; matterName: string; createdAt: string; }
interface Activity { id: string; action: string; entityName: string; matterId: string; timestamp: string; }

const CASE_TYPE_LABELS: Record<string, string> = {
  construction_general: "Construction",
  construction_delay: "Delay Claim",
  construction_defect: "Defect Claim",
  construction_payment: "Payment/Lien",
  other: "Other",
};

const ACTION_LABELS: Record<string, string> = {
  matter_created: "Matter created",
  document_uploaded: "Document uploaded",
  document_processed: "Document processed",
  draft_generated: "Draft generated",
  note_added: "Note added",
  flag_added: "Flag added",
  case_intelligence_built: "Case intelligence built",
  chat_message_sent: "Chat message sent",
};

const STATUS_BADGE: Record<string, "mint" | "warn" | "neutral"> = {
  active: "mint",
  on_hold: "warn",
  closed: "neutral",
};

function todayFormatted() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function activityIcon(action: string) {
  if (action === "matter_created") {
    return (
      <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v8.25A2.25 2.25 0 0 0 4.5 16.5h15a2.25 2.25 0 0 0 2.25-2.25V9A2.25 2.25 0 0 0 19.5 6.75h-6.69Z" />
      </svg>
    );
  }
  if (action === "document_uploaded" || action === "document_processed") {
    return (
      <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    );
  }
  if (action === "draft_generated") {
    return (
      <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
      </svg>
    );
  }
  return (
    <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

export default function Dashboard() {
  const [matters, setMatters] = useState<MatterWithCount[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pending, setPending] = useState<PendingDoc[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [caseType, setCaseType] = useState("construction_general");
  const [error, setError] = useState<string | null>(null);
  const [openFlagsCount, setOpenFlagsCount] = useState(0);
  const [recentDraftsCount, setRecentDraftsCount] = useState(0);
  const { queue, cancel, dismiss, sessionStats } = useUploadQueue();

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

      // Build doc counts and pending list per matter
      const allDocsPromises = mattersData.map(async (m) => {
        const r = await fetch(`/api/documents?matterId=${m.id}`);
        return {
          matterId: m.id,
          matterName: m.name,
          docs: r.ok
            ? (await r.json()) as { id: string; fileName: string; status: string; uploadedAt: string; processingStage?: string; documentKind?: string }[]
            : [],
        };
      });
      const allDocsByMatter = await Promise.all(allDocsPromises);

      const withCounts = mattersData.map((m) => {
        const found = allDocsByMatter.find((d) => d.matterId === m.id);
        return { ...m, documentCount: found?.docs?.length ?? 0 };
      }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setMatters(withCounts);

      // Pending documents
      const pendingDocs: PendingDoc[] = [];
      allDocsByMatter.forEach((entry) => {
        if (Array.isArray(entry.docs)) {
          entry.docs
            .filter((d) => d.status === "processing" || d.status === "uploading")
            .forEach((d) => {
              pendingDocs.push({
                id: d.id,
                fileName: d.fileName,
                matterId: entry.matterId,
                matterName: entry.matterName,
                uploadedAt: d.uploadedAt,
                processingStage: d.processingStage,
                documentKind: d.documentKind,
              });
            });
        }
      });
      setPending(pendingDocs);

      // Stats
      if (statsRes.ok) setStats(await statsRes.json());

      // Activities
      if (activityRes.ok) setActivities(await activityRes.json());

      // Drafts in progress (created in last 7 days)
      if (draftsRes.ok) {
        const allDrafts = await draftsRes.json();
        if (Array.isArray(allDrafts)) {
          const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          setRecentDraftsCount(allDrafts.filter((d: { createdAt: string }) => d.createdAt > cutoff).length);
        }
      }

      // Open flags — fetch per matter, sum unresolved
      const flagCounts = await Promise.all(
        mattersData.map(async (m) => {
          try {
            const r = await fetch(`/api/matters/${m.id}/flags`);
            if (!r.ok) return 0;
            const flags = await r.json();
            return Array.isArray(flags) ? flags.filter((f: { resolved?: boolean }) => !f.resolved).length : 0;
          } catch { return 0; }
        })
      );
      setOpenFlagsCount(flagCounts.reduce((a, b) => a + b, 0));

    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-refresh: 3s when docs are processing, 10s otherwise
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

  const activeMattersCount = matters.filter((m) => m.status !== "closed").length;

  return (
    <div
      style={{
        paddingLeft: "var(--space-8)",
        paddingRight: "var(--space-8)",
        maxWidth: "1200px",
      }}
    >
      {/* Error banner */}
      {error && (
        <div
          className="flex items-center justify-between px-4 py-3 rounded-[var(--radius-md)] mb-6"
          style={{
            marginTop: "var(--space-8)",
            backgroundColor: "var(--color-danger-soft)",
            border: "1px solid #FECACA",
          }}
        >
          <span style={{ fontSize: "var(--text-sm)", color: "var(--color-danger)" }}>{error}</span>
          <button
            onClick={fetchAll}
            className="font-medium hover:underline"
            style={{ fontSize: "var(--text-xs)", color: "var(--color-danger)" }}
          >
            Retry
          </button>
        </div>
      )}

      <PageHeader
        title="Dashboard"
        subtitle={todayFormatted()}
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
            style={{
              backgroundColor: "var(--color-paper)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xl)",
              padding: "var(--space-6)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <h2
              className="font-semibold mb-5"
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: "var(--text-lg)",
                color: "var(--color-ink)",
              }}
            >
              Create New Matter
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
              <Input
                label="Matter Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Acme Construction v. Bayshore Development"
                required
                autoFocus
              />
              <Input
                label="Client Name"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g. Acme Construction, Inc."
                required
              />
              <div>
                <label
                  className="block font-medium mb-1.5"
                  style={{ fontSize: "var(--text-sm)", color: "var(--color-ink-muted)" }}
                >
                  Case Type
                </label>
                <select
                  value={caseType}
                  onChange={(e) => setCaseType(e.target.value)}
                  className="h-9 w-full px-3 rounded-[var(--radius-md)] focus:outline-none"
                  style={{
                    border: "1px solid var(--color-border-strong)",
                    backgroundColor: "var(--color-paper)",
                    fontSize: "var(--text-base)",
                    color: "var(--color-ink)",
                  }}
                >
                  <option value="construction_general">Construction — General Dispute</option>
                  <option value="construction_delay">Construction — Delay Claim</option>
                  <option value="construction_defect">Construction — Defect Claim</option>
                  <option value="construction_payment">Construction — Payment / Lien</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={creating}>
                {creating ? "Creating…" : "Create Matter"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <svg
            className="animate-spin h-5 w-5 mr-3"
            style={{ color: "var(--color-teal)" }}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span style={{ fontSize: "var(--text-sm)", color: "var(--color-ink-muted)" }}>Loading…</span>
        </div>
      ) : (
        <>
          {/* ── Stat strip ──────────────────────────────────────── */}
          <div
            className="grid grid-cols-4 mb-8"
            style={{ gap: "var(--space-6)" }}
          >
            <Card padding="md">
              <Stat label="Active Matters" value={activeMattersCount} />
            </Card>
            <Card padding="md">
              <Stat label="Documents Processed" value={stats?.documentsProcessed ?? 0} />
            </Card>
            <Card padding="md">
              <Stat label="Open Flags" value={openFlagsCount} />
            </Card>
            <Card padding="md">
              <Stat label="Drafts in Progress" value={recentDraftsCount} meta="last 7 days" />
            </Card>
          </div>

          {/* ── Matters table ───────────────────────────────────── */}
          <div className="mb-8">
            {matters.length === 0 ? (
              <Card padding="none">
                <div className="text-center py-16 px-6">
                  <p
                    className="font-medium"
                    style={{ fontSize: "var(--text-md)", color: "var(--color-ink)" }}
                  >
                    No matters yet
                  </p>
                  <p
                    className="mt-1"
                    style={{ fontSize: "var(--text-sm)", color: "var(--color-ink-muted)" }}
                  >
                    Create your first matter to get started.
                  </p>
                  <div className="mt-5">
                    <Button variant="primary" onClick={() => setShowForm(true)}>
                      New Matter
                    </Button>
                  </div>
                </div>
              </Card>
            ) : (
              <Card padding="none" className="overflow-hidden">
                {/* Table header */}
                <div
                  className="grid items-center"
                  style={{
                    gridTemplateColumns: "minmax(0,2fr) minmax(0,1.4fr) 110px 90px 64px 80px 28px",
                    padding: "0 var(--space-5)",
                    height: "36px",
                    borderBottom: "1px solid var(--color-border)",
                  }}
                >
                  {["Matter", "Client", "Case Type", "Status", "Docs", "Updated", ""].map((h) => (
                    <span
                      key={h}
                      style={{
                        fontSize: "var(--text-xs)",
                        fontWeight: 600,
                        color: "var(--color-ink-subtle)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {h}
                    </span>
                  ))}
                </div>

                {/* Rows */}
                {matters.map((m, i) => (
                  <Link
                    key={m.id}
                    href={`/matters/${m.id}`}
                    className="grid items-center group"
                    style={{
                      gridTemplateColumns: "minmax(0,2fr) minmax(0,1.4fr) 110px 90px 64px 80px 28px",
                      padding: "var(--space-3) var(--space-5)",
                      borderBottom: i < matters.length - 1 ? "1px solid var(--color-border-subtle)" : "none",
                      transition: "background-color var(--duration-fast) ease",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-paper-raised)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                    }}
                  >
                    <span
                      className="truncate font-medium"
                      style={{ fontFamily: "var(--font-serif)", fontSize: "var(--text-md)", color: "var(--color-ink)" }}
                    >
                      {m.name}
                    </span>
                    <span
                      className="truncate"
                      style={{ fontSize: "var(--text-sm)", color: "var(--color-ink-muted)" }}
                    >
                      {m.clientName}
                    </span>
                    <div>
                      <Badge variant="neutral" size="sm">
                        {CASE_TYPE_LABELS[m.caseType ?? m.matterType] ?? "Construction"}
                      </Badge>
                    </div>
                    <div>
                      <Badge
                        variant={STATUS_BADGE[m.status] ?? "neutral"}
                        size="sm"
                      >
                        {m.status?.replace("_", " ") ?? "active"}
                      </Badge>
                    </div>
                    <span style={{ fontSize: "var(--text-sm)", color: "var(--color-ink-subtle)" }}>
                      {m.documentCount}
                    </span>
                    <span style={{ fontSize: "var(--text-sm)", color: "var(--color-ink-subtle)" }}>
                      {timeAgo(m.updatedAt ?? m.createdAt)}
                    </span>
                    <svg
                      className="h-4 w-4 transition-colors duration-[var(--duration-fast)]"
                      style={{ color: "var(--color-ink-faint)" }}
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                  </Link>
                ))}
              </Card>
            )}
          </div>

          {/* ── Two-column section ──────────────────────────────── */}
          <div
            className="grid pb-12"
            style={{ gridTemplateColumns: "3fr 2fr", gap: "var(--space-6)" }}
          >
            {/* Recent Activity (60%) */}
            <Card padding="none" className="overflow-hidden">
              <div
                className="px-5 py-4"
                style={{ borderBottom: "1px solid var(--color-border-subtle)" }}
              >
                <h2
                  className="font-semibold"
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontSize: "var(--text-lg)",
                    color: "var(--color-ink)",
                  }}
                >
                  Recent Activity
                </h2>
              </div>
              <div className="px-5">
                {activities.length === 0 ? (
                  <p
                    className="py-8 text-center"
                    style={{ fontSize: "var(--text-sm)", color: "var(--color-ink-muted)" }}
                  >
                    Activity will appear here once you create a matter and upload a document.
                  </p>
                ) : (
                  activities.map((a, i) => (
                    <div
                      key={a.id}
                      className="flex items-start gap-3 py-3"
                      style={{
                        borderBottom: i < activities.length - 1 ? "1px solid var(--color-border-subtle)" : "none",
                      }}
                    >
                      <div
                        className="mt-0.5 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{
                          width: "24px",
                          height: "24px",
                          backgroundColor: "var(--color-paper-sunken)",
                          color: "var(--color-ink-subtle)",
                        }}
                      >
                        {activityIcon(a.action)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p style={{ fontSize: "var(--text-sm)", color: "var(--color-ink)" }}>
                          <span className="font-medium">{ACTION_LABELS[a.action] ?? a.action}</span>
                          {" — "}
                          <span style={{ color: "var(--color-ink-muted)" }}>{a.entityName}</span>
                        </p>
                      </div>
                      <span
                        className="flex-shrink-0"
                        style={{ fontSize: "var(--text-xs)", color: "var(--color-ink-subtle)" }}
                      >
                        {timeAgo(a.timestamp)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </Card>

            {/* Pending Documents (40%) */}
            <Card padding="none" className="overflow-hidden">
              <div
                className="px-5 py-4"
                style={{ borderBottom: "1px solid var(--color-border-subtle)" }}
              >
                <h2
                  className="font-semibold"
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontSize: "var(--text-lg)",
                    color: "var(--color-ink)",
                  }}
                >
                  Pending Documents
                </h2>
              </div>
              <div className="px-5">
                {pending.length === 0 && queue.filter((q) => q.status !== "done" && q.status !== "error" && q.status !== "canceled").length === 0 ? (
                  <p
                    className="py-8 text-center"
                    style={{ fontSize: "var(--text-sm)", color: "var(--color-ink-muted)" }}
                  >
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
                        <div
                          key={d.id}
                          className="py-3"
                          style={{ borderBottom: "1px solid var(--color-border-subtle)" }}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="min-w-0">
                              <p
                                className="truncate font-medium"
                                style={{ fontSize: "var(--text-sm)", color: "var(--color-ink)", maxWidth: "180px" }}
                              >
                                {d.fileName}
                              </p>
                              <p style={{ fontSize: "var(--text-xs)", color: "var(--color-ink-muted)" }}>
                                {d.matterName}
                              </p>
                            </div>
                            <span
                              className="flex-shrink-0"
                              style={{ fontSize: "var(--text-xs)", color: "var(--color-warn)" }}
                            >
                              {timeAgo(d.uploadedAt)}
                            </span>
                          </div>
                          <ProcessingStepper stages={stages} currentStage={stageIndex} />
                        </div>
                      );
                    })}
                    <UploadQueuePanel
                      queue={queue}
                      sessionStats={sessionStats}
                      onCancel={cancel}
                      onDismiss={dismiss}
                    />
                  </>
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
