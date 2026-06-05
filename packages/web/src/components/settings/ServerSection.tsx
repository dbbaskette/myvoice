import type { Config } from "../../api/config";
import { Card } from "../ui";

interface ServerSectionProps {
  draft: Config;
}

export function ServerSection({ draft }: ServerSectionProps): JSX.Element {
  return (
    <Card className="p-5 md:p-6">
      <h2 className="text-sm font-semibold text-slate-900">Server</h2>
      <p className="mt-1 text-sm text-slate-400 mb-4">
        Edit <code className="text-slate-500">~/.myvoice/config.yaml</code> and restart the server
        to change these values.
      </p>
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-3">
          <span className="w-32 shrink-0 text-slate-400">Port</span>
          <span className="font-mono text-slate-900">{draft.server.port}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-32 shrink-0 text-slate-400">Open browser</span>
          <span className="text-slate-900">{draft.server.open_browser ? "Yes" : "No"}</span>
        </div>
      </div>
    </Card>
  );
}
