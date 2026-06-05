import { useCallback, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

import { type PackSummary, listPacks } from "../api/packs";
import { type GlobalEvent, useGlobalEvents } from "../hooks/useGlobalEvents";
import { ImportPackDialog } from "./packs/ImportPackDialog";
import { NewPackDialog } from "./packs/NewPackDialog";
import { Button, Icon, cn } from "./ui";

interface PackListProps {
  className?: string;
}

const BADGE_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-pink-500",
  "bg-teal-500",
];

function badgeColor(slug: string): string {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return BADGE_COLORS[h % BADGE_COLORS.length];
}

export function PackList({ className }: PackListProps): JSX.Element {
  const [packs, setPacks] = useState<PackSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const reload = useCallback(() => {
    const abort = new AbortController();
    listPacks({ signal: abort.signal })
      .then((data) => setPacks(data))
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, []);

  useEffect(() => reload(), [reload]);

  const onEvent = useCallback(
    (evt: GlobalEvent) => {
      if (
        evt.type === "pack:created" ||
        evt.type === "pack:deleted" ||
        evt.type === "pack:updated" ||
        evt.type === "pack:invalid"
      ) {
        reload();
      }
    },
    [reload],
  );
  useGlobalEvents(onEvent);

  return (
    <div className={className}>
      {error && <p className="text-rose-600 text-xs px-2 py-1">Error: {error}</p>}
      {packs === null && !error && <p className="text-slate-400 text-xs px-2 py-1">Loading…</p>}
      {packs !== null && packs.length === 0 && (
        <p className="text-slate-400 text-xs px-2 py-1">No packs yet.</p>
      )}
      <div className="flex flex-col gap-0.5">
        {packs?.map((p) => (
          <NavLink
            key={p.slug}
            to={`/packs/${encodeURIComponent(p.slug)}`}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 px-2 py-1.5 text-sm rounded-lg transition-colors",
                isActive
                  ? "bg-indigo-50 text-indigo-700 font-medium"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )
            }
          >
            <span
              className={cn(
                "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold text-white",
                badgeColor(p.slug),
              )}
            >
              {p.slug[0]?.toUpperCase() ?? "?"}
            </span>
            <span className="truncate flex-1">{p.slug}</span>
            {!p.valid && (
              <span title={`${p.error_count} validation error(s)`} className="text-rose-500">
                <Icon.AlertCircle size={14} />
              </span>
            )}
          </NavLink>
        ))}
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        <Button variant="secondary" size="sm" className="w-full" onClick={() => setNewOpen(true)}>
          <Icon.Plus size={15} /> New pack
        </Button>
        <Button variant="ghost" size="sm" className="w-full" onClick={() => setImportOpen(true)}>
          <Icon.Upload size={15} /> Import pack
        </Button>
      </div>
      <NewPackDialog open={newOpen} onClose={() => setNewOpen(false)} />
      <ImportPackDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
