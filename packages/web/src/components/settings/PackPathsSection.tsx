import { useState } from "react";
import type { Config } from "../../api/config";
import { Button, Card, Icon, Input } from "../ui";

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
    <Card className="p-5 md:p-6">
      <h2 className="text-sm font-semibold text-slate-900">Pack paths</h2>
      <p className="mt-1 text-sm text-slate-400 mb-4">
        Directories scanned for voice packs, in priority order.
      </p>
      <div className="space-y-2 mb-3">
        {draft.pack_paths.length === 0 && (
          <p className="text-sm text-slate-400">No pack paths configured.</p>
        )}
        {draft.pack_paths.map((path, idx) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: pack_paths is ordered; user reorders via ↑↓
          <div key={`${path}-${idx}`} className="flex items-center gap-2">
            <span className="flex-1 font-mono text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 truncate">
              {path}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => moveUp(idx)}
              disabled={idx === 0}
              title="Move up"
            >
              ↑
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => moveDown(idx)}
              disabled={idx === draft.pack_paths.length - 1}
              title="Move down"
            >
              ↓
            </Button>
            <Button variant="danger" size="sm" onClick={() => remove(idx)} title="Remove">
              <Icon.Trash size={14} />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          type="text"
          className="flex-1"
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
        <Button variant="secondary" size="sm" onClick={add} disabled={!newPath.trim()}>
          <Icon.Plus size={14} />
          Add
        </Button>
      </div>
    </Card>
  );
}
