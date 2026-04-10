"use client";

import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, id, className = "", ...props }: InputProps) {
  const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-[var(--text-sm)] font-medium text-[var(--color-ink-muted)]"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`
          h-9 w-full px-3 rounded-[var(--radius-md)] border border-[var(--color-border-strong)]
          bg-[var(--color-paper)] text-[var(--text-base)] text-[var(--color-ink)]
          placeholder:text-[var(--color-ink-faint)]
          focus:outline-none focus:border-[var(--color-teal)]
          transition-colors duration-[var(--duration-fast)]
          ${error ? "border-[var(--color-danger)]" : ""}
          ${className}
        `}
        {...props}
      />
      {error && (
        <p className="text-xs text-[var(--color-danger)]">{error}</p>
      )}
    </div>
  );
}
