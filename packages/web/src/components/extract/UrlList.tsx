import type { ChangeEvent } from "react";

import { Button, Icon } from "../ui";

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
            className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus:border-indigo-500"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            aria-label={`Remove URL ${i + 1}`}
            className="text-slate-400 hover:text-rose-600 px-2"
          >
            <Icon.X size={15} />
          </button>
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={add} className="gap-1">
        <Icon.Plus size={14} />
        Add URL
      </Button>
    </div>
  );
}
