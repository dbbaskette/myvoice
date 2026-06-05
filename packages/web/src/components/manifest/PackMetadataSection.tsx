import type { PackInfo } from "../../api/manifest";
import { Card, Icon, Input, SectionHeader, Textarea } from "../ui";

interface Props {
  pack: PackInfo;
  onChange: (next: PackInfo) => void;
  errors: Record<string, string>;
}

export function PackMetadataSection({ pack, onChange, errors }: Props): JSX.Element {
  const set = <K extends keyof PackInfo>(k: K, v: PackInfo[K]): void =>
    onChange({ ...pack, [k]: v });
  return (
    <Card className="p-5 space-y-3">
      <SectionHeader
        icon={Icon.Tag}
        color="sky"
        title="Pack"
        description="Identity and metadata for this pack."
      />
      <Field label="Slug" id="pm-slug" hint="Renaming not yet supported">
        <Input id="pm-slug" type="text" value={pack.slug} disabled />
      </Field>
      <Field label="Name" id="pm-name" error={errors["pack.name"]}>
        <Input
          id="pm-name"
          type="text"
          value={pack.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </Field>
      <Field label="Version" id="pm-version" error={errors["pack.version"]}>
        <Input
          id="pm-version"
          type="text"
          value={pack.version}
          onChange={(e) => set("version", e.target.value)}
        />
      </Field>
      <Field label="Author" id="pm-author" error={errors["pack.author"]}>
        <Input
          id="pm-author"
          type="text"
          value={pack.author}
          onChange={(e) => set("author", e.target.value)}
        />
      </Field>
      <Field label="Description" id="pm-desc">
        <Textarea
          id="pm-desc"
          value={pack.description ?? ""}
          onChange={(e) => set("description", e.target.value || null)}
          className="h-20"
        />
      </Field>
      <Field label="Homepage" id="pm-home">
        <Input
          id="pm-home"
          type="text"
          value={pack.homepage ?? ""}
          onChange={(e) => set("homepage", e.target.value || null)}
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
