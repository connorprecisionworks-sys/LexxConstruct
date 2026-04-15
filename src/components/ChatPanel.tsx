"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { timeAgo } from "@/lib/utils";
import { PenLine, ArrowUpRight, Eye } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { ChatMessage, Citation, ChatAction } from "@/types";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ConvSummary {
  id: string;
  name: string;
  messageCount: number;
  preview: string;
  updatedAt: string;
}

interface FullConversation {
  id: string;
  messages: ChatMessage[];
}

// ── Markdown / citation renderer ─────────────────────────────────────────────

// Resolve a citation by number. Tries canonical "cite:N" ID first, then any
// ID that ends with the number, then falls back to 1-based array index.
function resolveCitation(num: number, citations: Citation[]): Citation | undefined {
  return (
    citations.find((c) => c.id === `cite:${num}`) ??
    citations.find((c) => c.id === `cite_${num}`) ??
    citations.find((c) => c.id === String(num)) ??
    (num >= 1 && num <= citations.length ? citations[num - 1] : undefined)
  );
}

// Splits a text string into alternating plain-text and structured-token segments.
// Tokens: citation markers in any model-output variant, **bold**, *italic*.
//
// Citation variants the model may produce:
//   [cite:1]  [cite: 1]  [cite_1]  [CITE:2]  [1]  [2]
//
// The regex uses a capturing group so that split() includes the matched tokens
// in the returned array (standard JS split-with-capture behavior).
const INLINE_SPLIT_RE =
  /(\[(?:cite[\s_:]*\s*)?\d+\]|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/i;

// Extracts the number from a citation marker token.
const CITE_NUM_RE = /^\[(?:cite[\s_:]*\s*)?(\d+)\]$/i;

function renderInline(
  text: string,
  citations: Citation[],
  onCiteClick: (c: Citation) => void
): React.ReactNode[] {
  // split() with a RegExp that has ONE capturing group includes the delimiters
  // in the result array. We do NOT use the /g flag here — split is always global.
  const parts = text.split(INLINE_SPLIT_RE);

  return parts.map((part, i) => {
    const citeMatch = part.match(CITE_NUM_RE);
    if (citeMatch) {
      const num = parseInt(citeMatch[1], 10);
      const citation = resolveCitation(num, citations);

      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.log(
          `[Lexx Chat] inline marker [${num}] →`,
          citation ? `"${citation.documentName}"` : `NOT FOUND (citations: ${JSON.stringify(citations.map((c) => c.id))})`
        );
      }

      return (
        <sup key={i}>
          <button
            type="button"
            onClick={() => {
              // eslint-disable-next-line no-console
              console.log("[Lexx Chat] citation clicked", num, citation);
              if (citation) {
                onCiteClick(citation);
              }
            }}
            className="text-accent text-[10px] font-bold hover:underline cursor-pointer px-0.5"
            title={citation?.documentName ?? `Citation ${num}`}
          >
            [{num}]
          </button>
        </sup>
      );
    }
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^\*[^*]+\*$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}

export function MarkdownMessage({
  content,
  citations,
  onCiteClick,
}: {
  content: string;
  citations: Citation[];
  onCiteClick: (c: Citation) => void;
}) {
  const paragraphs = content.split(/\n\n+/);
  return (
    <div className="space-y-2 text-sm leading-relaxed text-charcoal">
      {paragraphs.map((para, i) => {
        if (/^\d+\.\s/.test(para)) {
          const items = para.split(/\n(?=\d+\.\s)/).map((item) => item.replace(/^\d+\.\s*/, ""));
          return (
            <ol key={i} className="list-decimal list-inside space-y-1 pl-1">
              {items.map((item, j) => <li key={j}>{renderInline(item, citations, onCiteClick)}</li>)}
            </ol>
          );
        }
        if (para.startsWith("- ") || para.startsWith("* ")) {
          const items = para.split(/\n(?=[-*]\s)/).map((item) => item.replace(/^[-*]\s*/, ""));
          return (
            <ul key={i} className="list-disc list-inside space-y-1 pl-1">
              {items.map((item, j) => <li key={j}>{renderInline(item, citations, onCiteClick)}</li>)}
            </ul>
          );
        }
        if (para.startsWith("### ")) return <h4 key={i} className="text-sm font-semibold text-primary mt-3 mb-1">{renderInline(para.slice(4), citations, onCiteClick)}</h4>;
        if (para.startsWith("## ")) return <h3 key={i} className="text-sm font-semibold text-primary mt-3 mb-1">{renderInline(para.slice(3), citations, onCiteClick)}</h3>;
        return <p key={i}>{renderInline(para, citations, onCiteClick)}</p>;
      })}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface ChatPanelProps {
  matterId: string;
  matterName: string;
  documentCount: number;
  onClose: () => void;
  initialConversationId?: string;
  /** Render inline (full-page) instead of as a slide-in overlay */
  standalone?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function ChatPanel({
  matterId,
  matterName,
  documentCount,
  onClose,
  initialConversationId,
  standalone = false,
}: ChatPanelProps) {
  const router = useRouter();

  const [conversations, setConversations] = useState<ConvSummary[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(initialConversationId ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [convSearch, setConvSearch] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Welcome modal — show once per browser
  useEffect(() => {
    if (!localStorage.getItem("lexx_chat_welcome_seen")) setShowWelcome(true);
  }, []);

  // Load conversation list
  const loadConversations = useCallback(async () => {
    const res = await fetch(`/api/matters/${matterId}/conversations`);
    if (!res.ok) return;
    const data: ConvSummary[] = await res.json();
    setConversations(data);
    if (!selectedConvId && data.length > 0) setSelectedConvId(data[0].id);
  }, [matterId, selectedConvId]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Load messages when conversation changes
  useEffect(() => {
    if (!selectedConvId) { setMessages([]); return; }
    fetch(`/api/conversations/${selectedConvId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: FullConversation | null) => {
        if (d) setMessages(d.messages.filter((m) => m.role !== "system"));
      });
  }, [selectedConvId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function createConversation(): Promise<string | null> {
    const res = await fetch(`/api/matters/${matterId}/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New conversation" }),
    });
    if (!res.ok) return null;
    const conv = await res.json();
    setConversations((prev) => [{ id: conv.id, name: conv.name, messageCount: 0, preview: "", updatedAt: conv.updatedAt }, ...prev]);
    setSelectedConvId(conv.id);
    setMessages([]);
    setTimeout(() => inputRef.current?.focus(), 50);
    return conv.id;
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    let convId = selectedConvId ?? (await createConversation());
    if (!convId) return;

    setInput("");
    setLoading(true);
    setLoadingMsg("");

    // Optimistic user message
    setMessages((prev) => [...prev, {
      id: `opt_${Date.now()}`, role: "user", content: text, createdAt: new Date().toISOString(),
    }]);

    loadingTimerRef.current = setTimeout(() => setLoadingMsg("Working through the documents..."), 5000);
    const longTimer = setTimeout(() => setLoadingMsg("Still thinking. Complex questions take longer."), 15000);

    try {
      const res = await fetch(`/api/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      clearTimeout(longTimer);
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);

      if (res.ok) {
        const msg: ChatMessage = await res.json();
        setMessages((prev) => [...prev, msg]);
        const lr = await fetch(`/api/matters/${matterId}/conversations`);
        if (lr.ok) setConversations(await lr.json());
      } else {
        setMessages((prev) => [...prev, fallbackMsg()]);
      }
    } catch {
      clearTimeout(longTimer);
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
      setMessages((prev) => [...prev, { id: `err_${Date.now()}`, role: "assistant", content: "Something went wrong. Please check your connection and try again.", citations: [], suggestedActions: [], createdAt: new Date().toISOString() }]);
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  }

  function fallbackMsg(): ChatMessage {
    return { id: `err_${Date.now()}`, role: "assistant", content: "I had trouble formatting that response. Could you rephrase your question?", citations: [], suggestedActions: [], createdAt: new Date().toISOString() };
  }

  async function submitRename(id: string) {
    if (!renameValue.trim()) { setRenamingId(null); return; }
    await fetch(`/api/conversations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: renameValue.trim() }) });
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, name: renameValue.trim() } : c)));
    setRenamingId(null);
  }

  async function deleteConversation(id: string) {
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (selectedConvId === id) { setSelectedConvId(null); setMessages([]); }
  }

  function getActionIcon(type: string) {
    if (type?.startsWith("draft_")) return <PenLine className="h-4 w-4 flex-shrink-0" />;
    if (type?.startsWith("view_")) return <Eye className="h-4 w-4 flex-shrink-0" />;
    return <ArrowUpRight className="h-4 w-4 flex-shrink-0" />;
  }

  function buildActionUrl(action: ChatAction): string | null {
    const id = action.matterId ?? matterId;
    const maybePrefill = (action as Record<string, unknown>).prefill;
    const prefill = typeof maybePrefill === "string" && maybePrefill ? `&prefill=${encodeURIComponent(maybePrefill)}` : "";
    switch (action.type) {
      case "draft_claim_letter":
      case "draft_mediation_brief":
      case "draft_motion_outline":
      case "draft_demand_letter":
      case "draft_case_summary":
      case "draft_client_update":
      case "draft_delay_narrative":
      case "draft_defect_summary":
        return `/matters/${id}/workspace?action=${action.type}${prefill}`;
      case "draft_deposition_outline": {
        const docId = "documentId" in action ? action.documentId : null;
        if (!docId) { console.warn("[Lexx Chat] draft_deposition_outline missing documentId"); return null; }
        return `/matters/${id}/documents/${docId}/workspace?action=deposition_outline${prefill}`;
      }
      case "open_draft": {
        const draftId = "draftId" in action ? action.draftId : null;
        if (!draftId) { console.warn("[Lexx Chat] open_draft missing draftId"); return null; }
        return `/matters/${id}/workspace?draftId=${draftId}`;
      }
      case "open_document": {
        const docId = "documentId" in action ? action.documentId : null;
        if (!docId) { console.warn("[Lexx Chat] open_document missing documentId"); return null; }
        return `/matters/${id}/documents/${docId}`;
      }
      case "open_workspace":
        return `/matters/${id}/workspace`;
      case "open_matter":
        return `/matters/${id}`;
      default:
        return null;
    }
  }

  function handleSuggestedAction(action: ChatAction) {
    const url = buildActionUrl(action);
    if (!url) return;
    if (!standalone) onClose();
    router.push(url);
  }

  const filteredConvs = conversations.filter((c) =>
    !convSearch || c.name.toLowerCase().includes(convSearch.toLowerCase())
  );

  // ── Inner content ──────────────────────────────────────────
  const innerContent = (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface flex-shrink-0">
        <svg className="h-4 w-4 text-accent flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
        </svg>
        <span className="text-sm font-semibold text-primary truncate flex-1">{matterName}</span>
        <div className="flex items-center gap-1 px-1.5 py-0.5 bg-[#EEF2FF] rounded text-[10px] font-medium text-accent flex-shrink-0">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
          {documentCount} doc{documentCount !== 1 ? "s" : ""} in scope
        </div>
        {!standalone && (
          <button onClick={onClose} className="p-1.5 rounded hover:bg-accent-light text-muted hover:text-charcoal transition-colors flex-shrink-0" aria-label="Close chat">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <div className="w-[220px] border-r border-border flex flex-col flex-shrink-0 bg-surface">
          <div className="p-3 flex flex-col gap-2">
            <button onClick={() => createConversation()} className="w-full flex items-center gap-1.5 px-3 py-2 bg-accent text-white text-xs font-medium rounded-[6px] hover:bg-accent-hover transition-colors">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              New Conversation
            </button>
            <input type="text" placeholder="Search..." value={convSearch} onChange={(e) => setConvSearch(e.target.value)} className="w-full px-2.5 py-1.5 text-xs border border-border rounded-[4px] focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent bg-white" />
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredConvs.length === 0 && (
              <p className="text-[11px] text-muted text-center mt-6 px-3">{conversations.length === 0 ? "No conversations yet." : "No matches."}</p>
            )}
            {filteredConvs.map((conv) => (
              <div key={conv.id} className={`group relative px-3 py-2.5 cursor-pointer border-b border-border/50 transition-colors ${selectedConvId === conv.id ? "bg-accent-light border-l-2 border-l-accent" : "hover:bg-row-alt border-l-2 border-l-transparent"}`}>
                {renamingId === conv.id ? (
                  <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onBlur={() => submitRename(conv.id)} onKeyDown={(e) => { if (e.key === "Enter") submitRename(conv.id); if (e.key === "Escape") setRenamingId(null); }} className="w-full text-xs px-1 py-0.5 border border-accent rounded focus:outline-none" onClick={(e) => e.stopPropagation()} />
                ) : (
                  <div onClick={() => { setSelectedConvId(conv.id); setMenuOpenId(null); }}>
                    <p className="text-xs font-medium text-primary truncate pr-5">{conv.name}</p>
                    {conv.preview && <p className="text-[10px] text-muted truncate mt-0.5">{conv.preview}</p>}
                    <p className="text-[10px] text-muted mt-0.5">{timeAgo(conv.updatedAt)}</p>
                  </div>
                )}
                <button className={`absolute right-2 top-2.5 p-0.5 rounded transition-opacity ${menuOpenId === conv.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"} text-muted hover:text-charcoal`} onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === conv.id ? null : conv.id); }}>
                  <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M6 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm6 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm6 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" /></svg>
                </button>
                {menuOpenId === conv.id && (
                  <div className="absolute right-2 top-7 bg-white border border-border rounded shadow-lg z-10 py-1 min-w-[110px]" onClick={(e) => e.stopPropagation()}>
                    <button className="w-full text-left px-3 py-1.5 text-xs text-charcoal hover:bg-row-alt" onClick={() => { setRenamingId(conv.id); setRenameValue(conv.name); setMenuOpenId(null); }}>Rename</button>
                    <button className="w-full text-left px-3 py-1.5 text-xs text-[#DC2626] hover:bg-[#FEE2E2]" onClick={() => { deleteConversation(conv.id); setMenuOpenId(null); }}>Delete</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Main message area */}
        <div className="flex-1 flex flex-col min-w-0 relative" onClick={() => setMenuOpenId(null)}>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center h-full text-center py-16">
                <div className="text-2xl font-bold text-primary mb-2">Lexx</div>
                <p className="text-sm text-muted max-w-xs leading-relaxed">
                  Ask anything about <strong>{matterName}</strong>. I can reference {documentCount} document{documentCount !== 1 ? "s" : ""} in this case.
                </p>
              </div>
            )}

            {messages.map((msg) => {
              if (msg.role === "user") {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[70%] bg-accent text-white rounded-[12px] rounded-tr-[4px] px-4 py-2.5 text-sm leading-relaxed">
                      {msg.content}
                    </div>
                  </div>
                );
              }
              return (
                <div key={msg.id} className="flex justify-start">
                  <div className="max-w-[85%] flex flex-col gap-2">
                    <div className="bg-white border border-border rounded-[12px] rounded-tl-[4px] px-4 py-3 shadow-sm">
                      <MarkdownMessage content={msg.content} citations={msg.citations ?? []} onCiteClick={setActiveCitation} />
                      <p className="text-[10px] text-muted mt-2 pt-2 border-t border-border/50">AI output. Verify against source documents.</p>
                    </div>
                    {(msg.citations ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 px-1">
                        {(msg.citations ?? []).map((cite) => (
                          <button key={cite.id} onClick={() => setActiveCitation(cite)} className="flex items-center gap-1 px-2 py-0.5 bg-[#F3F4F6] hover:bg-accent-light text-[10px] font-medium text-charcoal rounded-full border border-border/60 hover:border-accent/40 transition-colors">
                            <span className="text-accent font-bold">[{cite.id.replace("cite:", "")}]</span>
                            <span className="truncate max-w-[120px]">{cite.documentName}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {(msg.suggestedActions ?? []).length > 0 && (
                      <div className="flex flex-col gap-[var(--space-2,8px)] px-1 pt-[var(--space-3,12px)] border-t border-[var(--color-border-subtle,#E5E7EB)]">
                        <p className="text-xs text-[var(--color-ink-muted)] text-[var(--color-ink-muted,#6B7280)]">Suggested next steps</p>
                        {(msg.suggestedActions ?? []).map((action, i) => {
                          const url = buildActionUrl(action);
                          const disabled = url === null;
                          return (
                            <Button
                              key={i}
                              variant="secondary"
                              size="base"
                              disabled={disabled}
                              onClick={() => handleSuggestedAction(action)}
                              title={disabled ? "Action incomplete" : undefined}
                              className="justify-start"
                            >
                              {getActionIcon(action.type)}
                              {action.label || "Open"}
                            </Button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Typing indicator */}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-border rounded-[12px] rounded-tl-[4px] px-4 py-3 shadow-sm">
                  {loadingMsg
                    ? <p className="text-xs text-muted">{loadingMsg}</p>
                    : <div className="flex items-center gap-1 py-1">
                        <span className="h-1.5 w-1.5 bg-muted rounded-full animate-bounce [animation-delay:0ms]" />
                        <span className="h-1.5 w-1.5 bg-muted rounded-full animate-bounce [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 bg-muted rounded-full animate-bounce [animation-delay:300ms]" />
                      </div>
                  }
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border p-3 flex-shrink-0 bg-white">
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Ask about this matter..."
                rows={2}
                disabled={loading}
                className="flex-1 px-3 py-2 text-sm border border-border rounded-[6px] resize-none focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent disabled:opacity-50 disabled:bg-surface"
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-[6px] hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed h-[52px] flex items-center gap-1.5"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" /></svg>
                Send
              </button>
            </div>
            <p className="text-[10px] text-muted mt-1.5 text-center">Shift+Enter for new line · Scoped to this matter only</p>
          </div>

          {/* Citation drawer */}
          {activeCitation && (
            <div className="absolute inset-y-0 right-0 w-[320px] bg-white border-l border-border shadow-xl flex flex-col z-10">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface">
                <h3 className="text-xs font-semibold text-primary">Source Citation</h3>
                <button onClick={() => setActiveCitation(null)} className="p-1 rounded hover:bg-accent-light text-muted">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div>
                  <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">Document</p>
                  <p className="text-sm font-medium text-primary">{activeCitation.documentName}</p>
                  {activeCitation.location && <p className="text-xs text-muted mt-0.5">{activeCitation.location}</p>}
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">Cited Text</p>
                  <blockquote className="text-sm text-charcoal leading-relaxed bg-[#FFFBEB] border-l-2 border-[#D97706] px-3 py-2 rounded-r-[4px]">
                    {activeCitation.excerpt}
                  </blockquote>
                </div>
              </div>
              <div className="p-4 border-t border-border">
                <button
                  onClick={() => {
                    const docId = activeCitation.documentId;
                    setActiveCitation(null);
                    if (!standalone) onClose();
                    router.push(`/matters/${matterId}/documents/${docId}`);
                  }}
                  className="w-full px-3 py-2 text-xs font-medium text-accent border border-accent rounded-[6px] hover:bg-accent-light transition-colors"
                >
                  Open full document
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Welcome modal
  const welcomeModal = showWelcome && (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-8 w-8 bg-accent rounded-lg flex items-center justify-center">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-primary">Welcome to Lexx Chat</h2>
        </div>
        <div className="space-y-3 text-sm text-charcoal leading-relaxed">
          <p>This chat is <strong>scoped to this matter only</strong>. It cannot access other cases, the internet, or external information.</p>
          <p>Every answer cites the documents it&apos;s based on. <strong>Click any citation to verify</strong> the source.</p>
          <p className="text-muted text-xs border-t border-border pt-3">Lexx Chat is not a substitute for legal judgment. Review all responses before relying on them.</p>
        </div>
        <button
          onClick={() => { localStorage.setItem("lexx_chat_welcome_seen", "1"); setShowWelcome(false); }}
          className="mt-4 w-full px-4 py-2.5 bg-accent text-white text-sm font-medium rounded-[6px] hover:bg-accent-hover transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────
  if (standalone) {
    return (
      <>
        <div className="flex-1 flex flex-col min-h-0 h-full">{innerContent}</div>
        {welcomeModal}
      </>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      {/* Slide-in panel */}
      <div className="fixed top-0 right-0 bottom-0 w-[900px] max-w-[calc(100vw-240px)] bg-white shadow-2xl z-50 border-l border-border">
        {innerContent}
      </div>
      {welcomeModal}
    </>
  );
}
