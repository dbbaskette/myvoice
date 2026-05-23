import { useState } from "react";
import { saveSample } from "../../api/samples";

interface SaveSampleDialogProps {
  packSlug: string;
  initialExcerpt: string;
  onSaved: (id: string) => void;
  onClose: () => void;
}

export function SaveSampleDialog({
  packSlug,
  initialExcerpt,
  onSaved,
  onClose,
}: SaveSampleDialogProps): JSX.Element {
  const [excerpt, setExcerpt] = useState(initialExcerpt);
  const [sourceUrl, setSourceUrl] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!excerpt.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const result = await saveSample(packSlug, {
        excerpt: excerpt.trim(),
        source_url: sourceUrl.trim() || undefined,
        note: note.trim() || undefined,
      });
      onSaved(result.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !saving) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={handleBackdrop}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !saving) onClose();
      }}
    >
      <dialog
        open
        className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-lg mx-4 p-0"
        aria-label="Save as sample"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <span className="text-sm font-medium text-slate-200">Save as sample</span>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-slate-400 hover:text-slate-200 text-lg leading-none disabled:opacity-40"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-3">
          {error && (
            <div className="p-3 bg-red-950 border border-red-800 rounded text-red-300 text-sm">
              {error}
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">
              Excerpt <span className="text-slate-600">(required)</span>
            </span>
            <textarea
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-100
                font-mono leading-relaxed resize-y min-h-[120px]
                focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              required
              disabled={saving}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">
              Source URL <span className="text-slate-600">(optional)</span>
            </span>
            <input
              type="url"
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-100
                focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://…"
              disabled={saving}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">
              Note <span className="text-slate-600">(optional)</span>
            </span>
            <input
              type="text"
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-100
                focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Brief annotation…"
              disabled={saving}
            />
          </label>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-3 py-1.5 text-sm border border-slate-700 rounded text-slate-300
                hover:bg-slate-800 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !excerpt.trim()}
              className="px-4 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded
                disabled:opacity-40 disabled:cursor-not-allowed font-medium"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
