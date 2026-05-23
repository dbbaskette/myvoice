import type { PopCulture } from "../../api/manifest";
import { TagInput } from "./TagInput";

interface Props {
  popCulture: PopCulture;
  onChange: (next: PopCulture) => void;
}

export function PopCultureSection({ popCulture, onChange }: Props): JSX.Element {
  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-slate-100">Pop culture</h2>
      <TagInput
        htmlId="pc-allowed"
        label="Allowed"
        values={popCulture.allowed}
        onChange={(next) => onChange({ ...popCulture, allowed: next })}
        placeholder="Type a reference and press Enter…"
      />
      <TagInput
        htmlId="pc-banned"
        label="Banned"
        values={popCulture.banned}
        onChange={(next) => onChange({ ...popCulture, banned: next })}
        placeholder="Type a reference and press Enter…"
      />
    </section>
  );
}
