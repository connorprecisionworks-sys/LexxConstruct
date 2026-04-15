"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";

export interface DropdownItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  dividerBefore?: boolean;
}

interface DropdownMenuProps {
  items: DropdownItem[];
  align?: "right" | "left";
}

export function DropdownMenu({ items, align = "right" }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  function handleTrigger(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const MENU_W = 192;
    const rawLeft = align === "right" ? rect.right - MENU_W : rect.left;
    const left = Math.min(Math.max(8, rawLeft), window.innerWidth - MENU_W - 8);
    setPos({ top: rect.bottom + 4, left });
    setOpen((o) => !o);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointerDown(e: PointerEvent) {
      if (
        !menuRef.current?.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const menu =
    open && mounted
      ? createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              zIndex: 9998,
              width: "192px",
              backgroundColor: "var(--color-paper)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-md)",
              padding: "4px 0",
            }}
          >
            {items.map((item, i) => (
              <div key={i}>
                {item.dividerBefore && (
                  <div
                    style={{
                      height: "1px",
                      backgroundColor: "var(--color-border-subtle)",
                      margin: "4px 0",
                    }}
                  />
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpen(false);
                    item.onClick();
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "6px 12px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "var(--text-sm)",
                    color: item.danger ? "var(--color-danger)" : "var(--color-ink)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = item.danger
                      ? "var(--color-danger-soft)"
                      : "var(--color-paper-raised)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                  }}
                >
                  {item.label}
                </button>
              </div>
            ))}
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleTrigger}
        title="More actions"
        aria-label="More actions"
        className="inline-flex items-center justify-center rounded-[var(--radius-md)] transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--color-teal)] h-9 px-3 text-sm gap-2 bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-paper-raised)] active:bg-[var(--color-paper-sunken)]"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {menu}
    </>
  );
}
