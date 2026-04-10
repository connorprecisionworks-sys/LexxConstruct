"use client";

import React from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "base" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: React.ReactNode;
}

const BASE =
  "inline-flex items-center justify-center font-medium rounded-[var(--radius-md)] transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--color-teal)] focus-visible:outline-offset-2 disabled:opacity-50 disabled:pointer-events-none select-none";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-[var(--color-teal)] text-white hover:bg-[var(--color-teal-hover)] active:bg-[var(--color-teal-hover)]",
  secondary:
    "bg-[var(--color-paper)] text-[var(--color-ink)] border border-[var(--color-border-strong)] hover:bg-[var(--color-paper-raised)] active:bg-[var(--color-paper-sunken)]",
  ghost:
    "bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-paper-raised)] active:bg-[var(--color-paper-sunken)]",
  danger:
    "bg-[var(--color-danger)] text-white hover:bg-[#B91C1C] active:bg-[#991B1B]",
};

const SIZES: Record<Size, string> = {
  sm: "h-7 px-3 text-xs gap-1.5",
  base: "h-9 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-[var(--text-md)] gap-2",
};

export function Button({
  variant = "secondary",
  size = "base",
  loading = false,
  disabled,
  children,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {loading && (
        <svg
          className="animate-spin h-3.5 w-3.5 flex-shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}
