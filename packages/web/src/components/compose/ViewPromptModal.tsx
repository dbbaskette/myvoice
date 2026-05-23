import { useEffect, useState } from "react";
import { composePrompt } from "../../api/compose";

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={handleBackdrop}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <dialog
        open
        className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-3xl mx-4 flex flex-col max-h-[80vh] p-0"
        aria-label="View prompt"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <span className="text-sm font-medium text-slate-200">Compose prompt</span>
          <div className="flex items-center gap-2">
            {prompt && (
              <button
                type="button"
                onClick={handleCopy}
                className="px-2 py-0.5 text-xs border border-slate-700 rounded text-slate-300 hover:bg-slate-800"
              >
                Copy
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 text-lg leading-none"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4">
          {error ? (
            <div className="p-3 bg-red-950 border border-red-800 rounded text-red-300 text-sm">
              {error}
            </div>
          ) : prompt === null ? (
            <div className="text-sm text-slate-500 italic">Loading prompt…</div>
          ) : (
            <pre className="text-sm text-slate-100 font-mono leading-relaxed whitespace-pre-wrap break-words">
              {prompt}
            </pre>
          )}
        </div>
      </dialog>
    </div>
  );
}
