import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useExtractJob } from "../../src/hooks/useExtractJob";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  closed = false;
  url: string;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  close(): void {
    this.closed = true;
  }
  emit(data: unknown): void {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(data) }));
  }
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useExtractJob", () => {
  it("dispatches stage, complete, and closes EventSource on complete", () => {
    const handlers = { onStage: vi.fn(), onComplete: vi.fn(), onError: vi.fn() };
    renderHook(() => useExtractJob("job-1", handlers));
    const es = FakeEventSource.instances[0];
    es.emit({ type: "stage", name: "fetching", message: "x", progress: 0.05 });
    expect(handlers.onStage).toHaveBeenCalledWith("fetching", "x", 0.05);
    es.emit({ type: "complete", result: { analysis: { persona_identity: "p" } } });
    expect(handlers.onComplete).toHaveBeenCalled();
    expect(es.closed).toBe(true);
  });

  it("does nothing when jobId is null", () => {
    renderHook(() =>
      useExtractJob(null, { onStage: vi.fn(), onComplete: vi.fn(), onError: vi.fn() }),
    );
    expect(FakeEventSource.instances).toHaveLength(0);
  });
});
