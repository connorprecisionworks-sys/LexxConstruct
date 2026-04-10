"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChatPanel } from "@/components/ChatPanel";

interface Matter {
  id: string;
  name: string;
  clientName: string;
  status: string;
}

function ChatPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialMatterId = searchParams?.get("matterId") ?? null;

  const [matters, setMatters] = useState<Matter[]>([]);
  const [selectedMatter, setSelectedMatter] = useState<Matter | null>(null);
  const [docCounts, setDocCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/matters")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Matter[]) => {
        const list = Array.isArray(data) ? data : [];
        setMatters(list);
        if (initialMatterId) {
          setSelectedMatter(list.find((m) => m.id === initialMatterId) ?? null);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [initialMatterId]);

  useEffect(() => {
    if (matters.length === 0) return;
    Promise.all(
      matters.map(async (m) => {
        try {
          const r = await fetch(`/api/documents?matterId=${m.id}`);
          if (!r.ok) return [m.id, 0] as [string, number];
          const docs: Array<{ status: string }> = await r.json();
          return [m.id, docs.filter((d) => d.status === "ready").length] as [string, number];
        } catch {
          return [m.id, 0] as [string, number];
        }
      })
    ).then((entries) => setDocCounts(Object.fromEntries(entries)));
  }, [matters]);

  const STATUS_BADGE: Record<string, string> = {
    active: "bg-[#D1FAE5] text-[#059669]",
    on_hold: "bg-[#FEF3C7] text-[#D97706]",
    closed: "bg-[#F3F4F6] text-[#6B7280]",
  };

  const filteredMatters = matters.filter(
    (m) => !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.clientName.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="px-8 py-20 flex items-center justify-center">
        <svg className="animate-spin h-4 w-4 text-accent mr-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-sm text-muted">Loading...</span>
      </div>
    );
  }

  // Matter selected — render ChatPanel in standalone (full-page) mode
  if (selectedMatter) {
    return (
      <div className="flex flex-col h-screen">
        {/* Switch matter bar */}
        <div className="px-6 py-2.5 border-b border-border bg-surface flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => { setSelectedMatter(null); router.push("/chat", { scroll: false }); }}
            className="flex items-center gap-1.5 text-xs text-muted hover:text-charcoal transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            Switch matter
          </button>
          <span className="text-muted text-xs">·</span>
          <span className="text-sm font-medium text-primary">{selectedMatter.name}</span>
        </div>
        <div className="flex-1 min-h-0">
          <ChatPanel
            standalone
            matterId={selectedMatter.id}
            matterName={selectedMatter.name}
            documentCount={docCounts[selectedMatter.id] ?? 0}
            onClose={() => {}}
          />
        </div>
      </div>
    );
  }

  // No matter selected — show picker
  return (
    <div className="px-8 py-8 max-w-[700px]">
      <div className="text-xs text-muted mb-6 flex items-center gap-1.5">
        <Link href="/" className="hover:text-accent transition-colors">Dashboard</Link>
        <span>/</span>
        <span className="text-primary">Chat</span>
      </div>

      <h1 className="text-xl font-semibold text-primary mb-1">Select a matter to begin</h1>
      <p className="text-sm text-muted mb-6">
        Lexx Chat is scoped to one matter at a time. Select a matter to chat about its documents.
      </p>

      <input
        type="text"
        placeholder="Search matters..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-3 py-2 mb-4 border border-border rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent bg-white"
      />

      {filteredMatters.length === 0 ? (
        <div className="text-center py-10 bg-surface border border-border rounded-lg">
          <p className="text-sm text-muted">
            {matters.length === 0 ? "No matters yet." : "No matters match your search."}
          </p>
          {matters.length === 0 && (
            <Link href="/" className="text-sm text-accent hover:underline mt-2 inline-block">Go to dashboard to create one</Link>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredMatters.map((m) => (
            <button
              key={m.id}
              onClick={() => { setSelectedMatter(m); router.push(`/chat?matterId=${m.id}`, { scroll: false }); }}
              className="w-full flex items-center gap-4 px-4 py-3 bg-surface border border-border rounded-lg hover:border-accent/40 hover:bg-accent-light/30 transition-colors text-left group"
              style={{ boxShadow: "var(--shadow)" }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-primary truncate">{m.name}</p>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${STATUS_BADGE[m.status] ?? STATUS_BADGE.active}`}>
                    {m.status?.replace("_", " ") ?? "active"}
                  </span>
                </div>
                <p className="text-xs text-muted mt-0.5 truncate">{m.clientName}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-xs text-muted">
                  {docCounts[m.id] !== undefined ? `${docCounts[m.id]} doc${docCounts[m.id] !== 1 ? "s" : ""}` : ""}
                </span>
                <svg className="h-4 w-4 text-muted group-hover:text-accent transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="px-8 py-20 text-sm text-muted">Loading...</div>}>
      <ChatPageInner />
    </Suspense>
  );
}
