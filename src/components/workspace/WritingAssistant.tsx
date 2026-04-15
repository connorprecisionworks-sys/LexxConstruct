"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Send, Loader2 } from "lucide-react";
import type { DraftAssistantMessage, SuggestedEdit } from "@/types";

interface Props {
  draftId: string | null;
  draftTitle: string;
  draftType: string;
  matterId: string;
  docCount: number;
  otherDraftCount: number;
  isOpen: boolean;
  onToggle: () => void;
  onApplySuggestion: (edit: SuggestedEdit) => void;
  /** Plain text of the current draft (from editor) — used in the rewrite_paragraph shortcut */
  hasSelection?: boolean;
}

const SHORTCUT_PROMPTS = [
  { label: "Strengthen opening", prompt: "Strengthen the opening paragraph to be more direct and compelling for opposing counsel." },
  { label: "Add facts", prompt: "Identify 1–2 key case facts that are missing from this draft and suggest where to add them." },
  { label: "Rewrite selected", prompt: "Rewrite my selected text to be more precise and legally persuasive.", needsSelection: true },
  { label: "Tighten language", prompt: "Review the draft for any wordy or passive phrasing and suggest tighter alternatives." },
];

interface EditState {
  applied: boolean;
  dismissed: boolean;
  expanded: boolean;
}

