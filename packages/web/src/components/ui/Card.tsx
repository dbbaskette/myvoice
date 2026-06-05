import type { HTMLAttributes } from "react";

import { cn } from "./cn";

/** White surface card. Add padding via className at the call site. */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return (
    <div
      className={cn("bg-white border border-slate-200 rounded-xl shadow-sm", className)}
      {...rest}
    />
  );
}
