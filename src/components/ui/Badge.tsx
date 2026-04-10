import React from "react";

type Variant = "neutral" | "teal" | "mint" | "danger" | "warn";
type Size = "sm" | "base";

interface BadgeProps {
  variant?: Variant;
  size?: Size;
  children: React.ReactNode;
  className?: string;
}

const VARIANTS: Record<Variant, string> = {
  neutral: "bg-[var(--color-paper-sunken)] text-[var(--color-ink-muted)]",
  teal:    "bg-[var(--color-teal-soft)] text-[var(--color-teal)]",
  mint:    "bg-[var(--color-mint-soft)] text-[var(--color-mint)]",
  danger:  "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
  warn:    "bg-[var(--color-warn-soft)] text-[var(--color-warn)]",
};

const SIZES: Record<Size, string> = {
  sm:   "text-[10px] px-1.5 py-0.5 font-semibold",
  base: "text-xs px-2 py-1 font-medium",
};

export function Badge({ variant = "neutral", size = "sm", children, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {children}
    </span>
  );
}
