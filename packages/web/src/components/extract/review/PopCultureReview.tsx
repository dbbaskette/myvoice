import { TagInput } from "../../manifest/TagInput";

interface PopCultureReviewProps {
  allowed: string[];
  banned: string[];
  onAllowedChange: (next: string[]) => void;
  onBannedChange: (next: string[]) => void;
}

export function PopCultureReview({
  allowed,
  banned,
  onAllowedChange,
  onBannedChange,
}: PopCultureReviewProps): JSX.Element {
  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-slate-900">Pop culture</h2>
      <TagInput label="Allowed" htmlId="pcr-allowed" values={allowed} onChange={onAllowedChange} />
      <TagInput label="Banned" htmlId="pcr-banned" values={banned} onChange={onBannedChange} />
    </section>
  );
}
