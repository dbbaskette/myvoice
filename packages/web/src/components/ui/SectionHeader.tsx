import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type AccentColor = "indigo" | "rose" | "amber" | "violet" | "sky" | "emerald" | "teal";

// Full class strings (no dynamic concatenation) so Tailwind keeps them.
const CHIP: Record<AccentColor, string> = {
  indigo: "bg-indigo-50 text-indigo-600",
  rose: "bg-rose-50 text-rose-600",
  amber: "bg-amber-50 text-amber-600",
  violet: "bg-violet-50 text-violet-600",
  sky: "bg-sky-50 text-sky-600",
  emerald: "bg-emerald-50 text-emerald-600",
  teal: "bg-teal-50 text-teal-600",
};

export interface SectionHeaderProps {
  icon: LucideIcon;
  color: AccentColor;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

export function SectionHeader({
  icon: IconCmp,
  color,
  title,
  description,
  actions,
}: SectionHeaderProps): JSX.Element {
  return (
    <div className="flex items-start gap-3 mb-4">
      <span
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${CHIP[color]}`}
      >
        <IconCmp size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
