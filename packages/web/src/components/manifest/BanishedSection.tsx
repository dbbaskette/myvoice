import type { Banished } from "../../api/manifest";
import { useAiTells } from "../../hooks/useAiTells";
import { Card, Icon, SectionHeader } from "../ui";
import { ExceptionsTable } from "./ExceptionsTable";
import { Chips, InheritedPanel } from "./InheritedDefaults";
import { TagInput } from "./TagInput";

interface Props {
  banished: Banished;
  onChange: (next: Banished) => void;
}

export function BanishedSection({ banished, onChange }: Props): JSX.Element {
  const tells = useAiTells();
  return (
    <Card className="p-5 space-y-4">
      <SectionHeader
        icon={Icon.Ban}
        color="rose"
        title="Banished"
        description="Words and phrases this voice never uses."
      />
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
      {tells && (tells.words.length > 0 || tells.phrases.length > 0) && (
        <InheritedPanel
          summary={`Inherited from shared defaults · ${tells.words.length} words · ${tells.phrases.length} phrases`}
        >
          <p className="text-xs text-slate-500">
            These apply to every pack automatically (in addition to your own list above).
          </p>
          {tells.words.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
                Words
              </p>
              <Chips items={tells.words} />
            </div>
          )}
          {tells.phrases.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
                Phrases
              </p>
              <Chips items={tells.phrases} />
            </div>
          )}
        </InheritedPanel>
      )}
    </Card>
  );
}
