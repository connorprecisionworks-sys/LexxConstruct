import React from "react";

interface StatProps {
  label: string;
  value: string | number;
  meta?: string;
}

export function Stat({ label, value, meta }: StatProps) {
  return (
    <div>
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
    </div>
  );
}
