"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";

interface TooltipProps {
  content: string;
  children: React.ReactElement;
  /** Side to show the tooltip. Default: "right" */
  side?: "right" | "top" | "bottom";
}

/**
 * Simple accessible tooltip.
 * - 300ms open delay (CSS transition-delay on opacity)
 * - 150ms fade-in, 0ms fade-out
 * - Positioned to the right of the wrapped element by default (sidebar use-case)
 * - Pure CSS transitions — no JS timers, no dependencies
 */
export function Tooltip({ content, children, side = "right" }: TooltipProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Only render the popup after client mount to avoid SSR/hydration mismatch.
  // The child always renders; only the floating popup is gated.
  useEffect(() => { setMounted(true); }, []);

  const show = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setVisible(true);
  }, []);

  const hide = useCallback(() => {
    // Hide immediately on leave
    setVisible(false);
  }, []);

  // Position styles
  const positionStyle: React.CSSProperties =
    side === "right"
      ? { left: "calc(100% + 10px)", top: "50%", transform: "translateY(-50%)" }
      : side === "top"
      ? { bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" }
      : { top: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" };

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {mounted && <div
        role="tooltip"
        aria-hidden={!visible}
        style={{
          position: "absolute",
          zIndex: 50,
          pointerEvents: "none",
          ...positionStyle,
          // Geometry
          maxWidth: "220px",
          width: "max-content",
          padding: "var(--space-3)",
          // Appearance
          backgroundColor: "var(--color-paper)",
          border: "1px solid var(--color-border-strong)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-md)",
          // Typography
          fontFamily: "var(--font-sans, Inter, sans-serif)",
          fontSize: "var(--text-xs)",
          color: "var(--color-ink-muted)",
          lineHeight: 1.5,
          // Fade + slide
          // Show: 300ms delay then 150ms fade in
          // Hide: 100ms fade out, visibility hidden after fade completes
          opacity: visible ? 1 : 0,
          transform: `${positionStyle.transform ?? ""} translateY(${visible ? "0px" : "3px"})`,
          visibility: visible ? "visible" : "hidden",
          transition: visible
            ? "opacity 150ms ease 300ms, transform 150ms ease 300ms, visibility 0ms 300ms"
            : "opacity 100ms ease 0ms, transform 100ms ease 0ms, visibility 0ms 100ms",
        }}
      >
        {content}
      </div>}
    </div>
  );
}
