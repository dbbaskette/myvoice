import { useState } from "react";

import type { ProposedSample } from "../../../api/extract";
import { Card } from "../../ui";

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
    <Card className={`p-3 ${selected ? "border-indigo-300 bg-indigo-50/30" : ""}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Include sample ${sample.rank}`}
          className="mt-1 accent-indigo-600"
        />
        <div className="flex-1 min-w-0">
          {expanded ? (
            <textarea
              value={sample.excerpt}
              onChange={(e) => onExcerptChange(e.target.value)}
              className="w-full h-32 bg-white border border-slate-300 rounded-lg px-2 py-1 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus:border-indigo-500"
            />
          ) : (
            <p className="text-slate-900 text-sm whitespace-pre-wrap">{preview}</p>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 text-xs text-indigo-600 hover:text-indigo-500"
          >
            {expanded ? "Collapse" : "Edit / show more"}
          </button>
          {sample.source_location && (
            <a
              href={sample.source_location}
              target="_blank"
              rel="noreferrer"
              className="block mt-1 text-xs text-slate-400 hover:text-slate-600 truncate"
            >
              {sample.source_location}
            </a>
          )}
          {sample.why && <p className="text-slate-400 text-xs mt-1 italic">{sample.why}</p>}
        </div>
      </div>
    </Card>
  );
}
