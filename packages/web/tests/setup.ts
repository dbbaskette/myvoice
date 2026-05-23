import "@testing-library/jest-dom/vitest";

// jsdom does not implement EventSource — stub it globally so any component
// that calls useGlobalEvents (which opens EventSource("/api/events")) doesn't throw.
class NoopEventSource {
  onmessage: null = null;
  onerror: null = null;
  close(): void {}
}
Object.defineProperty(window, "EventSource", {
  writable: true,
  configurable: true,
  value: NoopEventSource,
});

// jsdom does not implement window.matchMedia — stub it for tests that use useTheme
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
