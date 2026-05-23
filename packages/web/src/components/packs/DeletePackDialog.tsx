import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { deletePack } from "../../api/packs";

interface DeletePackDialogProps {
  slug: string;
  open: boolean;
  onClose: () => void;
}

export function DeletePackDialog({
  slug,
  open,
  onClose,
}: DeletePackDialogProps): JSX.Element | null {
  const navigate = useNavigate();
  const [typed, setTyped] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const canConfirm = typed === slug && !submitting;

  const confirm = async (): Promise<void> => {
    setSubmitting(true);
    setError(null);
    try {
      await deletePack(slug);
      setTyped("");
      onClose();
      navigate("/packs");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <dialog
      open
      className="fixed inset-0 z-50 m-0 flex h-full w-full max-w-none items-center justify-center bg-black/60 p-0"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      aria-label="Delete pack"
    >
      <div className="bg-slate-900 border border-red-800 rounded-lg p-6 w-[480px] max-w-[90vw] space-y-4">
        <h2 className="text-lg font-semibold text-red-300">Delete pack {slug}</h2>
        <p className="text-slate-300 text-sm">
          This will move <code>{slug}</code> to <code>~/.myvoice/trash/</code>. The pack will be
          removed from your library. You can recover the files manually from the trash directory.
        </p>
        <div>
          <label htmlFor="del-confirm" className="block text-sm font-medium text-slate-200 mb-1">
            Type <code>{slug}</code> to confirm:
          </label>
          <input
            id="del-confirm"
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
            {submitting ? "Deleting…" : "Delete pack"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
