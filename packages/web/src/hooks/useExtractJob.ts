import { useEffect } from "react";

import type { PackProposal } from "../api/extract";

export interface ExtractJobHandlers {
  onStage: (stage: string, message: string, progress: number) => void;
  onComplete: (proposal: PackProposal) => void;
  onError: (code: string, message: string, hint?: string) => void;
}

export function useExtractJob(jobId: string | null, handlers: ExtractJobHandlers): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: handlers are wrapped in useCallback in the caller; re-subscribing on every render would thrash the EventSource
  useEffect(() => {
    if (!jobId) return;
    const es = new EventSource(`/api/jobs/${jobId}/events`);
    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data) as { type: string } & Record<string, unknown>;
        if (evt.type === "stage") {
          handlers.onStage(
            String(evt.name ?? ""),
            String(evt.message ?? ""),
            typeof evt.progress === "number" ? evt.progress : 0,
          );
        } else if (evt.type === "complete") {
          handlers.onComplete(evt.result as PackProposal);
          es.close();
        } else if (evt.type === "error") {
          handlers.onError(
            String(evt.code ?? "error"),
            String(evt.message ?? ""),
            evt.hint ? String(evt.hint) : undefined,
          );
          es.close();
        }
      } catch {
        // ignore malformed events
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [jobId]);
}
