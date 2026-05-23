import type { Persona } from "../../api/manifest";

interface Props {
  persona: Persona;
  onChange: (next: Persona) => void;
  errors: Record<string, string>;
}

export function PersonaSection({ persona, onChange, errors }: Props): JSX.Element {
  const set = <K extends keyof Persona>(k: K, v: Persona[K]): void =>
    onChange({ ...persona, [k]: v });
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-100">Persona</h2>
      <Field label="Identity" id="ps-identity" error={errors["persona.identity"]}>
        <input
          id="ps-identity"
          type="text"
          value={persona.identity}
          onChange={(e) => set("identity", e.target.value)}
          className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
        />
      </Field>
      <Field label="One-line" id="ps-oneline" error={errors["persona.one_line"]}>
        <input
          id="ps-oneline"
          type="text"
          value={persona.one_line}
          onChange={(e) => set("one_line", e.target.value)}
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
