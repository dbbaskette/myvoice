import { Link } from "react-router-dom";

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
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-100">Entries</h2>
      <p className="text-slate-500 text-xs">
        Add or remove entries by editing files in the sub-tabs.
      </p>
      <div className="grid grid-cols-3 gap-3">
        <EntryCard label="Formats" count={formatsCount} to={`/packs/${slugEnc}/formats`} />
        <EntryCard label="Samples" count={samplesCount} to={`/packs/${slugEnc}/samples`} />
        <EntryCard label="Bios" count={biosCount} to={`/packs/${slugEnc}/bios`} />
      </div>
    </section>
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
      className="block bg-slate-900 border border-slate-800 rounded p-3 hover:border-slate-600"
    >
      <div className="text-slate-100 font-semibold">{label}</div>
      <div className="text-slate-400 text-sm">{count} entries</div>
      <div className="text-slate-500 text-xs mt-1">Edit on the {label} tab →</div>
    </Link>
  );
}
