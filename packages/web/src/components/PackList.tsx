import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

import { type PackSummary, listPacks } from "../api/packs";

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

  useEffect(() => {
    const abort = new AbortController();
    listPacks({ signal: abort.signal })
      .then((data) => setPacks(data))
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, []);

  if (error) {
    return (
      <div className={className}>
        <p className="text-red-400 text-xs px-2 py-1">Error: {error}</p>
      </div>
    );
  }
  if (packs === null) {
    return (
      <div className={className}>
        <p className="text-slate-500 text-xs px-2 py-1">Loading…</p>
      </div>
    );
  }
  if (packs.length === 0) {
    return (
      <div className={className}>
        <p className="text-slate-500 text-xs px-2 py-1">No packs found.</p>
      </div>
    );
  }
  return (
    <div className={className}>
      {packs.map((p) => (
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
    </div>
  );
}
