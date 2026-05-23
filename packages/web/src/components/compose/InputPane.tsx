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
  banished_word: "text-orange-400",
  banished_phrase: "text-pink-400",
  rule: "text-violet-400",
  positive_hit: "text-emerald-400",
};

export function InputPane({ draft, setDraft, hits }: InputPaneProps): JSX.Element {
  return (
    <div className="flex-1 flex flex-col min-w-0 border-r border-slate-800">
      <div className="px-3 py-1.5 text-xs text-slate-500 border-b border-slate-800 bg-slate-950">
        Input
      </div>
      <textarea
        className="flex-1 w-full resize-none bg-slate-900 text-slate-100 text-sm p-3 focus:outline-none
          font-mono leading-relaxed"
        placeholder="Paste your draft here…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck={false}
      />
      {hits.length > 0 && (
        <div className="border-t border-slate-800 px-3 py-2 max-h-48 overflow-y-auto bg-slate-950">
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
                <span className="text-slate-400">{h.message}</span>
                <span className="shrink-0 text-slate-600 ml-auto">@{h.start}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
