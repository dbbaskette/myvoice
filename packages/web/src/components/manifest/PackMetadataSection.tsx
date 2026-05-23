import type { PackInfo } from "../../api/manifest";

interface Props {
  pack: PackInfo;
  onChange: (next: PackInfo) => void;
  errors: Record<string, string>;
}

export function PackMetadataSection({ pack, onChange, errors }: Props): JSX.Element {
  const set = <K extends keyof PackInfo>(k: K, v: PackInfo[K]): void =>
    onChange({ ...pack, [k]: v });
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-100">Pack</h2>
      <Field label="Slug" id="pm-slug" hint="Renaming not yet supported">
        <input
          id="pm-slug"
          type="text"
          value={pack.slug}
          disabled
          className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-500"
        />
      </Field>
      <Field label="Name" id="pm-name" error={errors["pack.name"]}>
        <input
          id="pm-name"
          type="text"
          value={pack.name}
          onChange={(e) => set("name", e.target.value)}
          className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
        />
      </Field>
      <Field label="Version" id="pm-version" error={errors["pack.version"]}>
        <input
          id="pm-version"
          type="text"
          value={pack.version}
          onChange={(e) => set("version", e.target.value)}
          className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
        />
      </Field>
      <Field label="Author" id="pm-author" error={errors["pack.author"]}>
        <input
          id="pm-author"
          type="text"
          value={pack.author}
          onChange={(e) => set("author", e.target.value)}
          className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
        />
      </Field>
      <Field label="Description" id="pm-desc">
        <textarea
          id="pm-desc"
          value={pack.description ?? ""}
          onChange={(e) => set("description", e.target.value || null)}
          className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 h-20"
        />
      </Field>
      <Field label="Homepage" id="pm-home">
        <input
          id="pm-home"
          type="text"
          value={pack.homepage ?? ""}
          onChange={(e) => set("homepage", e.target.value || null)}
          className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
        />
      </Field>
    </section>
  );
}

interface FieldProps {
  label: string;
  id: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}

function Field({ label, id, hint, error, children }: FieldProps): JSX.Element {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-200 mb-1">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-slate-500 text-xs mt-1">{hint}</p>}
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}
