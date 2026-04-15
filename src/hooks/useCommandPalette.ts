"use client";

import { useEffect } from "react";

const OPEN_EVENT = "lexx:open-palette";

/** Programmatically open the command palette from anywhere. */
export function openCommandPalette() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OPEN_EVENT));
  }
}

/**
 * Registers the Cmd+K / Ctrl+K global keyboard shortcut.
 * Call this hook once at the app root (inside CommandPalette).
 * Returns { open } for imperative use.
 */
export function useCommandPalette() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k" && !e.shiftKey) {
        e.preventDefault();
        openCommandPalette();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return { open: openCommandPalette };
}
