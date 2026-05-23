import type { Config } from "../../api/config";

interface ServerSectionProps {
  draft: Config;
}

export function ServerSection({ draft }: ServerSectionProps): JSX.Element {
  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-slate-200">Server</h2>
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-3">
          <span className="w-32 shrink-0 text-slate-400">Port</span>
          <span className="font-mono text-slate-200">{draft.server.port}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-32 shrink-0 text-slate-400">Open browser</span>
          <span className="text-slate-200">{draft.server.open_browser ? "Yes" : "No"}</span>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Edit <code className="text-slate-400">~/.myvoice/config.yaml</code> and restart the server
        to change these values.
      </p>
    </section>
  );
}
