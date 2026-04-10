"use client";

interface Props {
  isOpen: boolean;
  isLoading: boolean;
  variants: string[] | null;
  onSelect: (variant: string) => void;
  onClose: () => void;
}

export default function RegenerationModal({ isOpen, isLoading, variants, onSelect, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl animate-fade-slide-in">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-primary">Choose a Rewrite</h2>
          <button onClick={onClose} className="text-muted hover:text-primary text-lg leading-none">×</button>
        </div>

        <div className="p-5">
          {isLoading && (
            <div className="flex items-center justify-center py-10 gap-3">
              <Spinner />
              <span className="text-sm text-muted">Generating alternatives...</span>
            </div>
          )}

          {!isLoading && variants && variants.length > 0 && (
            <div className="space-y-3">
              {variants.map((variant, i) => (
                <div key={i} className="border border-border rounded-[6px] p-4 hover:border-accent/40 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <span className="text-[10px] font-semibold text-muted uppercase tracking-wider block mb-1">
                        Option {i + 1}
                      </span>
                      <p className="text-sm text-charcoal leading-relaxed">{variant}</p>
                    </div>
                    <button
                      onClick={() => onSelect(variant)}
                      className="flex-shrink-0 px-3 py-1.5 bg-accent text-white text-xs font-medium rounded-[6px] hover:bg-accent-hover transition-colors"
                    >
                      Use this
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isLoading && (!variants || variants.length === 0) && (
            <p className="text-sm text-muted text-center py-6">No variants generated. Please try again.</p>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted hover:text-primary transition-colors">
            Cancel
          </button>
        </div>
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
