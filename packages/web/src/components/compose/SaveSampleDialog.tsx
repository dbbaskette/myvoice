import { useState } from "react";
import { saveSample } from "../../api/samples";
import { Button, Icon } from "../ui";

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={handleBackdrop}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !saving) onClose();
      }}
    >
      <dialog
        open
        className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg mx-4 p-0"
        aria-label="Save as sample"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <span className="text-sm font-medium text-slate-900">Save as sample</span>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-slate-400 hover:text-slate-600 disabled:opacity-40 p-0.5 rounded"
            aria-label="Close"
          >
            <Icon.X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-3">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm">
              {error}
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-600">
              Excerpt <span className="text-slate-400">(required)</span>
            </span>
            <textarea
              className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900
                placeholder:text-slate-400 font-mono leading-relaxed resize-y min-h-[120px]
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus:border-indigo-500"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              required
              disabled={saving}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-600">
              Source URL <span className="text-slate-400">(optional)</span>
            </span>
            <input
              type="url"
              className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900
                placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus:border-indigo-500"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://…"
              disabled={saving}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-600">
              Note <span className="text-slate-400">(optional)</span>
            </span>
            <input
              type="text"
              className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900
                placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus:border-indigo-500"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Brief annotation…"
              disabled={saving}
            />
          </label>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={saving || !excerpt.trim()}>
              <Icon.Save size={13} />
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
