import { type FormEvent, useState } from "react";

import { type EntryKind, createBio, createFormat, createSample } from "../../api/entries";

const NAME_PATTERN = /^[a-z0-9][a-z0-9\-_]*$/;

interface NewEntryDialogProps {
  slug: string;
  kind: EntryKind;
  open: boolean;
  onClose: () => void;
  onCreated: (file: string) => void;
}

export function NewEntryDialog({
  slug,
  kind,
  open,
  onClose,
  onCreated,
}: NewEntryDialogProps): JSX.Element | null {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [note, setNote] = useState("");
  const [maxChars, setMaxChars] = useState("");
  const [targetWords, setTargetWords] = useState("");
  const [thirdPerson, setThirdPerson] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const reset = () => {
    setName("");
    setDescription("");
    setContent("");
    setExcerpt("");
    setSourceUrl("");
    setNote("");
    setMaxChars("");
    setTargetWords("");
    setThirdPerson(false);
    setNameError(null);
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setSubmitting(true);
    setNameError(null);
    setError(null);
    try {
      let file: string;
      if (kind === "formats") {
        const r = await createFormat(slug, {
          name,
          description: description.trim() || undefined,
          content: content.trim() || undefined,
        });
        file = r.file;
      } else if (kind === "bios") {
        const r = await createBio(slug, {
          name,
          description: description.trim() || undefined,
          max_chars: maxChars ? Number.parseInt(maxChars, 10) : undefined,
          target_words: targetWords ? Number.parseInt(targetWords, 10) : undefined,
          third_person: thirdPerson,
          content: content.trim() || undefined,
        });
        file = r.file;
      } else {
        const r = await createSample(slug, {
          excerpt,
          source_url: sourceUrl.trim() || undefined,
          note: note.trim() || undefined,
        });
        file = r.file;
      }
      onCreated(file);
      close();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("409") || msg.toLowerCase().includes("conflict")) {
        if (kind === "samples") {
          setError("Could not create sample. Try again.");
        } else {
          setNameError(`A ${kind.slice(0, -1)} with this name already exists.`);
        }
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const nameValid = kind === "samples" ? true : NAME_PATTERN.test(name);
  const canSubmit =
    !submitting &&
    (kind === "samples" ? excerpt.trim().length > 0 : nameValid && name.trim().length > 0);

  const title = kind === "formats" ? "New format" : kind === "bios" ? "New bio" : "New sample";

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
        aria-label={title}
      >
        <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
        <form onSubmit={submit} className="space-y-4">
          {kind !== "samples" && (
            <Field
              label="Name"
              htmlFor="ne-name"
              hint="lowercase, hyphens, no spaces"
              error={nameError}
            >
              <input
                id="ne-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
              />
              {!nameValid && name !== "" && (
                <p className="text-amber-400 text-xs mt-1">Must match ^[a-z0-9][a-z0-9-_]*$</p>
              )}
            </Field>
          )}
          {kind !== "samples" && (
            <Field label="Description (optional)" htmlFor="ne-desc">
              <input
                id="ne-desc"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
              />
            </Field>
          )}
          {kind === "bios" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="max_chars" htmlFor="ne-mc">
                <input
                  id="ne-mc"
                  type="number"
                  min={1}
                  value={maxChars}
                  onChange={(e) => setMaxChars(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
                />
              </Field>
              <Field label="target_words" htmlFor="ne-tw">
                <input
                  id="ne-tw"
                  type="number"
                  min={1}
                  value={targetWords}
                  onChange={(e) => setTargetWords(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
                />
              </Field>
              <div className="col-span-2 flex items-center gap-2">
                <input
                  id="ne-tp"
                  type="checkbox"
                  checked={thirdPerson}
                  onChange={(e) => setThirdPerson(e.target.checked)}
                />
                <label htmlFor="ne-tp" className="text-sm text-slate-200">
                  Third person
                </label>
              </div>
            </div>
          )}
          {kind === "samples" && (
            <>
              <Field label="Excerpt" htmlFor="ne-excerpt">
                <textarea
                  id="ne-excerpt"
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                  className="w-full h-32 bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
                />
              </Field>
              <Field label="Source URL (optional)" htmlFor="ne-src">
                <input
                  id="ne-src"
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
                />
              </Field>
              <Field label="Note (optional)" htmlFor="ne-note">
                <input
                  id="ne-note"
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
                />
              </Field>
            </>
          )}
          {kind !== "samples" && (
            <Field label="Initial content (optional)" htmlFor="ne-content">
              <textarea
                id="ne-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full h-24 bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 font-mono text-sm"
              />
            </Field>
          )}
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="px-3 py-1.5 text-sm border border-slate-700 rounded text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}

function Field({ label, htmlFor, hint, error, children }: FieldProps): JSX.Element {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-200 mb-1">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-slate-500 text-xs mt-1">{hint}</p>}
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}
