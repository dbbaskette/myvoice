import { useEffect, useState } from "react";

import { getHealth } from "./api/health";

export function App(): JSX.Element {
  const [version, setVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getHealth()
      .then((h) => setVersion(h.version))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-2">
      <h1 className="text-2xl font-semibold">myvoice</h1>
      {version && <p className="text-sm text-gray-500">backend v{version}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </main>
  );
}
