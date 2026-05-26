import { type ChangeEvent, useState } from "react";

import { importPack } from "../../api/pack_zip";

interface ImportPackDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ImportPackDialog({ open, onClose }: ImportPackDialogProps): JSX.Element | null {
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!open) return null;

  const reset = () => {
    setFile(null);
    setError(null);
    setSuccess(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>): void => {
    setFile(e.target.files?.[0] ?? null);
    setError(null);
    setSuccess(null);
  };

  const submit = async (): Promise<void> => {
    if (!file) return;
    setSubmitting(true);
    setError(null);
    try {
      const summary = await importPack(file);
      setSuccess(`Imported pack "${summary.slug}".`);
      setTimeout(close, 1500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("409")) {
        setError("A pack with that slug already exists. Rename or delete it first.");
      } else if (msg.includes("422")) {
        setError("That zip isn't a valid style pack.");
      } else if (msg.includes("413")) {
        setError("Zip is too large (limit 50 MB).");
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={close}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
      role="presentation"
    >
      <dialog
        open
        className="bg-slate-900 border border-slate-700 rounded-lg p-6 w-[480px] max-w-[90vw] space-y-4 m-0"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        aria-label="Import pack"
      >
        <h2 className="text-lg font-semibold text-slate-100">Import pack</h2>
        <p className="text-slate-400 text-sm">
          Upload a .zip exported from another myvoice install.
        </p>
        <input
          type="file"
          accept=".zip,application/zip"
          onChange={onFile}
          aria-label="Pack zip file"
          className="block w-full text-sm text-slate-300 file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700"
        />
        {file && (
          <p className="text-slate-500 text-xs">
            {file.name} · {(file.size / 1024).toFixed(1)} KB
          </p>
        )}
        {error && <p className="text-red-400 text-sm">{error}</p>}
        {success && <p className="text-emerald-400 text-sm">{success}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="px-3 py-1.5 text-sm border border-slate-700 rounded text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!file || submitting}
            className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded disabled:opacity-50"
          >
            {submitting ? "Importing…" : "Import"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
