"use client";

import { useState, useEffect, useRef } from "react";
import type { UploadQueueItem } from "@/types";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const VALID_EXTENSIONS = new Set(["pdf", "docx", "txt"]);

// How long (ms) between simulated stage advances while the server is processing
const STAGE_ADVANCE_MS = 5000;

export interface UploadQueueStats {
  total: number;
  started: number;
}

export function useUploadQueue() {
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [sessionStats, setSessionStats] = useState<UploadQueueStats>({ total: 0, started: 0 });
  const [processingTick, setProcessingTick] = useState(0);

  // Guards against starting a second item while one is in flight
  const processingRef = useRef(false);
  // Cleanup for the stage-simulation interval
  const stageTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Public API ───────────────────────────────────────────────────────────

  function enqueue(files: File[], matterId: string) {
    const items: UploadQueueItem[] = files.map((file) => {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const oversized = file.size > MAX_FILE_SIZE;
      const badType = !VALID_EXTENSIONS.has(ext);
      const invalid = oversized || badType;
      return {
        id: crypto.randomUUID(),
        file,
        fileName: file.name,
        fileSize: file.size,
        matterId,
        status: invalid ? ("error" as const) : ("queued" as const),
        error: oversized
          ? `File too large (max 50 MB)`
          : badType
          ? `Unsupported type — use PDF, DOCX, or TXT`
          : undefined,
        queuedAt: new Date().toISOString(),
      };
    });

    const validCount = items.filter((i) => i.status === "queued").length;
    setSessionStats((prev) => ({ ...prev, total: prev.total + validCount }));
    setQueue((prev) => [...prev, ...items]);
  }

  function cancel(itemId: string) {
    setQueue((prev) =>
      prev.filter((i) => !(i.id === itemId && i.status === "queued"))
    );
  }

  function dismiss(itemId: string) {
    setQueue((prev) => prev.filter((i) => i.id !== itemId));
  }

  function clearCompleted() {
    setQueue((prev) =>
      prev.filter(
        (i) => i.status !== "done" && i.status !== "canceled" && i.status !== "error"
      )
    );
  }

  // ── Processing loop ──────────────────────────────────────────────────────

  useEffect(() => {
    // Guard: only one item in-flight at a time
    if (processingRef.current) return;

    const nextQueued = queue.find((i) => i.status === "queued");
    if (!nextQueued) return;

    processingRef.current = true;
    setSessionStats((prev) => ({ ...prev, started: prev.started + 1 }));

    // Transition: queued → uploading
    setQueue((prev) =>
      prev.map((i) =>
        i.id === nextQueued.id
          ? { ...i, status: "uploading" as const, startedAt: new Date().toISOString() }
          : i
      )
    );

    // Simulate stage progression while server processes
    const stageSequence: Array<UploadQueueItem["status"]> = ["extracting", "analyzing"];
    let stageIdx = 0;
    stageTimerRef.current = setInterval(() => {
      if (stageIdx < stageSequence.length) {
        const next = stageSequence[stageIdx];
        setQueue((prev) =>
          prev.map((i) => (i.id === nextQueued.id ? { ...i, status: next } : i))
        );
        stageIdx++;
      }
    }, STAGE_ADVANCE_MS);

    const formData = new FormData();
    formData.append("document", nextQueued.file);
    formData.append("matterId", nextQueued.matterId);

    fetch("/api/documents/process", { method: "POST", body: formData })
      .then(async (res) => {
        if (stageTimerRef.current) {
          clearInterval(stageTimerRef.current);
          stageTimerRef.current = null;
        }

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const msg = (data as { error?: string }).error ?? "Upload failed";
          setQueue((prev) =>
            prev.map((i) =>
              i.id === nextQueued.id ? { ...i, status: "error" as const, error: msg } : i
            )
          );
        } else {
          const { document } = (await res.json()) as { document?: { id: string } };
          setQueue((prev) =>
            prev.map((i) =>
              i.id === nextQueued.id
                ? {
                    ...i,
                    status: "done" as const,
                    documentId: document?.id,
                    completedAt: new Date().toISOString(),
                  }
                : i
            )
          );
          // Auto-remove "done" items after 3 s so the panel fades out
          setTimeout(() => {
            setQueue((prev) => prev.filter((i) => i.id !== nextQueued.id));
          }, 3000);
        }
      })
      .catch((err) => {
        if (stageTimerRef.current) {
          clearInterval(stageTimerRef.current);
          stageTimerRef.current = null;
        }
        const msg = err instanceof Error ? err.message : "Upload failed";
        setQueue((prev) =>
          prev.map((i) =>
            i.id === nextQueued.id ? { ...i, status: "error" as const, error: msg } : i
          )
        );
      })
      .finally(() => {
        processingRef.current = false;
        // Bump tick so the effect re-evaluates even if queue reference hasn't changed
        setProcessingTick((t) => t + 1);
      });

    return () => {
      if (stageTimerRef.current) {
        clearInterval(stageTimerRef.current);
        stageTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, processingTick]);

  return { queue, enqueue, cancel, dismiss, clearCompleted, sessionStats };
}
