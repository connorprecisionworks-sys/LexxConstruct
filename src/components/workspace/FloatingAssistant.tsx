"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Minus, X, RefreshCw, Send, Loader2 } from "lucide-react";
import type { SuggestedEdit } from "@/types";

const PANEL_WIDTH = 320;
const PANEL_HEIGHT = 440;
const MINI_HEIGHT = 44;

interface EditCardState { applied: boolean; dismissed: boolean; expanded: boolean; }

interface Props {
  draftId: string | null;
  draftTitle: string;
  matterId: string;
  panelState: "open" | "minimized" | "closed";
  onStateChange: (state: "open" | "minimized" | "closed") => void;
  currentParagraph: string;
  hasSelection: boolean;
  selectionText: string;
  onApply: (edit: SuggestedEdit) => void;
}

export default function FloatingAssistant({
  draftId,
  draftTitle,
  matterId,
  panelState,
  onStateChange,
  currentParagraph,
  hasSelection,
  selectionText,
  onApply,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestedEdit[]>([]);
  const [chatResponse, setChatResponse] = useState<string | null>(null);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [editCardStates, setEditCardStates] = useState<Record<string, EditCardState>>({});

  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startMouseX: number; startMouseY: number; startPanelX: number; startPanelY: number } | null>(null);
  const autoRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevParagraphRef = useRef<string>("");
  const prevHasSelectionRef = useRef<boolean>(false);

  // Mount guard for portal
  useEffect(() => { setMounted(true); }, []);

  // Initialize position on first open
  useEffect(() => {
    if (panelState !== "closed" && pos === null && typeof window !== "undefined") {
      setPos({ x: Math.max(0, window.innerWidth - PANEL_WIDTH - 24), y: 80 });
    }
  }, [panelState, pos]);

  // Auto-refresh debounce: fire when cursor settles in a paragraph for 3s
  useEffect(() => {
    if (panelState === "closed" || !draftId) return;

    const paragraphChanged = currentParagraph !== prevParagraphRef.current;

    prevParagraphRef.current = currentParagraph;
    prevHasSelectionRef.current = hasSelection;

    // Clear existing timer on any cursor change
    if (autoRefreshTimerRef.current) {
      clearTimeout(autoRefreshTimerRef.current);
      autoRefreshTimerRef.current = null;
    }

    // Selection mode: no auto-refresh
    if (hasSelection) return;

    // Non-empty paragraph that changed: start 3s timer
    if (paragraphChanged && currentParagraph.trim().length > 0) {
      autoRefreshTimerRef.current = setTimeout(() => {
        triggerSuggestRefresh();
      }, 3000);
    }

    return () => {
      if (autoRefreshTimerRef.current) clearTimeout(autoRefreshTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentParagraph, hasSelection, panelState, draftId]);

  // Clear timer when panel closes
  useEffect(() => {
    if (panelState === "closed") {
      if (autoRefreshTimerRef.current) clearTimeout(autoRefreshTimerRef.current);
    }
  }, [panelState]);

  const triggerSuggestRefresh = useCallback(async () => {
    if (!draftId) return;
    const context = hasSelection ? selectionText : currentParagraph;
    if (!context.trim()) return;
    setLoadingSuggest(true);
    setError(null);
    try {
      const res = await fetch(`/api/drafts/${draftId}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: hasSelection ? "Suggest improvements for my selected text." : "Suggest improvements for the current paragraph.",
          ...(hasSelection ? { selectionContext: context } : { paragraphContext: context }),
          mode: "suggest",
        }),
      });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();
      const edits: SuggestedEdit[] = data.assistantMessage?.suggestedEdits ?? [];
      setSuggestions(edits);
      setChatResponse(null);
      setEditCardStates({});
    } catch {
      setError("Couldn't load suggestions. Try the manual refresh.");
    } finally {
      setLoadingSuggest(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, hasSelection, selectionText, currentParagraph]);

  async function sendChatMessage() {
    if (!draftId || !chatInput.trim() || loadingChat) return;
    const text = chatInput.trim();
    setChatInput("");
    setLoadingChat(true);
    setError(null);
    try {
      const res = await fetch(`/api/drafts/${draftId}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          mode: "chat",
          ...(hasSelection ? { selectionContext: selectionText } : { paragraphContext: currentParagraph }),
        }),
      });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();
      const msg = data.assistantMessage;
      setChatResponse(msg.content || null);
      if (msg.suggestedEdits?.length) {
        setSuggestions((prev) => {
          const newEdits = (msg.suggestedEdits as SuggestedEdit[]).filter(
            (e) => !prev.some((p) => p.id === e.id)
          );
          return [...newEdits, ...prev];
        });
      }
    } catch {
      setError("Couldn't reach the assistant. Please try again.");
    } finally {
      setLoadingChat(false);
    }
  }

  function handleApplyEdit(edit: SuggestedEdit) {
    onApply(edit);
    setEditCardStates((prev) => ({ ...prev, [edit.id]: { ...prev[edit.id], applied: true, dismissed: false } }));
    fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "draft_assist_applied", matterId, entityName: draftTitle }),
    }).catch(() => {});
  }

  function handleDismissEdit(id: string) {
    setEditCardStates((prev) => ({ ...prev, [id]: { ...prev[id], dismissed: true } }));
  }

  function toggleExpand(id: string) {
    setEditCardStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], expanded: !prev[id]?.expanded },
    }));
  }

  // ── Drag handling (pointer capture on header) ──────────────────────────────
  function onHeaderPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || !pos) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startMouseX: e.clientX, startMouseY: e.clientY, startPanelX: pos.x, startPanelY: pos.y };
  }

  function onHeaderPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current || !panelRef.current) return;
    const dx = e.clientX - dragRef.current.startMouseX;
    const dy = e.clientY - dragRef.current.startMouseY;
    const newX = Math.max(0, Math.min(dragRef.current.startPanelX + dx, window.innerWidth - PANEL_WIDTH));
    const newY = Math.max(0, Math.min(dragRef.current.startPanelY + dy, window.innerHeight - (panelState === "minimized" ? MINI_HEIGHT : PANEL_HEIGHT)));
    // Update DOM directly for smooth drag
    panelRef.current.style.left = `${newX}px`;
    panelRef.current.style.top = `${newY}px`;
  }

  function onHeaderPointerUp() {
    if (!dragRef.current || !panelRef.current) { dragRef.current = null; return; }
    // Commit position to state
    const left = parseFloat(panelRef.current.style.left) || 0;
    const top = parseFloat(panelRef.current.style.top) || 0;
    setPos({ x: left, y: top });
    dragRef.current = null;
  }

  if (!mounted || panelState === "closed") return null;

  const isLoading = loadingSuggest || loadingChat;
  const contextLabel = hasSelection ? "Suggestions for the selection" : "Suggestions for the current paragraph";
  const visibleSuggestions = suggestions.filter((s) => !(editCardStates[s.id]?.dismissed));

  return createPortal(
    <div
      ref={panelRef}
      className="hidden lg:flex flex-col z-[9999] rounded-xl overflow-hidden"
      style={{
        position: "fixed",
        left: pos?.x ?? (typeof window !== "undefined" ? window.innerWidth - PANEL_WIDTH - 24 : 0),
        top: pos?.y ?? 80,
        width: PANEL_WIDTH,
        height: panelState === "minimized" ? MINI_HEIGHT : undefined,
        maxHeight: panelState === "open" ? PANEL_HEIGHT : undefined,
        boxShadow: "0 8px 30px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08)",
        border: "1px solid #E5E7EB",
        background: "white",
      }}
    >
      {/* Header — drag handle */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-3.5 bg-white border-b border-[#E5E7EB] select-none"
        style={{
          height: MINI_HEIGHT,
          cursor: dragRef.current ? "grabbing" : "grab",
          borderRadius: panelState === "minimized" ? "0.75rem" : undefined,
        }}
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
      >
        <span
          className="text-sm font-semibold text-[#1C1917]"
          style={{ fontFamily: "var(--font-serif, Georgia, serif)", pointerEvents: "none" }}
        >
          Writing Assistant
        </span>
        {panelState === "open" && (
          <div className="flex items-center gap-1" style={{ pointerEvents: "auto" }}>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onStateChange("minimized")}
              className="p-1 rounded hover:bg-[#F3F4F6] transition-colors"
              aria-label="Minimize"
            >
              <Minus className="h-3.5 w-3.5 text-[#6B7280]" />
            </button>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onStateChange("closed")}
              className="p-1 rounded hover:bg-[#F3F4F6] transition-colors"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5 text-[#6B7280]" />
            </button>
          </div>
        )}
        {panelState === "minimized" && (
          <div className="flex items-center gap-1" style={{ pointerEvents: "auto" }}>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onStateChange("open")}
              className="p-1 rounded hover:bg-[#F3F4F6] transition-colors text-xs text-[#6B7280]"
              aria-label="Expand"
            >
              ↑
            </button>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onStateChange("closed")}
              className="p-1 rounded hover:bg-[#F3F4F6] transition-colors"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5 text-[#6B7280]" />
            </button>
          </div>
        )}
      </div>

      {/* Body — only in open state */}
      {panelState === "open" && (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Loading bar */}
          {loadingSuggest && (
            <div className="flex-shrink-0 h-0.5 bg-[#E5E7EB] overflow-hidden">
              <div
                className="h-full bg-[var(--color-accent,#0D9488)] origin-left"
                style={{ animation: "loading-bar 1.5s ease-in-out infinite", width: "40%" }}
              />
            </div>
          )}

          {/* Context line */}
          <div className="flex-shrink-0 px-4 pt-3 pb-1 flex items-center justify-between">
            <p className="text-[11px] text-[#6B7280] font-medium">{contextLabel}</p>
            <button
              onClick={() => triggerSuggestRefresh()}
              disabled={isLoading || !draftId}
              className="flex items-center gap-1 text-[10px] text-[#6B7280] hover:text-[#0D9488] transition-colors disabled:opacity-40"
              title="Refresh suggestions"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </button>
          </div>

          {/* Suggestions area */}
          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2.5 min-h-0">
            {/* Chat prose response */}
            {chatResponse && (
              <div className="px-3 py-2.5 bg-[#F0FDF9] border border-[#CCFBF1] rounded-lg">
                <p className="text-xs text-[#134E4A] leading-relaxed">{chatResponse}</p>
              </div>
            )}

            {/* No suggestions empty state */}
            {!isLoading && visibleSuggestions.length === 0 && !chatResponse && (
              <p className="text-[11px] text-[#9CA3AF] text-center py-6 leading-relaxed">
                No suggestions for this paragraph.<br />Try the refresh button or ask something specific below.
              </p>
            )}

            {/* Loading indicator (chat mode) */}
            {loadingChat && (
              <div className="flex gap-1 items-center py-2 px-2">
                <span className="block h-1.5 w-1.5 rounded-full bg-[#9CA3AF] animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="block h-1.5 w-1.5 rounded-full bg-[#9CA3AF] animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="block h-1.5 w-1.5 rounded-full bg-[#9CA3AF] animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            )}

            {/* Suggestion cards */}
            {visibleSuggestions.map((edit) => {
              const state = editCardStates[edit.id] ?? { applied: false, dismissed: false, expanded: false };
              const isLong = edit.proposedText.length > 160;
              const displayText = isLong && !state.expanded
                ? edit.proposedText.slice(0, 160) + "…"
                : edit.proposedText;
              const typeLabel =
                edit.type === "add_paragraph" ? "Strengthen" :
                edit.type === "rewrite_paragraph" ? "Restructure" :
                "Add Citation";

              return (
                <div
                  key={edit.id}
                  className="border border-[#E5E7EB] rounded-lg overflow-hidden bg-white"
                  style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}
                >
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F9FAFB] border-b border-[#E5E7EB]">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-[#7C3AED] bg-[#F3E8FF] px-1.5 py-0.5 rounded flex-shrink-0">
                      {typeLabel}
                    </span>
                    <span className="text-[11px] text-[#374151] truncate flex-1">{edit.description}</span>
                  </div>
                  <div className="px-3 py-2">
                    <p className="text-[11px] text-[#374151] leading-relaxed font-mono bg-[#F9FAFB] px-2 py-1.5 rounded italic">
                      {displayText}
                    </p>
                    {isLong && (
                      <button
                        onClick={() => toggleExpand(edit.id)}
                        className="text-[10px] text-[#0D9488] hover:underline mt-1"
                      >
                        {state.expanded ? "Show less" : "Show more"}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 border-t border-[#E5E7EB] bg-[#F9FAFB]">
                    {state.applied ? (
                      <span className="text-[10px] font-medium text-[#059669] flex items-center gap-1">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                        Applied
                      </span>
                    ) : (
                      <>
                        <button
                          onClick={() => handleApplyEdit(edit)}
                          className="text-[11px] font-semibold text-[#0D9488] hover:text-[#0F766E] transition-colors"
                        >
                          Apply
                        </button>
                        <span className="text-[#9CA3AF] text-[10px]">·</span>
                        <button
                          onClick={() => handleDismissEdit(edit.id)}
                          className="text-[11px] text-[#6B7280] hover:text-[#374151] transition-colors"
                        >
                          Dismiss
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {error && (
              <div className="px-3 py-2 bg-[#FEE2E2] border border-[#FECACA] rounded-lg">
                <p className="text-[11px] text-[#DC2626]">{error}</p>
              </div>
            )}
          </div>

          {/* Custom input */}
          <div className="flex-shrink-0 px-3 py-3 border-t border-[#E5E7EB]">
            <div className="flex gap-2 items-end">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
                }}
                placeholder="Or ask for something specific…"
                rows={2}
                disabled={!draftId || loadingChat}
                className="flex-1 resize-none text-[11px] text-[#374151] bg-[#F9FAFB] border border-[#E5E7EB] rounded-[6px] px-2.5 py-1.5 placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]/20 transition-colors disabled:opacity-50"
              />
              <button
                onClick={sendChatMessage}
                disabled={!chatInput.trim() || !draftId || loadingChat}
                className="flex-shrink-0 p-2 rounded-[6px] bg-[#0D9488] text-white hover:bg-[#0F766E] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Send"
              >
                {loadingChat ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
