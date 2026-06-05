import type { PackDetail } from "../api/packs";
import { Card, Icon } from "./ui";

interface PackOverviewProps {
  pack: PackDetail;
}

export function PackOverview({ pack }: PackOverviewProps): JSX.Element {
  return (
    <div className="p-8 max-w-4xl space-y-6">
      <header className="mb-2">
        <h1 className="text-2xl font-semibold text-slate-900">{pack.name}</h1>
        {pack.description && <p className="text-slate-600 mt-1">{pack.description}</p>}
        <div className="text-xs text-slate-400 mt-2 font-mono">{pack.root_path}</div>
      </header>

      {pack.persona && (
        <section>
          <h2 className="text-xs uppercase tracking-wider text-slate-400 mb-2">Persona</h2>
          <Card className="p-4">
            <div className="font-semibold text-slate-900">{pack.persona.identity}</div>
            <div className="text-slate-600 text-sm mt-1">{pack.persona.one_line}</div>
          </Card>
        </section>
      )}

      {pack.counts && (
        <section>
          <h2 className="text-xs uppercase tracking-wider text-slate-400 mb-2">Contents</h2>
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
          <h2 className="text-xs uppercase tracking-wider text-rose-600 mb-2">Validation errors</h2>
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm">
            <ul className="space-y-1">
              {pack.errors.map((e) => (
                <li key={`${e.path}:${e.message}`} className="text-rose-700 flex items-start gap-2">
                  <Icon.AlertCircle size={14} className="mt-0.5 shrink-0 text-rose-500" />
                  <span>
                    <span className="font-mono text-xs text-rose-500">{e.path}:</span> {e.message}
                  </span>
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
    <Card className="p-3">
      <div className="text-2xl font-semibold text-slate-900">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </Card>
  );
}
