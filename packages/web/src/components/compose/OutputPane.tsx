import { useState } from "react";
import type { ReactNode } from "react";
import type { LintHit } from "../../api/compose";
import { DiffView } from "./DiffView";
import { SaveSampleDialog } from "./SaveSampleDialog";

interface OutputPaneProps {
  output: string;
  hits: LintHit[];
  streaming: boolean;
  error: { message: string; hint?: string } | null;
  packSlug: string;
  draft: string;
  onToast: (msg: string) => void;
}

function renderWithHighlights(text: string, hits: LintHit[]): ReactNode {
  if (hits.length === 0) return text;
  // Sort by start; resolve overlaps by preferring earlier hit
  const sorted = [...hits].sort((a, b) => a.start - b.start);
  const out: ReactNode[] = [];
  let cursor = 0;
  for (const hit of sorted) {
    if (hit.start < cursor) continue; // skip overlap
    if (hit.start > cursor) out.push(text.slice(cursor, hit.start));
    out.push(
      <span key={`${hit.start}-${hit.end}`} className={`lint-${hit.kind}`} title={hit.message}>
        {text.slice(hit.start, hit.end)}
      </span>,
    );
    cursor = hit.end;
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

export function OutputPane({
  output,
  hits,
  streaming,
  error,
  packSlug,
  draft,
  onToast,
}: OutputPaneProps): JSX.Element {
  const [diffOn, setDiffOn] = useState(false);
  const [showSave, setShowSave] = useState(false);

  const handleCopy = () => {
    if (output) {
      navigator.clipboard.writeText(output).catch(() => {});
    }
  };

  const handleSaved = (id: string) => {
    setShowSave(false);
    onToast(`Saved as sample ${id}.`);
  };

  const canSave = output.length > 0 && !streaming;

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="px-3 py-1.5 text-xs text-slate-500 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
        <span>Output</span>
        {output && !streaming && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setDiffOn((d) => !d)}
              className={`px-2 py-0.5 text-xs border rounded ${
                diffOn
                  ? "border-emerald-600 text-emerald-400 bg-emerald-950"
                  : "border-slate-700 text-slate-300 hover:bg-slate-800"
              }`}
              title="Toggle diff view"
            >
              Diff
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="px-2 py-0.5 text-xs border border-slate-700 rounded text-slate-300
                hover:bg-slate-800"
            >
              Copy
            </button>
            <button
              type="button"
              onClick={() => setShowSave(true)}
              disabled={!canSave}
              className="px-2 py-0.5 text-xs border border-slate-700 rounded text-slate-300
                hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save as sample
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="m-3 p-3 bg-red-950 border border-red-800 rounded text-red-300 text-sm">
          <p className="font-medium">{error.message}</p>
          {error.hint && <p className="text-xs mt-1 text-red-400">{error.hint}</p>}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {output ? (
          diffOn && !streaming ? (
            <DiffView oldValue={draft} newValue={output} />
          ) : (
            <pre className="p-3 text-sm text-slate-100 font-mono leading-relaxed whitespace-pre-wrap break-words min-h-full output-pane">
              {streaming ? output : renderWithHighlights(output, hits)}
            </pre>
          )
        ) : !error ? (
          <div className="p-3 text-sm text-slate-600 italic">
            {streaming ? "Streaming…" : "Rewritten output will appear here."}
          </div>
        ) : null}
      </div>

      {showSave && (
        <SaveSampleDialog
          packSlug={packSlug}
          initialExcerpt={output}
          onSaved={handleSaved}
          onClose={() => setShowSave(false)}
        />
      )}
    </div>
  );
}
