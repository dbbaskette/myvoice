interface StyleGuideReviewProps {
  markdown: string;
  onChange: (next: string) => void;
}

export function StyleGuideReview({ markdown, onChange }: StyleGuideReviewProps): JSX.Element {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-100">Style guide draft</h2>
      <p className="text-slate-500 text-xs">Appended to the pack's style-guide.md after Save.</p>
      <textarea
        value={markdown}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-64 bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 font-mono text-sm"
        aria-label="Style guide markdown"
      />
    </section>
  );
}
