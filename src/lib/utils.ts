const _ACTION_LABELS: Record<string, string> = {
  matter_created:          "Matter created",
  matter_deleted:          "Matter deleted",
  document_uploaded:       "Document uploaded",
  document_processed:      "Document processed",
  draft_generated:         "Draft generated",
  draft_deleted:           "Draft deleted",
  draft_finalized:         "Draft finalized",
  note_added:              "Note added",
  flag_added:              "Flag added",
  case_intelligence_built: "Case intelligence built",
  chat_message_sent:       "Chat message sent",
  draft_assist_applied:    "Assistant edit applied",
};

export function formatActivityAction(action: string): string {
  return (
    _ACTION_LABELS[action] ??
    action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  // Older than a week — show a human-readable date
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
