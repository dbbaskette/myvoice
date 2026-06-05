import { useState } from "react";
import type { ReactNode } from "react";
import type { LintHit } from "../../api/compose";
import { Button, Icon } from "../ui";
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
      <div className="px-3 py-1.5 text-xs text-slate-500 border-b border-slate-200 bg-white flex items-center justify-between font-medium">
        <span>Output</span>
        {output && !streaming && (
          <div className="flex items-center gap-1.5">
            <Button
              variant={diffOn ? "ghost" : "secondary"}
              size="sm"
              onClick={() => setDiffOn((d) => !d)}
              title="Toggle diff view"
              className={diffOn ? "bg-indigo-50 text-indigo-700 border-indigo-200" : ""}
            >
              Diff
            </Button>
            <Button variant="secondary" size="sm" onClick={handleCopy}>
              <Icon.Copy size={13} />
              Copy
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowSave(true)}
              disabled={!canSave}
            >
              <Icon.Save size={13} />
              Save as sample
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="m-3 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm">
          <p className="font-medium">{error.message}</p>
          {error.hint && <p className="text-xs mt-1 text-rose-600">{error.hint}</p>}
        </div>
      )}

      <div className="flex-1 overflow-auto bg-white">
        {output ? (
          diffOn && !streaming ? (
            <DiffView oldValue={draft} newValue={output} />
          ) : (
            <pre className="p-3 text-sm text-slate-800 font-mono leading-relaxed whitespace-pre-wrap break-words min-h-full output-pane">
              {streaming ? output : renderWithHighlights(output, hits)}
            </pre>
          )
        ) : !error ? (
          <div className="p-3 text-sm text-slate-400 italic">
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
