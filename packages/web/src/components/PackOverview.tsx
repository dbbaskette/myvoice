import type { PackDetail } from "../api/packs";

interface PackOverviewProps {
  pack: PackDetail;
}

export function PackOverview({ pack }: PackOverviewProps): JSX.Element {
  return (
    <div className="p-8 text-slate-200 max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-100">{pack.name}</h1>
        {pack.description && <p className="text-slate-400 mt-1">{pack.description}</p>}
        <div className="text-xs text-slate-500 mt-2 font-mono">{pack.root_path}</div>
      </header>

      {pack.persona && (
        <section className="mb-6">
          <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-2">Persona</h2>
          <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
            <div className="font-semibold text-slate-100">{pack.persona.identity}</div>
            <div className="text-slate-400 text-sm mt-1">{pack.persona.one_line}</div>
          </div>
        </section>
      )}

      {pack.counts && (
        <section className="mb-6">
          <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-2">Contents</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard label="Banished words" value={pack.counts.banished_words} />
            <StatCard label="Banished phrases" value={pack.counts.banished_phrases} />
            <StatCard label="Permitted exceptions" value={pack.counts.permitted_exceptions} />
            <StatCard label="Formats" value={pack.counts.formats} />
            <StatCard label="Samples" value={pack.counts.samples} />
            <StatCard label="Bios" value={pack.counts.bios} />
          </div>
        </section>
      )}

      {pack.errors.length > 0 && (
        <section>
          <h2 className="text-xs uppercase tracking-wider text-red-400 mb-2">Validation errors</h2>
          <div className="bg-red-900/20 border border-red-900/50 rounded-md p-4 text-sm">
            <ul className="space-y-1">
              {pack.errors.map((e) => (
                <li key={`${e.path}:${e.message}`} className="text-red-300">
                  <span className="font-mono text-xs text-red-400/70">{e.path}:</span> {e.message}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-md p-3">
      <div className="text-2xl font-semibold text-slate-100">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}
