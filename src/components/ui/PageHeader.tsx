import React from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div
      className="flex items-end justify-between pb-6 mb-8"
      style={{
        paddingTop: "var(--space-8)",
        borderBottom: "1px solid var(--color-border-subtle)",
      }}
    >
      <div>
        <h1
          className="font-semibold"
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "var(--text-2xl)",
            color: "var(--color-ink)",
            lineHeight: 1.2,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1" style={{ fontSize: "var(--text-sm)", color: "var(--color-ink-muted)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
