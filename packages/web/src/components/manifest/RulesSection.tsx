import { marked } from "marked";

import type { Rules } from "../../api/manifest";
import { useAiTells } from "../../hooks/useAiTells";
import { Card, Icon, SectionHeader } from "../ui";
import { Chips, InheritedPanel } from "./InheritedDefaults";
import { TagInput } from "./TagInput";

interface Props {
  rules: Rules;
  onChange: (next: Rules) => void;
}

export function RulesSection({ rules, onChange }: Props): JSX.Element {
  const tells = useAiTells();
  return (
    <Card className="p-5 space-y-4">
      <SectionHeader
        icon={Icon.Scale}
        color="amber"
        title="Rules"
        description="Structural constraints applied to the rewrite."
      />
      <div className="space-y-2">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={rules.no_em_dashes}
            onChange={(e) => onChange({ ...rules, no_em_dashes: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 bg-white text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm text-slate-700">No em dashes</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={rules.no_ascii_double_hyphen_between_letters}
            onChange={(e) =>
              onChange({ ...rules, no_ascii_double_hyphen_between_letters: e.target.checked })
            }
            className="h-4 w-4 rounded border-slate-300 bg-white text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm text-slate-700">No ASCII double-hyphen between letters</span>
        </label>
      </div>
      <TagInput
        htmlId="rs-starters"
        label="No sentence starters"
        values={rules.no_sentence_starters}
        onChange={(next) => onChange({ ...rules, no_sentence_starters: next })}
        placeholder="Type a word and press Enter…"
      />
      {tells && (tells.sentence_starters.length > 0 || tells.patterns.trim() !== "") && (
        <InheritedPanel summary="Inherited from shared defaults · sentence starters + AI patterns">
          {tells.sentence_starters.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
                Forbidden sentence starters
              </p>
              <Chips items={tells.sentence_starters} />
            </div>
          )}
          {tells.patterns.trim() !== "" && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
                AI sentence patterns to avoid
              </p>
              {/* biome-ignore lint/security/noDangerouslySetInnerHtml: bundled, trusted markdown */}
              <div
                className="prose prose-slate prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: marked.parse(tells.patterns) as string }}
              />
            </div>
          )}
        </InheritedPanel>
      )}
    </Card>
  );
}
