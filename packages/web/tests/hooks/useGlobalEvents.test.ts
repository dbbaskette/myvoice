import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useGlobalEvents } from "../../src/hooks/useGlobalEvents";

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

describe("useGlobalEvents", () => {
  it("opens an EventSource and dispatches parsed events", () => {
    const onEvent = vi.fn();
    renderHook(() => useGlobalEvents(onEvent));
    expect(FakeEventSource.instances).toHaveLength(1);
    const es = FakeEventSource.instances[0];
    expect(es.url).toBe("/api/events");
    es.emit({ type: "pack:created", slug: "alice" });
    expect(onEvent).toHaveBeenCalledWith({ type: "pack:created", slug: "alice" });
  });

  it("closes the EventSource on unmount", () => {
    const { unmount } = renderHook(() => useGlobalEvents(() => {}));
    const es = FakeEventSource.instances[0];
    expect(es.closed).toBe(false);
    unmount();
    expect(es.closed).toBe(true);
  });

  it("ignores malformed messages", () => {
    const onEvent = vi.fn();
    renderHook(() => useGlobalEvents(onEvent));
    const es = FakeEventSource.instances[0];
    es.onmessage?.(new MessageEvent("message", { data: "not json" }));
    expect(onEvent).not.toHaveBeenCalled();
  });
});
