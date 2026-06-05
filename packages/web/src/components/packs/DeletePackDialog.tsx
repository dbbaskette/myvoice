import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { deletePack } from "../../api/packs";
import { Button, Icon, Input } from "../ui";

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
      className="fixed inset-0 z-50 m-0 flex h-full w-full max-w-none items-center justify-center bg-black/40 p-0"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      aria-label="Delete pack"
    >
      <div className="bg-white border border-slate-200 rounded-xl shadow-xl p-6 w-[480px] max-w-[90vw] space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Delete pack {slug}</h2>
        <p className="text-slate-600 text-sm">
          This will move <code>{slug}</code> to <code>~/.myvoice/trash/</code>. The pack will be
          removed from your library. You can recover the files manually from the trash directory.
        </p>
        <div>
          <label htmlFor="del-confirm" className="block text-sm font-medium text-slate-700 mb-1">
            Type <code>{slug}</code> to confirm:
          </label>
          <Input
            id="del-confirm"
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        </div>
        {error && (
          <p className="text-rose-600 text-sm flex items-center gap-1.5">
            <Icon.AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setTyped("");
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button type="button" variant="danger" onClick={confirm} disabled={!canConfirm}>
            <Icon.Trash className="w-4 h-4" />
            {submitting ? "Deleting…" : "Delete pack"}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
