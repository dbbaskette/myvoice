import { Link } from "react-router-dom";

import { Card, Icon, SectionHeader } from "../ui";

interface Props {
  slug: string;
  formatsCount: number;
  samplesCount: number;
  biosCount: number;
}

export function EntriesSection({
  slug,
  formatsCount,
  samplesCount,
  biosCount,
}: Props): JSX.Element {
  const slugEnc = encodeURIComponent(slug);
  return (
    <Card className="p-5 space-y-3">
      <SectionHeader
        icon={Icon.Layers}
        color="teal"
        title="Entries"
        description="Formats, samples, and bios."
      />
      <p className="text-slate-400 text-xs">
        Add or remove entries by editing files in the sub-tabs.
      </p>
      <div className="grid grid-cols-3 gap-3">
        <EntryCard label="Formats" count={formatsCount} to={`/packs/${slugEnc}/formats`} />
        <EntryCard label="Samples" count={samplesCount} to={`/packs/${slugEnc}/samples`} />
        <EntryCard label="Bios" count={biosCount} to={`/packs/${slugEnc}/bios`} />
      </div>
    </Card>
  );
}

function EntryCard({
  label,
  count,
  to,
}: { label: string; count: number; to: string }): JSX.Element {
  return (
    <Link
      to={to}
      className="block bg-white border border-slate-200 rounded-xl p-3 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
    >
      <div className="text-slate-900 font-semibold">{label}</div>
      <div className="text-slate-600 text-sm">{count} entries</div>
      <div className="text-slate-400 text-xs mt-1 flex items-center gap-1">
        Edit on the {label} tab
        <Icon.ChevronRight size={12} />
      </div>
    </Link>
  );
}