export default function WritingAssistant({
  draftId,
  draftTitle,
  draftType,
  matterId,
  docCount,
  otherDraftCount,
  isOpen,
  onToggle,
  onApplySuggestion,
  hasSelection = false,
}: Props) {
  const [messages, setMessages] = useState<DraftAssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchingHistory, setFetchingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editStates, setEditStates] = useState<Record<string, EditState>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevDraftIdRef = useRef<string | null>(null);

  // Load conversation history when draftId changes or panel opens
  useEffect(() => {
    if (!draftId || !isOpen) return;
    if (draftId === prevDraftIdRef.current) return;
    prevDraftIdRef.current = draftId;

    setFetchingHistory(true);
    setMessages([]);
    setError(null);
    setEditStates({});

    fetch(`/api/drafts/${draftId}/assistant`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.messages)) {
          setMessages(data.messages);
        }
      })
      .catch(() => {/* silently ignore — start fresh */})
      .finally(() => setFetchingHistory(false));
  }, [draftId, isOpen]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const sendMessage = useCallback(async (content: string) => {
    if (!draftId || !content.trim() || loading) return;
    const trimmed = content.trim();
    setInput("");
    setError(null);
    setLoading(true);

    // Optimistically add user message
    const optimisticUser: DraftAssistantMessage = {
      id: `opt-${Date.now()}`,
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);

    try {
      const res = await fetch(`/api/drafts/${draftId}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();
      const assistantMsg: DraftAssistantMessage = data.assistantMessage;
      // Replace optimistic + add assistant
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimisticUser.id),
        { ...optimisticUser, id: data.userMessageId ?? optimisticUser.id },
        assistantMsg,
      ]);
      // Init edit states
      if (assistantMsg.suggestedEdits?.length) {
        setEditStates((prev) => {
          const next = { ...prev };
          assistantMsg.suggestedEdits!.forEach((e) => {
            if (!next[e.id]) next[e.id] = { applied: false, dismissed: false, expanded: false };
          });
          return next;
        });
      }
    } catch {
      setError("Couldn't reach the assistant. Please try again.");
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id));
    } finally {
      setLoading(false);
    }
  }, [draftId, loading]);

  async function handleClear() {
    if (!draftId) return;
    if (messages.length > 0 && !window.confirm("Clear this conversation? This cannot be undone.")) return;
    await fetch(`/api/drafts/${draftId}/assistant`, { method: "DELETE" });
    setMessages([]);
    setEditStates({});
    setError(null);
    prevDraftIdRef.current = null; // force reload
    prevDraftIdRef.current = draftId;
  }

  function handleApply(edit: SuggestedEdit) {
    onApplySuggestion(edit);
    setEditStates((prev) => ({ ...prev, [edit.id]: { ...prev[edit.id], applied: true, dismissed: false } }));
    // Log activity
    fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "draft_assist_applied", matterId, entityName: draftTitle }),
    }).catch(() => {});
  }

  function handleDismiss(editId: string) {
    setEditStates((prev) => ({ ...prev, [editId]: { ...prev[editId], dismissed: true } }));
  }

  function toggleExpand(editId: string) {
    setEditStates((prev) => ({ ...prev, [editId]: { ...prev[editId], expanded: !prev[editId]?.expanded } }));
  }

  const draftLabel = draftType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  // ── Collapsed strip ──────────────────────────────────────────────────────────
  if (!isOpen) {
    return (
      <div
        className="flex flex-col items-center justify-between py-4 cursor-pointer select-none border-l border-border bg-[#FAFAFA] hover:bg-accent-light/30 transition-colors"
        style={{ width: 44 }}
        onClick={onToggle}
        title="Open Writing Assistant"
      >
        <button className="p-1.5 rounded hover:bg-accent-light transition-colors" aria-label="Open Writing Assistant">
          <ChevronLeft className="h-3.5 w-3.5 text-muted" />
        </button>
        <span
          className="text-[10px] font-semibold text-muted uppercase tracking-widest"
          style={{ writingMode: "vertical-rl", textOrientation: "mixed", transform: "rotate(180deg)" }}
        >
          Writing Assistant
        </span>
        <div style={{ width: 28 }} />
      </div>
    );
  }

  // ── Expanded panel ───────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col border-l border-border bg-[#FAFAFA]" style={{ width: 360 }}>
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-border bg-white">
        <div className="flex items-center gap-2">
          <button
            onClick={onToggle}
            className="p-1 rounded hover:bg-accent-light transition-colors"
            aria-label="Collapse Writing Assistant"
          >
            <ChevronRight className="h-3.5 w-3.5 text-muted" />
          </button>
          <span className="text-sm font-semibold text-primary" style={{ fontFamily: "var(--font-serif, Georgia, serif)" }}>
            Writing Assistant
          </span>
        </div>
        <button
          onClick={handleClear}
          className="p-1.5 rounded hover:bg-accent-light transition-colors"
          aria-label="Start fresh"
          title="Clear conversation"
        >
          <RefreshCw className="h-3.5 w-3.5 text-muted" />
        </button>
      </div>

      {/* Context badges */}
      <div className="flex-shrink-0 flex flex-wrap gap-1.5 px-4 py-2.5 border-b border-border bg-white">
        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent-light text-accent">
          {draftLabel || "Current draft"}
        </span>
        {docCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#F3F4F6] text-[#6B7280]">
            {docCount} case doc{docCount !== 1 ? "s" : ""}
          </span>
        )}
        {otherDraftCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#F3F4F6] text-[#6B7280]">
            {otherDraftCount} other draft{otherDraftCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
        {fetchingHistory && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 text-muted animate-spin" />
          </div>
        )}

        {!fetchingHistory && !draftId && (
          <p className="text-xs text-muted text-center py-8">
            Generate or open a draft to start using the writing assistant.
          </p>
        )}

        {!fetchingHistory && draftId && messages.length === 0 && (
          <p className="text-xs text-muted text-center py-8">
            Ask for improvements, additions, or rewrites — the assistant knows your full draft and case documents.
          </p>
        )}

        {!fetchingHistory && messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}>
            {/* Bubble */}
            <div
              className={`max-w-[90%] px-3 py-2 rounded-lg text-xs leading-relaxed ${
                msg.role === "user"
                  ? "bg-accent text-white rounded-br-sm"
                  : "bg-white border border-border text-charcoal rounded-bl-sm"
              }`}
              style={{ boxShadow: "var(--shadow)" }}
            >
              {msg.content}
            </div>

            {/* Suggested edits */}
            {msg.role === "assistant" && msg.suggestedEdits && msg.suggestedEdits.length > 0 && (
              <div className="w-full space-y-2 mt-1">
                {msg.suggestedEdits.map((edit) => {
                  const state = editStates[edit.id] ?? { applied: false, dismissed: false, expanded: false };
                  if (state.dismissed) return null;
                  const isLong = edit.proposedText.length > 180;
                  const displayText = isLong && !state.expanded
                    ? edit.proposedText.slice(0, 180) + "…"
                    : edit.proposedText;

                  return (
                    <div
                      key={edit.id}
                      className="border border-border rounded-lg bg-white overflow-hidden"
                      style={{ boxShadow: "var(--shadow)" }}
                    >
                      {/* Edit type badge + description */}
                      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-[#F9FAFB]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-[#7C3AED] bg-[#F3E8FF] px-1.5 py-0.5 rounded flex-shrink-0">
                            {edit.type === "add_paragraph" ? "Add" : edit.type === "rewrite_paragraph" ? "Rewrite" : "Citation"}
                          </span>
                          <span className="text-[11px] text-charcoal truncate">{edit.description}</span>
                        </div>
                        {!state.applied && (
                          <button
                            onClick={() => handleDismiss(edit.id)}
                            className="flex-shrink-0 text-muted hover:text-charcoal transition-colors ml-1"
                            aria-label="Dismiss"
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>

                      {/* Proposed text */}
                      <div className="px-3 py-2">
                        <p className="text-[11px] text-charcoal leading-relaxed italic">
                          &ldquo;{displayText}&rdquo;
                        </p>
                        {isLong && (
                          <button
                            onClick={() => toggleExpand(edit.id)}
                            className="text-[10px] text-accent hover:underline mt-1"
                          >
                            {state.expanded ? "Show less" : "Show more"}
                          </button>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-[#F9FAFB]">
                        {state.applied ? (
                          <span className="text-[10px] font-medium text-[var(--color-mint)] flex items-center gap-1">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                            </svg>
                            Applied
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={() => handleApply(edit)}
                              className="text-[11px] font-semibold text-accent hover:text-accent-hover transition-colors"
                            >
                              Apply
                            </button>
                            <span className="text-muted text-[10px]">·</span>
                            <button
                              onClick={() => handleDismiss(edit.id)}
                              className="text-[11px] text-muted hover:text-charcoal transition-colors"
                            >
                              Dismiss
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div className="flex items-start gap-2">
            <div
              className="px-3 py-2 rounded-lg rounded-bl-sm bg-white border border-border"
              style={{ boxShadow: "var(--shadow)" }}
            >
              <div className="flex gap-1 items-center py-0.5">
                <span className="block h-1.5 w-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="block h-1.5 w-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="block h-1.5 w-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="px-3 py-2 bg-[#FEE2E2] border border-[#FECACA] rounded-lg">
            <p className="text-[11px] text-[#DC2626]">{error}</p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Shortcut prompts */}
      {draftId && (
        <div className="flex-shrink-0 px-4 pb-2 pt-1 border-t border-border">
          <p className="text-[9px] font-semibold text-muted uppercase tracking-wider mb-1.5">Quick prompts</p>
          <div className="grid grid-cols-2 gap-1.5">
            {SHORTCUT_PROMPTS.map((s) => {
              const disabled = loading || !draftId || (s.needsSelection && !hasSelection);
              return (
                <button
                  key={s.label}
                  disabled={disabled}
                  onClick={() => sendMessage(s.prompt)}
                  title={s.needsSelection && !hasSelection ? "Select text in the editor first" : s.label}
                  className="text-left px-2.5 py-1.5 text-[10px] font-medium text-charcoal bg-white border border-border rounded-[6px] hover:bg-accent-light/40 hover:border-accent/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed leading-tight"
                  style={{ boxShadow: "var(--shadow)" }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-border bg-white">
        {!draftId ? (
          <p className="text-[11px] text-muted text-center py-1">Open a draft to use the assistant</p>
        ) : (
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
              placeholder="Ask the assistant…"
              rows={2}
              disabled={loading}
              className="flex-1 resize-none text-xs text-charcoal bg-[#F9FAFB] border border-border rounded-[6px] px-3 py-2 placeholder:text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors disabled:opacity-50"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className="flex-shrink-0 p-2 rounded-[6px] bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Send"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
