import { type FormEvent, useState } from "react";

import { type EntryKind, createBio, createFormat, createSample } from "../../api/entries";
import { Button, Input, Textarea } from "../ui";

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={close}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
      role="presentation"
    >
      <dialog
        open
        className="bg-white rounded-xl shadow-xl border border-slate-200 p-6 w-[480px] max-w-[90vw] space-y-4 m-0"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        aria-label={title}
      >
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <form onSubmit={submit} className="space-y-4">
          {kind !== "samples" && (
            <Field
              label="Name"
              htmlFor="ne-name"
              hint="lowercase, hyphens, no spaces"
              error={nameError}
            >
              <Input
                id="ne-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              {!nameValid && name !== "" && (
                <p className="text-amber-600 text-xs mt-1">Must match ^[a-z0-9][a-z0-9-_]*$</p>
              )}
            </Field>
          )}
          {kind !== "samples" && (
            <Field label="Description (optional)" htmlFor="ne-desc">
              <Input
                id="ne-desc"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
          )}
          {kind === "bios" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="max_chars" htmlFor="ne-mc">
                <Input
                  id="ne-mc"
                  type="number"
                  min={1}
                  value={maxChars}
                  onChange={(e) => setMaxChars(e.target.value)}
                />
              </Field>
              <Field label="target_words" htmlFor="ne-tw">
                <Input
                  id="ne-tw"
                  type="number"
                  min={1}
                  value={targetWords}
                  onChange={(e) => setTargetWords(e.target.value)}
                />
              </Field>
              <div className="col-span-2 flex items-center gap-2">
                <input
                  id="ne-tp"
                  type="checkbox"
                  checked={thirdPerson}
                  onChange={(e) => setThirdPerson(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 bg-white text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="ne-tp" className="text-sm text-slate-700">
                  Third person
                </label>
              </div>
            </div>
          )}
          {kind === "samples" && (
            <>
              <Field label="Excerpt" htmlFor="ne-excerpt">
                <Textarea
                  id="ne-excerpt"
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                  className="h-32"
                />
              </Field>
              <Field label="Source URL (optional)" htmlFor="ne-src">
                <Input
                  id="ne-src"
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                />
              </Field>
              <Field label="Note (optional)" htmlFor="ne-note">
                <Input
                  id="ne-note"
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
            </>
          )}
          {kind !== "samples" && (
            <Field label="Initial content (optional)" htmlFor="ne-content">
              <Textarea
                id="ne-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="h-24 font-mono"
              />
            </Field>
          )}
          {error && <p className="text-rose-600 text-sm">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" disabled={!canSubmit}>
              {submitting ? "Creating…" : "Create"}
            </Button>
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
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700 mb-1">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-slate-400 text-xs mt-1">{hint}</p>}
      {error && <p className="text-rose-600 text-xs mt-1">{error}</p>}
    </div>
  );
}
