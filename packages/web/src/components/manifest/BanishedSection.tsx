import type { Banished } from "../../api/manifest";
import { Card } from "../ui";
import { ExceptionsTable } from "./ExceptionsTable";
import { TagInput } from "./TagInput";

interface Props {
  banished: Banished;
  onChange: (next: Banished) => void;
}

export function BanishedSection({ banished, onChange }: Props): JSX.Element {
  return (
    <Card className="p-5 space-y-4">
      <h2 className="text-sm font-semibold text-slate-900">Banished</h2>
      <TagInput
        htmlId="bs-words"
        label="Words"
        values={banished.words}
        onChange={(next) => onChange({ ...banished, words: next })}
        placeholder="Type a word and press Enter…"
      />
      <TagInput
        htmlId="bs-phrases"
        label="Phrases"
        values={banished.phrases}
        onChange={(next) => onChange({ ...banished, phrases: next })}
        placeholder="Type a phrase and press Enter…"
      />
      <div>
        <p className="block text-sm font-medium text-slate-700 mb-2">Permitted exceptions</p>
        <ExceptionsTable
          values={banished.permitted_exceptions}
          onChange={(next) => onChange({ ...banished, permitted_exceptions: next })}
        />
      </div>
    </Card>
  );
}
