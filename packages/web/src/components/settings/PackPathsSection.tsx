import { useState } from "react";
import type { Config } from "../../api/config";

interface PackPathsSectionProps {
  draft: Config;
  setDraft: (cfg: Config) => void;
}

export function PackPathsSection({ draft, setDraft }: PackPathsSectionProps): JSX.Element {
  const [newPath, setNewPath] = useState("");

  const setPaths = (paths: string[]) => setDraft({ ...draft, pack_paths: paths });

  const add = () => {
    const trimmed = newPath.trim();
    if (!trimmed) return;
    setPaths([...draft.pack_paths, trimmed]);
    setNewPath("");
  };

  const remove = (idx: number) => {
    setPaths(draft.pack_paths.filter((_, i) => i !== idx));
  };

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const paths = [...draft.pack_paths];
    [paths[idx - 1], paths[idx]] = [paths[idx], paths[idx - 1]];
    setPaths(paths);
  };

  const moveDown = (idx: number) => {
    if (idx === draft.pack_paths.length - 1) return;
    const paths = [...draft.pack_paths];
    [paths[idx], paths[idx + 1]] = [paths[idx + 1], paths[idx]];
    setPaths(paths);
  };

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-slate-200">Pack paths</h2>
      <div className="space-y-2">
        {draft.pack_paths.length === 0 && (
          <p className="text-sm text-slate-500">No pack paths configured.</p>
        )}
        {draft.pack_paths.map((path, idx) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: pack_paths is ordered; user reorders via ↑↓
          <div key={`${path}-${idx}`} className="flex items-center gap-2">
            <span className="flex-1 font-mono text-sm text-slate-300 bg-slate-800 border border-slate-700 rounded px-3 py-1.5 truncate">
              {path}
            </span>
            <button
              type="button"
              onClick={() => moveUp(idx)}
              disabled={idx === 0}
              className="px-2 py-1.5 text-xs border border-slate-700 rounded text-slate-400 hover:bg-slate-800 disabled:opacity-30"
              title="Move up"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => moveDown(idx)}
              disabled={idx === draft.pack_paths.length - 1}
              className="px-2 py-1.5 text-xs border border-slate-700 rounded text-slate-400 hover:bg-slate-800 disabled:opacity-30"
              title="Move down"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => remove(idx)}
              className="px-2 py-1.5 text-xs border border-red-900 rounded text-red-400 hover:bg-red-950"
              title="Remove"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100
            placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="/path/to/packs"
          value={newPath}
          onChange={(e) => setNewPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          spellCheck={false}
        />
        <button
          type="button"
          onClick={add}
          disabled={!newPath.trim()}
          className="px-3 py-1.5 text-sm border border-slate-700 rounded text-slate-300
            hover:bg-slate-800 disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </section>
  );
}
