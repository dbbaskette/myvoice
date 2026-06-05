import { useEffect, useState } from "react";
import { composePrompt } from "../../api/compose";
import { Button, Icon } from "../ui";

interface ViewPromptModalProps {
  pack: string;
  format?: string;
  samples: string[];
  draft: string;
  onClose: () => void;
}

export function ViewPromptModal({
  pack,
  format,
  samples,
  draft,
  onClose,
}: ViewPromptModalProps): JSX.Element {
  const [prompt, setPrompt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    composePrompt({
      pack,
      format: format ?? undefined,
      samples,
      draft: draft || undefined,
    })
      .then((r) => setPrompt(r.prompt))
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      });
  }, [pack, format, samples, draft]);

  const handleCopy = () => {
    if (prompt) {
      navigator.clipboard.writeText(prompt).catch(() => {});
    }
  };

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={handleBackdrop}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <dialog
        open
        className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-3xl mx-4 flex flex-col max-h-[80vh] p-0"
        aria-label="View prompt"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <span className="text-sm font-medium text-slate-900">Compose prompt</span>
          <div className="flex items-center gap-2">
            {prompt && (
              <Button variant="secondary" size="sm" onClick={handleCopy} aria-label="Copy">
                <Icon.Copy size={13} />
                Copy
              </Button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 p-0.5 rounded"
              aria-label="Close"
            >
              <Icon.X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4">
          {error ? (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm">
              {error}
            </div>
          ) : prompt === null ? (
            <div className="text-sm text-slate-400 italic">Loading prompt…</div>
          ) : (
            <pre className="text-sm text-slate-800 font-mono leading-relaxed whitespace-pre-wrap break-words bg-slate-50 border border-slate-200 rounded-lg p-3">
              {prompt}
            </pre>
          )}
        </div>
      </dialog>
    </div>
  );
}
