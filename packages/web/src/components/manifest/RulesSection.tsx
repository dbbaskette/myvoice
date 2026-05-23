import type { Rules } from "../../api/manifest";
import { TagInput } from "./TagInput";

interface Props {
  rules: Rules;
  onChange: (next: Rules) => void;
}

export function RulesSection({ rules, onChange }: Props): JSX.Element {
  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-slate-100">Rules</h2>
      <div className="space-y-2">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={rules.no_em_dashes}
            onChange={(e) => onChange({ ...rules, no_em_dashes: e.target.checked })}
            className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
          />
          <span className="text-sm text-slate-200">No em dashes</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={rules.no_ascii_double_hyphen_between_letters}
            onChange={(e) =>
              onChange({ ...rules, no_ascii_double_hyphen_between_letters: e.target.checked })
            }
            className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
          />
          <span className="text-sm text-slate-200">No ASCII double-hyphen between letters</span>
        </label>
      </div>
      <TagInput
        htmlId="rs-starters"
        label="No sentence starters"
        values={rules.no_sentence_starters}
        onChange={(next) => onChange({ ...rules, no_sentence_starters: next })}
        placeholder="Type a word and press Enter…"
      />
    </section>
  );
}
