"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  PenLine,
  Mic,
  FileText,
  Flag,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Tooltip } from "@/components/ui/Tooltip";

// ── Types ────────────────────────────────────────────────────────────────────

interface ActiveNavItem {
  kind: "active";
  label: string;
  href: string;
  Icon: React.ElementType;
}

interface PlaceholderNavItem {
  kind: "placeholder";
  label: string;
  Icon: React.ElementType;
  tooltip: string;
}

type NavItem = ActiveNavItem | PlaceholderNavItem;

// ── Nav items ─────────────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  {
    kind: "active",
    label: "Dashboard",
    href: "/",
    Icon: LayoutDashboard,
  },
  {
    kind: "active",
    label: "Chat",
    href: "/chat",
    Icon: MessageSquare,
  },
  {
    kind: "active",
    label: "Workspace",
    href: "/workspace",
    Icon: PenLine,
  },
  {
    kind: "placeholder",
    label: "Depositions",
    Icon: Mic,
    tooltip:
      "Every deposition across all your matters, with admissions, inconsistencies, and exhibits at a glance.",
  },
  {
    kind: "placeholder",
    label: "Drafts",
    Icon: FileText,
    tooltip:
      "All drafts in progress, sorted by recent edits. Jump back into anything in one click.",
  },
  {
    kind: "placeholder",
    label: "Flags",
    Icon: Flag,
    tooltip:
      "Every open flag across every matter — contradictions, missing info, key evidence, and follow-ups.",
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="fixed top-0 left-0 bottom-0 flex flex-col z-20"
      style={{
        width: "240px",
        backgroundColor: "var(--color-paper)",
        borderRight: "1px solid var(--color-border)",
      }}
    >
      {/* Logo block */}
      <div
        style={{
          paddingTop: "var(--space-6)",
          paddingLeft: "var(--space-6)",
          paddingRight: "var(--space-6)",
          paddingBottom: "var(--space-4)",
        }}
      >
        <Link href="/" className="block">
          <span
            style={{
              display: "block",
              fontFamily: "var(--font-serif)",
              fontSize: "var(--text-xl)",
              fontWeight: 600,
              color: "var(--color-teal)",
              letterSpacing: "-0.01em",
              lineHeight: 1.2,
            }}
          >
            Lexx
          </span>
          <span
            style={{
              display: "block",
              marginTop: "2px",
              fontFamily: "var(--font-sans, Inter, sans-serif)",
              fontSize: "var(--text-xs)",
              color: "var(--color-ink-subtle)",
              letterSpacing: "-0.01em",
            }}
          >
            Construction Litigation Intelligence
          </span>
        </Link>
      </div>

      {/* Divider */}
      <div
        style={{
          height: "1px",
          backgroundColor: "var(--color-border-subtle)",
          marginLeft: "var(--space-6)",
          marginRight: "var(--space-6)",
          marginBottom: "var(--space-4)",
        }}
      />

      {/* Nav */}
      <nav
        className="flex-1 overflow-y-auto"
        style={{
          paddingLeft: "var(--space-3)",
          paddingRight: "var(--space-3)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-1)",
        }}
        aria-label="Main navigation"
      >
        {NAV_ITEMS.map((item) => {
          if (item.kind === "active") {
            const isActive = pathname === item.href;
            return (
              <ActiveItem key={item.href} item={item} isActive={isActive} />
            );
          }
          return <PlaceholderItem key={item.label} item={item} />;
        })}
      </nav>

      {/* Footer */}
      <div
        style={{
          paddingLeft: "var(--space-6)",
          paddingRight: "var(--space-6)",
          paddingBottom: "var(--space-4)",
          paddingTop: "var(--space-4)",
          borderTop: "1px solid var(--color-border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <p style={{ fontSize: "var(--text-xs)", color: "var(--color-ink-faint)" }}>
          Lexx v1.0
        </p>
        <SignOutButton />
      </div>
    </aside>
  );
}

// ── Functional nav item ───────────────────────────────────────────────────────

function ActiveItem({
  item,
  isActive,
}: {
  item: ActiveNavItem;
  isActive: boolean;
}) {
  const { Icon, label, href } = item;

  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-[var(--radius-md)]"
      style={{
        paddingLeft: "var(--space-3)",
        paddingRight: "var(--space-3)",
        paddingTop: "var(--space-2)",
        paddingBottom: "var(--space-2)",
        fontSize: "var(--text-sm)",
        fontWeight: 500,
        color: isActive ? "var(--color-teal)" : "var(--color-ink-muted)",
        backgroundColor: isActive ? "var(--color-teal-soft)" : "transparent",
        borderLeft: isActive
          ? "2px solid var(--color-teal)"
          : "2px solid transparent",
        transition: `background-color var(--duration-fast) ease, color var(--duration-fast) ease`,
        textDecoration: "none",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          const el = e.currentTarget as HTMLElement;
          el.style.backgroundColor = "var(--color-paper-raised)";
          el.style.color = "var(--color-ink)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          const el = e.currentTarget as HTMLElement;
          el.style.backgroundColor = "transparent";
          el.style.color = "var(--color-ink-muted)";
        }
      }}
    >
      <Icon size={16} aria-hidden="true" />
      {label}
    </Link>
  );
}

// ── Sign out button ───────────────────────────────────────────────────────────

function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <button
      onClick={handleSignOut}
      style={{
        fontSize: "var(--text-xs)",
        color: "var(--color-ink-subtle)",
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "2px 0",
        fontFamily: "inherit",
        transition: `color var(--duration-fast) ease`,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-ink-muted)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-ink-subtle)"; }}
    >
      Sign out
    </button>
  );
}

// ── Placeholder nav item ──────────────────────────────────────────────────────

function PlaceholderItem({ item }: { item: PlaceholderNavItem }) {
  const { Icon, label, tooltip } = item;

  return (
    <Tooltip content={tooltip} side="right">
      <div
        role="button"
        aria-disabled="true"
        aria-label={`${label} — coming soon`}
        className="flex items-center gap-2.5 rounded-[var(--radius-md)]"
        style={{
          paddingLeft: "var(--space-3)",
          paddingRight: "var(--space-3)",
          paddingTop: "var(--space-2)",
          paddingBottom: "var(--space-2)",
          fontSize: "var(--text-sm)",
          fontWeight: 500,
          color: "var(--color-ink-subtle)",
          backgroundColor: "transparent",
          borderLeft: "2px solid transparent",
          cursor: "default",
          userSelect: "none",
        }}
      >
        <Icon size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
        <span className="flex-1 truncate">{label}</span>
        <Badge variant="neutral" size="sm">Soon</Badge>
      </div>
    </Tooltip>
  );
}
