import React from "react";

interface CardProps {
  children: React.ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
  interactive?: boolean;
  className?: string;
}

const PADDING = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

export function Card({ children, padding = "md", interactive = false, className = "" }: CardProps) {
  return (
    <div
      className={`
        bg-[var(--color-paper)] border border-[var(--color-border)] rounded-[var(--radius-lg)]
        ${PADDING[padding]}
        ${interactive ? "transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-paper-raised)] cursor-pointer" : ""}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
