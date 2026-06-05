interface PersonaReviewProps {
  identity: string;
  oneLine: string;
  onChange: (next: { identity: string; oneLine: string }) => void;
}

export function PersonaReview({ identity, oneLine, onChange }: PersonaReviewProps): JSX.Element {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">Persona</h2>
      <div>
        <label htmlFor="pr-id" className="block text-sm font-medium text-slate-700 mb-1">
          Identity
        </label>
        <input
          id="pr-id"
          type="text"
          value={identity}
          onChange={(e) => onChange({ identity: e.target.value, oneLine })}
          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus:border-indigo-500"
        />
      </div>
      <div>
        <label htmlFor="pr-ol" className="block text-sm font-medium text-slate-700 mb-1">
          One line
        </label>
        <input
          id="pr-ol"
          type="text"
          value={oneLine}
          onChange={(e) => onChange({ identity, oneLine: e.target.value })}
          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus:border-indigo-500"
        />
      </div>
    </section>
  );
}
