import type { LucideIcon } from "lucide-react";

import type { PackDetail } from "../api/packs";
import { useAiTells } from "../hooks/useAiTells";
import { Card, Icon, cn } from "./ui";

interface PackOverviewProps {
  pack: PackDetail;
}

type StatColor = "rose" | "amber" | "emerald" | "sky" | "violet" | "teal";

const STAT: Record<StatColor, { card: string; chip: string }> = {
  rose: { card: "bg-rose-50/60 border-rose-100", chip: "bg-rose-100 text-rose-600" },
  amber: { card: "bg-amber-50/60 border-amber-100", chip: "bg-amber-100 text-amber-600" },
  emerald: { card: "bg-emerald-50/60 border-emerald-100", chip: "bg-emerald-100 text-emerald-600" },
  sky: { card: "bg-sky-50/60 border-sky-100", chip: "bg-sky-100 text-sky-600" },
  violet: { card: "bg-violet-50/60 border-violet-100", chip: "bg-violet-100 text-violet-600" },
  teal: { card: "bg-teal-50/60 border-teal-100", chip: "bg-teal-100 text-teal-600" },
};

export function PackOverview({ pack }: PackOverviewProps): JSX.Element {
  const tells = useAiTells();
  const sharedWords = tells?.words.length ?? 0;
  const sharedPhrases = tells?.phrases.length ?? 0;
  return (
    <div className="p-8 max-w-4xl space-y-6">
      <header className="mb-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{pack.name}</h1>
        {pack.description && <p className="text-slate-600 mt-1">{pack.description}</p>}
        <div className="text-xs text-slate-400 mt-2 font-mono">{pack.root_path}</div>
      </header>

      {pack.persona && (
        <section>
          <h2 className="text-xs uppercase tracking-wider text-slate-400 mb-2">Persona</h2>
          <Card className="p-4 flex items-start gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Icon.User size={18} />
            </span>
            <div className="min-w-0">
              <div className="font-semibold text-slate-900">{pack.persona.identity}</div>
              <div className="text-slate-600 text-sm mt-0.5">{pack.persona.one_line}</div>
            </div>
          </Card>
        </section>
      )}

      {pack.counts && (
        <section>
          <h2 className="text-xs uppercase tracking-wider text-slate-400 mb-2">Contents</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard
              icon={Icon.Ban}
              color="rose"
              label="Banished words"
              value={pack.counts.banished_words}
              sub={sharedWords ? `+${sharedWords} shared` : undefined}
            />
            <StatCard
              icon={Icon.Ban}
              color="amber"
              label="Banished phrases"
              value={pack.counts.banished_phrases}
              sub={sharedPhrases ? `+${sharedPhrases} shared` : undefined}
            />
            <StatCard
              icon={Icon.ShieldCheck}
              color="emerald"
              label="Permitted exceptions"
              value={pack.counts.permitted_exceptions}
            />
            <StatCard icon={Icon.Files} color="sky" label="Formats" value={pack.counts.formats} />
            <StatCard
              icon={Icon.MessageSquare}
              color="violet"
              label="Samples"
              value={pack.counts.samples}
            />
            <StatCard icon={Icon.User} color="teal" label="Bios" value={pack.counts.bios} />
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

function StatCard({
  icon: IconCmp,
  color,
  label,
  value,
  sub,
}: {
  icon: LucideIcon;
  color: StatColor;
  label: string;
  value: number;
  sub?: string;
}): JSX.Element {
  return (
    <div className={cn("rounded-xl border p-4", STAT[color].card)}>
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-lg",
            STAT[color].chip,
          )}
        >
          <IconCmp size={16} />
        </span>
        <div className="text-2xl font-semibold text-slate-900">{value}</div>
      </div>
      <div className="text-xs text-slate-500 mt-2">{label}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}
