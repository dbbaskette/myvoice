import type { ReactNode } from "react";

import { Badge, Icon } from "../ui";

/** Read-only disclosure for rules inherited from the shared AI-tells layer. */
export function InheritedPanel({
  summary,
  children,
}: {
  summary: ReactNode;
  children: ReactNode;
}): JSX.Element {
  return (
    <details className="group rounded-lg border border-slate-200 bg-slate-50/70">
      <summary className="flex items-center gap-2 cursor-pointer select-none px-3 py-2 text-xs text-slate-600 list-none [&::-webkit-details-marker]:hidden">
        <Icon.Globe size={14} className="text-slate-400" />
        <span className="flex-1">{summary}</span>
        <Badge variant="neutral">Global</Badge>
        <Icon.ChevronDown
          size={14}
          className="text-slate-400 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="px-3 pb-3 pt-1 space-y-3">{children}</div>
    </details>
  );
}

/** Muted read-only chips for a list of shared terms. */
export function Chips({ items }: { items: string[] }): JSX.Element {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((w) => (
        <span
          key={w}
          className="inline-flex rounded-full bg-white border border-slate-200 px-2 py-0.5 text-xs text-slate-600"
        >
          {w}
        </span>
      ))}
    </div>
  );
}
