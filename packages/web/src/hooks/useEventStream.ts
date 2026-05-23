import { useEffect } from "react";

export interface JobEvent {
  type: "stage" | "token" | "complete" | "error";
  [key: string]: unknown;
}

export function useJobEventStream(jobId: string | null, onEvent: (evt: JobEvent) => void): void {
  useEffect(() => {
    if (!jobId) return;
    const es = new EventSource(`/api/jobs/${jobId}/events`);
    es.onmessage = (e) => {
      try {
        onEvent(JSON.parse(e.data as string) as JobEvent);
      } catch {
        // ignore malformed events
      }
    };
    es.onerror = () => {
      es.close();
    };
    return () => es.close();
  }, [jobId, onEvent]);
}
