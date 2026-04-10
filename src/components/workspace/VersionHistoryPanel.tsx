"use client";

import { useState, useEffect } from "react";
import { timeAgo } from "@/lib/utils";

interface DraftVersion {
  id: string;
  draftId: string;
  content: string;
  label?: string;
  createdAt: string;
}

interface Props {
  draftId: string;
  isOpen: boolean;
  onClose: () => void;
  onRestore: (version: DraftVersion) => void;
}

export default function VersionHistoryPanel({ draftId, isOpen, onClose, onRestore }: Props) {
  const [versions, setVersions] = useState<DraftVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !draftId) return;
    setLoading(true);
    fetch(`/api/drafts/${draftId}/versions`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setVersions(data);
      })
      .finally(() => setLoading(false));
  }, [isOpen, draftId]);

  if (!isOpen) return null;

  const previewing = previewId ? versions.find((v) => v.id === previewId) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end p-4 bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md h-[calc(100vh-2rem)] flex flex-col animate-fade-slide-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
          <h2 className="text-sm font-semibold text-primary">Version History</h2>
          <button onClick={onClose} className="text-muted hover:text-primary text-lg leading-none">×</button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-10">
            <Spinner />
            <span className="ml-2 text-sm text-muted">Loading versions...</span>
          </div>
        )}

        {!loading && versions.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted">No saved versions yet. Versions are created each time you save.</p>
          </div>
        )}

        {!loading && versions.length > 0 && !previewing && (
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {versions.map((v, i) => (
              <div key={v.id} className="border border-border rounded-[6px] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-primary">
                      {v.label ? (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#D97706] mr-2">
                          {v.label}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted mr-1">v{versions.length - i}</span>
                      )}
                      {timeAgo(v.createdAt)}
                    </p>
                    <p className="text-[11px] text-muted mt-1 line-clamp-2">
                      {v.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 100)}...
                    </p>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => setPreviewId(v.id)}
                      className="text-[11px] text-muted hover:text-accent transition-colors px-2 py-1 border border-border rounded"
                    >
                      Preview
                    </button>
                    <button
                      onClick={() => setConfirmRestoreId(v.id)}
                      className="text-[11px] text-white bg-accent hover:bg-accent-hover transition-colors px-2 py-1 rounded"
                    >
                      Restore
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {previewing && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-shrink-0">
              <button onClick={() => setPreviewId(null)} className="text-xs text-muted hover:text-primary">← Back</button>
              <span className="text-xs text-muted">Preview — {timeAgo(previewing.createdAt)}</span>
            </div>
            <div
              className="flex-1 overflow-y-auto p-4 prose-preview text-sm text-charcoal leading-relaxed"
              dangerouslySetInnerHTML={{ __html: previewing.content }}
            />
            <div className="px-4 py-3 border-t border-border flex-shrink-0">
              <button
                onClick={() => {
                  setConfirmRestoreId(previewing.id);
                  setPreviewId(null);
                }}
                className="w-full px-4 py-2 bg-accent text-white text-sm font-medium rounded-[6px] hover:bg-accent-hover transition-colors"
              >
                Restore this version
              </button>
            </div>
          </div>
        )}

        {/* Confirm restore dialog */}
        {confirmRestoreId && (
          <div className="absolute inset-0 bg-white/95 flex items-center justify-center p-6 rounded-lg">
            <div className="text-center">
              <p className="text-sm font-medium text-primary mb-1">Restore this version?</p>
              <p className="text-xs text-muted mb-5">Your current content will be saved as a new history entry first.</p>
              <div className="flex gap-3 justify-center">
                <button onClick={() => setConfirmRestoreId(null)} className="px-4 py-2 text-sm border border-border rounded-[6px] hover:bg-accent-light transition-colors">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const v = versions.find((x) => x.id === confirmRestoreId);
                    if (v) onRestore(v);
                    setConfirmRestoreId(null);
                    onClose();
                  }}
                  className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-[6px] hover:bg-accent-hover transition-colors"
                >
                  Yes, restore
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
