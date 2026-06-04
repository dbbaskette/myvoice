import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { createPack } from "../../api/packs";
import { slugify } from "./slugify";

interface NewPackDialogProps {
  open: boolean;
  onClose: () => void;
}

export function NewPackDialog({ open, onClose }: NewPackDialogProps): JSX.Element | null {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [author, setAuthor] = useState("");
  const [identity, setIdentity] = useState("");
  const [oneLine, setOneLine] = useState("");
  const [tone, setTone] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  // Slug is derived from the name, never entered by hand.
  const slug = slugify(name);
  const canSubmit =
    !submitting &&
    slug !== "" &&
    author.trim() !== "" &&
    identity.trim() !== "" &&
    oneLine.trim() !== "";

  const reset = (): void => {
    setName("");
    setAuthor("");
    setIdentity("");
    setOneLine("");
    setTone("");
    setDescription("");
    setNameError(null);
    setError(null);
  };

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setSubmitting(true);
    setNameError(null);
    setError(null);
    try {
      await createPack({
        slug,
        name,
        author,
        persona_identity: identity,
        persona_one_line: oneLine,
        persona_tone: tone.trim() || undefined,
        description: description.trim() || undefined,
      });
      const newSlug = slug;
      reset();
      onClose();
      navigate(`/packs/${encodeURIComponent(newSlug)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("409") || msg.toLowerCase().includes("slug_conflict")) {
        setNameError(`A pack named "${name}" already exists. Try a different name.`);
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
          label="What's this pack called?"
          htmlFor="np-name"
          hint="The display name for this voice."
          error={nameError}
        >
          <input
            id="np-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alice Chen"
            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
          />
          {name.trim() !== "" && slug === "" && (
            <p className="text-amber-400 text-xs mt-1">Name needs at least one letter.</p>
          )}
        </Field>

        <Field
          label="Whose voice is this?"
          htmlFor="np-author"
          hint="The person whose writing style this captures."
        >
          <input
            id="np-author"
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Alice Chen"
            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
          />
        </Field>

        <Field
          label="Who is the voice?"
          htmlFor="np-identity"
          hint="A short archetype or label for who's 'speaking'."
        >
          <input
            id="np-identity"
            type="text"
            value={identity}
            onChange={(e) => setIdentity(e.target.value)}
            placeholder="The Developer's Translator"
            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
          />
        </Field>

        <Field
          label="What do they stand for?"
          htmlFor="np-oneline"
          hint="One sentence: what they do and what they believe."
        >
          <input
            id="np-oneline"
            type="text"
            value={oneLine}
            onChange={(e) => setOneLine(e.target.value)}
            placeholder="Turns deep technical capability into clear value for builders and buyers."
            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
          />
        </Field>

        <Field
          label="How does it sound? (optional)"
          htmlFor="np-tone"
          hint="A few adjectives. Leave blank for a neutral default."
        >
          <input
            id="np-tone"
            type="text"
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            placeholder="energetic, definitive, transparent"
            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
          />
        </Field>

        <Field
          label="Anything to add? (optional)"
          htmlFor="np-desc"
          hint="A short blurb shown in the pack list."
        >
          <textarea
            id="np-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Energetic, definitive, transparent."
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
