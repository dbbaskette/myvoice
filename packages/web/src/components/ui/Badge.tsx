import type { HTMLAttributes } from "react";

import { cn } from "./cn";

type Variant = "neutral" | "success" | "danger" | "warning" | "accent";

const VARIANTS: Record<Variant, string> = {
  neutral: "bg-slate-100 text-slate-600",
  success: "bg-emerald-50 text-emerald-700",
  danger: "bg-rose-50 text-rose-700",
  warning: "bg-amber-50 text-amber-700",
  accent: "bg-indigo-50 text-indigo-700",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

export function Badge({ variant = "neutral", className, ...rest }: BadgeProps): JSX.Element {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full text-xs font-medium px-2 py-0.5",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    />
  );
}
