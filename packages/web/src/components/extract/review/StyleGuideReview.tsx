interface StyleGuideReviewProps {
  markdown: string;
  onChange: (next: string) => void;
}

export function StyleGuideReview({ markdown, onChange }: StyleGuideReviewProps): JSX.Element {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">Style guide draft</h2>
      <p className="text-slate-400 text-xs">Appended to the pack's style-guide.md after Save.</p>
      <textarea
        value={markdown}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-64 bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus:border-indigo-500"
        aria-label="Style guide markdown"
      />
    </section>
  );
}
