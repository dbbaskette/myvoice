import { useState } from "react";

import { type EntryKind, deleteEntry } from "../../api/entries";

interface DeleteEntryDialogProps {
  slug: string;
  kind: EntryKind;
  /** For formats/bios: the name. For samples: the id. */
  ident: string;
  /** Display label (typically the filename) shown in the prompt. */
  label: string;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteEntryDialog({
  slug,
  kind,
  ident,
  label,
  open,
  onClose,
  onDeleted,
}: DeleteEntryDialogProps): JSX.Element | null {
  const [typed, setTyped] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const canConfirm = typed === ident && !submitting;

  const confirm = async (): Promise<void> => {
    setSubmitting(true);
    setError(null);
    try {
      await deleteEntry(slug, kind, ident);
      setTyped("");
      onDeleted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="presentation"
    >
      <dialog
        open
        className="bg-slate-900 border border-red-800 rounded-lg p-6 w-[480px] max-w-[90vw] space-y-4 m-0"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        aria-label={`Delete ${kind.slice(0, -1)}`}
      >
        <h2 className="text-lg font-semibold text-red-300">
          Delete {kind.slice(0, -1)} {label}
        </h2>
        <p className="text-slate-300 text-sm">
          This removes the manifest entry and deletes the file from disk.
        </p>
        <div>
          <label htmlFor="de-confirm" className="block text-sm font-medium text-slate-200 mb-1">
            Type <code>{ident}</code> to confirm:
          </label>
          <input
            id="de-confirm"
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
          />
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setTyped("");
              onClose();
            }}
            className="px-3 py-1.5 text-sm border border-slate-700 rounded text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!canConfirm}
            className="px-3 py-1.5 text-sm bg-red-700 hover:bg-red-600 text-white rounded disabled:opacity-50"
          >
            {submitting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
