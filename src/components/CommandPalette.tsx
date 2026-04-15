"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, Folder, FileText, PenLine, Flag } from "lucide-react";
import { useCommandPalette } from "@/hooks/useCommandPalette";

const OPEN_EVENT = "lexx:open-palette";

interface SearchResult {
  id: string;
  primary: string;
  secondary: string;
  url: string;
}

interface SearchResults {
  matters: SearchResult[];
  documents: SearchResult[];
  drafts: SearchResult[];
  flags: SearchResult[];
}

type GroupKey = keyof SearchResults;

const GROUPS: {
  key: GroupKey;
  label: string;
  Icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
}[] = [
  { key: "matters", label: "Matters", Icon: Folder },
  { key: "documents", label: "Documents", Icon: FileText },
  { key: "drafts", label: "Drafts", Icon: PenLine },
  { key: "flags", label: "Flags", Icon: Flag },
];

const EMPTY: SearchResults = { matters: [], documents: [], drafts: [], flags: [] };

export function CommandPalette() {
  const router = useRouter();
  // Registers Cmd+K globally
  useCommandPalette();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pre-compute flat index mapping for keyboard navigation
  const resultGroups = useMemo(() => {
    let idx = 0;
    return GROUPS.map(({ key, label, Icon }) => ({
      key,
      label,
      Icon,
      items: results[key].map((result) => ({ result, globalIdx: idx++ })),
    })).filter((g) => g.items.length > 0);
  }, [results]);

  const totalResults = useMemo(
    () => resultGroups.reduce((n, g) => n + g.items.length, 0),
    [resultGroups]
  );

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults(EMPTY);
    setSelectedIndex(0);
  }, []);

  // Listen for open event (fired by openCommandPalette() and useCommandPalette hook)
  useEffect(() => {
    function onOpenEvent() {
      setOpen((prev) => {
        if (prev) return prev; // already open — hook toggles via keydown, not via event
        return true;
      });
      setTimeout(() => inputRef.current?.focus(), 30);
    }
    window.addEventListener(OPEN_EVENT, onOpenEvent);
    return () => window.removeEventListener(OPEN_EVENT, onOpenEvent);
  }, []);

  // ESC to close, arrow key + enter navigation when palette is open
  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, totalResults - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        // Find selected result from resultGroups
        for (const group of resultGroups) {
          const found = group.items.find((item) => item.globalIdx === selectedIndex);
          if (found) {
            router.push(found.result.url);
            close();
            return;
          }
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close, selectedIndex, totalResults, resultGroups, router]);

  // Debounced search — 120ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          const data: SearchResults = await res.json();
          setResults(data);
          setSelectedIndex(0);
        }
      } catch {
        // silently ignore network errors in palette
      } finally {
        setLoading(false);
      }
    }, 120);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center"
      style={{ backgroundColor: "rgba(10, 10, 10, 0.4)", paddingTop: "clamp(72px, 14vh, 140px)" }}
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "600px",
          maxWidth: "calc(100vw - 2rem)",
          backgroundColor: "var(--color-paper)",
          borderRadius: "var(--radius-xl)",
          border: "1px solid var(--color-border)",
          boxShadow: "var(--shadow-lg)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* ── Search input ─────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            padding: "var(--space-4)",
            borderBottom: "1px solid var(--color-border-subtle)",
          }}
        >
          <Search size={16} style={{ color: "var(--color-ink-subtle)", flexShrink: 0 }} aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search matters, documents, drafts, flags..."
            autoComplete="off"
            spellCheck={false}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              fontSize: "var(--text-base)",
              color: "var(--color-ink)",
              backgroundColor: "transparent",
              fontFamily: "var(--font-sans)",
            }}
          />
          {loading && (
            <svg
              className="animate-spin h-4 w-4 flex-shrink-0"
              style={{ color: "var(--color-ink-faint)" }}
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
        </div>

        {/* ── Results ──────────────────────────────────────────────────── */}
        {totalResults > 0 && (
          <div style={{ maxHeight: "360px", overflowY: "auto" }}>
            {resultGroups.map(({ key, label, Icon, items }) => (
              <div key={key}>
                {/* Group label */}
                <div
                  style={{
                    padding: "var(--space-2) var(--space-4)",
                    fontSize: "var(--text-xs)",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--color-ink-subtle)",
                    backgroundColor: "var(--color-paper-sunken)",
                  }}
                >
                  {label}
                </div>

                {/* Group items */}
                {items.map(({ result, globalIdx }) => {
                  const isSelected = globalIdx === selectedIndex;
                  return (
                    <button
                      key={result.id}
                      onClick={() => { router.push(result.url); close(); }}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--space-3)",
                        width: "100%",
                        padding: "var(--space-3) var(--space-4)",
                        border: "none",
                        borderBottom: "1px solid var(--color-border-subtle)",
                        cursor: "pointer",
                        textAlign: "left",
                        backgroundColor: isSelected ? "var(--color-teal-soft)" : "transparent",
                        transition: "background-color var(--duration-fast) ease",
                      }}
                    >
                      <Icon
                        size={15}
                        style={{
                          color: isSelected ? "var(--color-teal)" : "var(--color-ink-muted)",
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          className="truncate"
                          style={{
                            fontSize: "var(--text-sm)",
                            color: "var(--color-ink)",
                            fontWeight: isSelected ? 500 : 400,
                          }}
                        >
                          {result.primary}
                        </p>
                        <p
                          className="truncate"
                          style={{ fontSize: "var(--text-xs)", color: "var(--color-ink-muted)" }}
                        >
                          {result.secondary}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* ── No results ───────────────────────────────────────────────── */}
        {query.trim() && !loading && totalResults === 0 && (
          <div
            style={{
              padding: "var(--space-10) var(--space-4)",
              textAlign: "center",
              color: "var(--color-ink-muted)",
              fontSize: "var(--text-sm)",
            }}
          >
            No results for &ldquo;{query}&rdquo;
          </div>
        )}

        {/* ── Empty prompt ─────────────────────────────────────────────── */}
        {!query.trim() && (
          <div
            style={{
              padding: "var(--space-10) var(--space-4)",
              textAlign: "center",
              color: "var(--color-ink-subtle)",
              fontSize: "var(--text-sm)",
            }}
          >
            Start typing to search across matters, documents, drafts, and flags
          </div>
        )}

        {/* ── Footer hints ─────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            gap: "var(--space-5)",
            padding: "var(--space-2) var(--space-4)",
            borderTop: "1px solid var(--color-border-subtle)",
            backgroundColor: "var(--color-paper-sunken)",
          }}
        >
          {["↑↓ to navigate", "↵ to select", "ESC to close"].map((hint) => (
            <span key={hint} style={{ fontSize: "var(--text-xs)", color: "var(--color-ink-faint)" }}>
              {hint}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
