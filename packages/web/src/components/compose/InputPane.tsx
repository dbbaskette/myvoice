import type { LintHit } from "../../api/compose";

interface InputPaneProps {
  draft: string;
  setDraft: (text: string) => void;
  hits: LintHit[];
}

const KIND_LABELS: Record<LintHit["kind"], string> = {
  banished_word: "Banished word",
  banished_phrase: "Banished phrase",
  rule: "Style rule",
  positive_hit: "Positive pattern",
};

const KIND_COLORS: Record<LintHit["kind"], string> = {
  banished_word: "text-orange-600",
  banished_phrase: "text-pink-600",
  rule: "text-violet-600",
  positive_hit: "text-emerald-600",
};

export function InputPane({ draft, setDraft, hits }: InputPaneProps): JSX.Element {
  return (
    <div className="flex-1 flex flex-col min-w-0 border-r border-slate-200">
      <div className="px-3 py-1.5 text-xs text-slate-500 border-b border-slate-200 bg-white font-medium">
        Input
      </div>
      <textarea
        className="flex-1 w-full resize-none bg-white text-slate-900 text-sm p-3 focus:outline-none
          font-mono leading-relaxed placeholder:text-slate-400"
        placeholder="Paste your draft here…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck={false}
      />
      {hits.length > 0 && (
        <div className="border-t border-slate-200 px-3 py-2 max-h-48 overflow-y-auto bg-slate-50">
          <p className="text-xs text-slate-500 mb-1.5">
            {hits.length} issue{hits.length !== 1 ? "s" : ""} found
          </p>
          <ul className="space-y-1">
            {hits.map((h) => (
              <li
                key={`${h.start}-${h.end}-${h.rule_id}`}
                className="flex gap-2 items-start text-xs"
              >
                <span className={`shrink-0 font-medium ${KIND_COLORS[h.kind]}`}>
                  {KIND_LABELS[h.kind]}
                </span>
                <span className="text-slate-600">{h.message}</span>
                <span className="shrink-0 text-slate-400 ml-auto">@{h.start}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
