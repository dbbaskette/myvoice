import { useState } from "react";

import type { ProposedSample } from "../../../api/extract";

interface SampleCardProps {
  sample: ProposedSample;
  selected: boolean;
  onToggle: () => void;
  onExcerptChange: (next: string) => void;
}

export function SampleCard({
  sample,
  selected,
  onToggle,
  onExcerptChange,
}: SampleCardProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const preview = sample.excerpt.length > 200 ? `${sample.excerpt.slice(0, 200)}…` : sample.excerpt;
  return (
    <div
      className={`bg-slate-900 border rounded p-3 ${selected ? "border-emerald-700" : "border-slate-800"}`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Include sample ${sample.rank}`}
          className="mt-1"
        />
        <div className="flex-1 min-w-0">
          {expanded ? (
            <textarea
              value={sample.excerpt}
              onChange={(e) => onExcerptChange(e.target.value)}
              className="w-full h-32 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 text-sm"
            />
          ) : (
            <p className="text-slate-200 text-sm whitespace-pre-wrap">{preview}</p>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 text-xs text-emerald-400 hover:text-emerald-300"
          >
            {expanded ? "Collapse" : "Edit / show more"}
          </button>
          {sample.source_location && (
            <a
              href={sample.source_location}
              target="_blank"
              rel="noreferrer"
              className="block mt-1 text-xs text-slate-500 hover:text-slate-300 truncate"
            >
              {sample.source_location}
            </a>
          )}
          {sample.why && <p className="text-slate-400 text-xs mt-1 italic">{sample.why}</p>}
        </div>
      </div>
    </div>
  );
}
