import { useEffect } from "react";

export interface GlobalEvent {
  type: "pack:created" | "pack:updated" | "pack:deleted" | "pack:invalid" | "config:updated";
  slug?: string;
  [key: string]: unknown;
}

export function useGlobalEvents(onEvent: (evt: GlobalEvent) => void): void {
  useEffect(() => {
    const es = new EventSource("/api/events");
    es.onmessage = (e) => {
      try {
        onEvent(JSON.parse(e.data) as GlobalEvent);
      } catch {
        // ignore malformed
      }
    };
    es.onerror = () => {
      es.close();
    };
    return () => es.close();
  }, [onEvent]);
}
