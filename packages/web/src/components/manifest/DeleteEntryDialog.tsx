import { useState } from "react";

import { type EntryKind, deleteEntry } from "../../api/entries";
import { Button, Input } from "../ui";

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="presentation"
    >
      <dialog
        open
        className="bg-white rounded-xl shadow-xl border border-rose-200 p-6 w-[480px] max-w-[90vw] space-y-4 m-0"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        aria-label={`Delete ${kind.slice(0, -1)}`}
      >
        <h2 className="text-lg font-semibold text-rose-600">
          Delete {kind.slice(0, -1)} {label}
        </h2>
        <p className="text-slate-600 text-sm">
          This removes the manifest entry and deletes the file from disk.
        </p>
        <div>
          <label htmlFor="de-confirm" className="block text-sm font-medium text-slate-700 mb-1">
            Type <code className="text-slate-900 bg-slate-100 px-1 rounded">{ident}</code> to
            confirm:
          </label>
          <Input
            id="de-confirm"
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        </div>
        {error && <p className="text-rose-600 text-sm">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setTyped("");
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={confirm} disabled={!canConfirm}>
            {submitting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </dialog>
    </div>
  );
}
