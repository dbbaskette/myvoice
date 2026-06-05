import type { PopCulture } from "../../api/manifest";
import { Card, Icon, SectionHeader } from "../ui";
import { TagInput } from "./TagInput";

interface Props {
  popCulture: PopCulture;
  onChange: (next: PopCulture) => void;
}

export function PopCultureSection({ popCulture, onChange }: Props): JSX.Element {
  return (
    <Card className="p-5 space-y-4">
      <SectionHeader
        icon={Icon.Clapperboard}
        color="violet"
        title="Pop culture"
        description="Franchises this voice may or may not reference."
      />
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
    </Card>
  );
}
