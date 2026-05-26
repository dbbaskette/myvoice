import type { ChangeEvent } from "react";

interface UrlListProps {
  urls: string[];
  onChange: (next: string[]) => void;
}

export function UrlList({ urls, onChange }: UrlListProps): JSX.Element {
  const update = (i: number, value: string): void => {
    onChange(urls.map((u, idx) => (idx === i ? value : u)));
  };
  const remove = (i: number): void => onChange(urls.filter((_, idx) => idx !== i));
  const add = (): void => onChange([...urls, ""]);

  return (
    <div className="space-y-2">
      {urls.map((url, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: URL list entries are positional and have no stable natural key
        <div key={i} className="flex items-center gap-2">
          <input
            type="url"
            value={url}
            onChange={(e: ChangeEvent<HTMLInputElement>) => update(i, e.target.value)}
            placeholder="https://example.com/post"
            aria-label={`URL ${i + 1}`}
            className="flex-1 bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            aria-label={`Remove URL ${i + 1}`}
            className="text-slate-500 hover:text-red-400 px-2"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="text-sm text-emerald-400 hover:text-emerald-300"
      >
        + Add URL
      </button>
    </div>
  );
}
