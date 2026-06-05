import type { Rules } from "../../api/manifest";
import { Card } from "../ui";
import { TagInput } from "./TagInput";

interface Props {
  rules: Rules;
  onChange: (next: Rules) => void;
}

export function RulesSection({ rules, onChange }: Props): JSX.Element {
  return (
    <Card className="p-5 space-y-4">
      <h2 className="text-sm font-semibold text-slate-900">Rules</h2>
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
    </Card>
  );
}
