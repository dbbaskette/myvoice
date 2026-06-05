import type { Persona } from "../../api/manifest";
import { Card, Input } from "../ui";

interface Props {
  persona: Persona;
  onChange: (next: Persona) => void;
  errors: Record<string, string>;
}

export function PersonaSection({ persona, onChange, errors }: Props): JSX.Element {
  const set = <K extends keyof Persona>(k: K, v: Persona[K]): void =>
    onChange({ ...persona, [k]: v });
  return (
    <Card className="p-5 space-y-3">
      <h2 className="text-sm font-semibold text-slate-900">Persona</h2>
      <Field label="Identity" id="ps-identity" error={errors["persona.identity"]}>
        <Input
          id="ps-identity"
          type="text"
          value={persona.identity}
          onChange={(e) => set("identity", e.target.value)}
        />
      </Field>
      <Field label="One-line" id="ps-oneline" error={errors["persona.one_line"]}>
        <Input
          id="ps-oneline"
          type="text"
          value={persona.one_line}
          onChange={(e) => set("one_line", e.target.value)}
        />
      </Field>
    </Card>
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
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-slate-400 text-xs mt-1">{hint}</p>}
      {error && <p className="text-rose-600 text-xs mt-1">{error}</p>}
    </div>
  );
}
