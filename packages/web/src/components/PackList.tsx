interface PackListProps {
  className?: string;
}

export function PackList({ className }: PackListProps): JSX.Element {
  // Real data wired up in P3-T6.
  return (
    <div className={className}>
      <p className="text-slate-500 text-xs px-2 py-1">Loading…</p>
    </div>
  );
}
