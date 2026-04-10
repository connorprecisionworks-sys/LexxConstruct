"use client";

import { ProcessingStepper } from "@/components/ProcessingStepper";
import type { UploadQueueItem } from "@/types";
import type { UploadQueueStats } from "@/hooks/useUploadQueue";

const IN_FLIGHT = new Set<UploadQueueItem["status"]>(["uploading", "extracting", "analyzing"]);

const STEPPER_STAGES = ["Uploading", "Extracting", "Analyzing"];
const STAGE_INDEX: Record<string, number> = {
  uploading: 0,
  extracting: 1,
  analyzing: 2,
  done: 3, // = stages.length → all complete
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

interface Props {
  queue: UploadQueueItem[];
  sessionStats: UploadQueueStats;
  onCancel: (id: string) => void;
  onDismiss: (id: string) => void;
}

export function UploadQueuePanel({ queue, sessionStats, onCancel, onDismiss }: Props) {
  if (queue.length === 0) return null;

  const activeItem = queue.find((i) => IN_FLIGHT.has(i.status));
  const showCounter = sessionStats.total > 1 && activeItem;

  return (
    <div
      className="mb-6 bg-surface border border-border rounded-lg overflow-hidden animate-fade-slide-in"
      style={{ boxShadow: "var(--shadow)" }}
    >
      <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-row-alt">
        <h3 className="text-sm font-semibold text-primary">Upload Queue</h3>
        {showCounter && (
          <span className="text-xs text-muted">
            Processing {sessionStats.started} of {sessionStats.total}
          </span>
        )}
      </div>
      <div className="divide-y divide-border">
        {queue.map((item) => (
          <QueueRow
            key={item.id}
            item={item}
            onCancel={onCancel}
            onDismiss={onDismiss}
          />
        ))}
      </div>
    </div>
  );
}

function QueueRow({
  item,
  onCancel,
  onDismiss,
}: {
  item: UploadQueueItem;
  onCancel: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const isInFlight = IN_FLIGHT.has(item.status);
  const stageIdx = STAGE_INDEX[item.status] ?? 0;
  const isDone = item.status === "done";
  const isError = item.status === "error";
  const isQueued = item.status === "queued";

  return (
    <div className={`px-4 py-3 transition-opacity ${isDone ? "toast-fade" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        {/* File info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-primary truncate">{item.fileName}</p>
          <p className="text-xs text-muted">{formatSize(item.fileSize)}</p>
        </div>

        {/* Status actions */}
        <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
          {isQueued && (
            <>
              <span className="text-xs text-muted">Queued</span>
              <button
                onClick={() => onCancel(item.id)}
                className="text-muted hover:text-[#DC2626] transition-colors"
                title="Cancel upload"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </>
          )}
          {isDone && (
            <svg
              className="w-4 h-4 text-[#059669]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
          {isError && (
            <button
              onClick={() => onDismiss(item.id)}
              className="text-xs font-medium text-[#DC2626] hover:underline"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>

      {/* In-flight stepper */}
      {isInFlight && (
        <div className="mt-2">
          <ProcessingStepper stages={STEPPER_STAGES} currentStage={stageIdx} />
        </div>
      )}

      {/* Error message */}
      {isError && item.error && (
        <p className="mt-1 text-xs text-[#DC2626]">{item.error}</p>
      )}
    </div>
  );
}
