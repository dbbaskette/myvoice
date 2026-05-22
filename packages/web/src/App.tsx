import { useEffect, useState } from "react";

import { getHealth } from "./api/health";

export function App(): JSX.Element {
  const [version, setVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    getHealth({ signal: abort.signal })
      .then((h) => setVersion(h.version))
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-2">
      <h1 className="text-2xl font-semibold">myvoice</h1>
      {version && <p className="text-sm text-gray-500">backend v{version}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </main>
  );
}
