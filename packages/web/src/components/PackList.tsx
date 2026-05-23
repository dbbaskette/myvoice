import { useCallback, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

import { type PackSummary, listPacks } from "../api/packs";
import { type GlobalEvent, useGlobalEvents } from "../hooks/useGlobalEvents";
import { NewPackDialog } from "./packs/NewPackDialog";

interface PackListProps {
  className?: string;
}

const BADGE_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-purple-500",
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
      {error && <p className="text-red-400 text-xs px-2 py-1">Error: {error}</p>}
      {packs === null && !error && <p className="text-slate-500 text-xs px-2 py-1">Loading…</p>}
      {packs !== null && packs.length === 0 && (
        <p className="text-slate-500 text-xs px-2 py-1">No packs found.</p>
      )}
      {packs?.map((p) => (
        <NavLink
          key={p.slug}
          to={`/packs/${encodeURIComponent(p.slug)}`}
          className={({ isActive }) =>
            `flex items-center gap-2 px-2 py-1 text-sm rounded ${isActive ? "bg-blue-900/40 text-blue-100" : "text-slate-300 hover:bg-slate-800/60"}`
          }
        >
          <span
            className={`inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-semibold text-white ${badgeColor(
              p.slug,
            )}`}
          >
            {p.slug[0]?.toUpperCase() ?? "?"}
          </span>
          <span className="truncate flex-1">{p.slug}</span>
          {!p.valid && (
            <span className="text-red-400 text-xs" title={`${p.error_count} validation error(s)`}>
              ✕
            </span>
          )}
        </NavLink>
      ))}
      <button
        type="button"
        onClick={() => setNewOpen(true)}
        className="mt-2 w-full px-2 py-2 text-sm border border-dashed border-slate-700 rounded text-slate-400 hover:text-slate-100 hover:border-slate-500"
      >
        + New pack
      </button>
      <NewPackDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}
