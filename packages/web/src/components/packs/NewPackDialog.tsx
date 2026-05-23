import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { createPack } from "../../api/packs";

const SLUG_PATTERN = /^[a-z][a-z0-9\-_]*$/;

interface NewPackDialogProps {
  open: boolean;
  onClose: () => void;
}

export function NewPackDialog({ open, onClose }: NewPackDialogProps): JSX.Element | null {
  const navigate = useNavigate();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [author, setAuthor] = useState("");
  const [identity, setIdentity] = useState("");
  const [oneLine, setOneLine] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const slugValid = SLUG_PATTERN.test(slug);
  const canSubmit =
    !submitting &&
    slugValid &&
    name.trim() !== "" &&
    author.trim() !== "" &&
    identity.trim() !== "" &&
    oneLine.trim() !== "";

  const reset = (): void => {
    setSlug("");
    setName("");
    setAuthor("");
    setIdentity("");
    setOneLine("");
    setDescription("");
    setSlugError(null);
    setError(null);
  };

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setSubmitting(true);
    setSlugError(null);
    setError(null);
    try {
      await createPack({
        slug,
        name,
        author,
        persona_identity: identity,
        persona_one_line: oneLine,
        description: description.trim() || undefined,
      });
      const newSlug = slug;
      reset();
      onClose();
      navigate(`/packs/${encodeURIComponent(newSlug)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("409") || msg.toLowerCase().includes("slug_conflict")) {
        setSlugError("A pack with this slug already exists.");
      } else {
        setError(msg);
      }
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
      aria-label="New pack"
    >
      <form
        className="bg-slate-900 border border-slate-700 rounded-lg p-6 w-[480px] max-w-[90vw] space-y-4"
        onSubmit={handleSubmit}
      >
        <h2 className="text-lg font-semibold text-slate-100">New pack</h2>

        <Field
          label="Slug"
          htmlFor="np-slug"
          hint="lowercase, hyphens, no spaces"
          error={slugError}
        >
          <input
            id="np-slug"
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="alice"
            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
          />
          {!slugValid && slug !== "" && (
            <p className="text-amber-400 text-xs mt-1">Must match ^[a-z][a-z0-9-_]*$</p>
          )}
        </Field>

        <Field label="Name" htmlFor="np-name">
          <input
            id="np-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
          />
        </Field>

        <Field label="Author" htmlFor="np-author">
          <input
            id="np-author"
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
          />
        </Field>

        <Field label="Persona identity" htmlFor="np-identity" hint="A short tagline">
          <input
            id="np-identity"
            type="text"
            value={identity}
            onChange={(e) => setIdentity(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
          />
        </Field>

        <Field label="Persona one-line" htmlFor="np-oneline" hint="One sentence of stance">
          <input
            id="np-oneline"
            type="text"
            value={oneLine}
            onChange={(e) => setOneLine(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
          />
        </Field>

        <Field label="Description (optional)" htmlFor="np-desc">
          <textarea
            id="np-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 h-16"
          />
        </Field>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
            className="px-3 py-1.5 text-sm border border-slate-700 rounded text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create pack"}
          </button>
        </div>
      </form>
    </dialog>
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
