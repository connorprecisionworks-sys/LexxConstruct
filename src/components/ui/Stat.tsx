import React from "react";
import Link from "next/link";

interface StatProps {
  label: string;
  value: string | number;
  meta?: string;
  onClick?: () => void;
  href?: string;
}

const CARD_BASE: React.CSSProperties = {
  display: "block",
  padding: "var(--space-5)",
  backgroundColor: "var(--color-paper)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-lg)",
  position: "relative",
  transition: "background-color var(--duration-fast) ease, transform var(--duration-fast) ease, box-shadow var(--duration-fast) ease",
  cursor: "pointer",
  textDecoration: "none",
  textAlign: "left",
  width: "100%",
};

function StatContent({ label, value, meta }: Omit<StatProps, "onClick" | "href">) {
  return (
    <>
      <p
        className="text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: "var(--color-ink-subtle)", letterSpacing: "0.08em" }}
      >
        {label}
      </p>
      <p
        className="mt-1.5 text-[var(--text-2xl)] font-semibold"
        style={{ fontFamily: "var(--font-serif)", color: "var(--color-ink)", lineHeight: 1.1 }}
      >
        {value}
      </p>
      {meta && (
        <p className="mt-1 text-[10px]" style={{ color: "var(--color-ink-subtle)" }}>
          {meta}
        </p>
      )}
    </>
  );
}

/** Small arrow shown in the top-right corner of interactive stat cards. */
function ArrowIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        position: "absolute",
        top: "var(--space-4)",
        right: "var(--space-4)",
        width: "14px",
        height: "14px",
        color: "var(--color-ink-faint)",
        transition: "color var(--duration-fast) ease",
      }}
      aria-hidden
    >
      <path d="M7 17L17 7M17 7H7M17 7v10" />
    </svg>
  );
}

function addHoverBehavior(el: HTMLElement, entering: boolean) {
  el.style.backgroundColor = entering ? "var(--color-paper-raised)" : "var(--color-paper)";
  el.style.transform = entering ? "translateY(-2px)" : "translateY(0)";
  el.style.boxShadow = entering ? "var(--shadow-md)" : "none";
}

export function Stat({ label, value, meta, onClick, href }: StatProps) {
  const isInteractive = !!(onClick || href);

  if (!isInteractive) {
    return (
      <div>
        <StatContent label={label} value={value} meta={meta} />
      </div>
    );
  }

  if (href) {
    return (
      <Link
        href={href}
        style={CARD_BASE}
        onMouseEnter={(e) => addHoverBehavior(e.currentTarget as HTMLElement, true)}
        onMouseLeave={(e) => addHoverBehavior(e.currentTarget as HTMLElement, false)}
      >
        <ArrowIcon />
        <StatContent label={label} value={value} meta={meta} />
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      style={CARD_BASE}
      onMouseEnter={(e) => addHoverBehavior(e.currentTarget as HTMLElement, true)}
      onMouseLeave={(e) => addHoverBehavior(e.currentTarget as HTMLElement, false)}
    >
      <ArrowIcon />
      <StatContent label={label} value={value} meta={meta} />
    </button>
  );
}
