import { useEffect, useState } from "react";

import { type Config, getConfig } from "../api/config";
import { startExtract } from "../api/extract";
import { Step1Inputs, type Step1State } from "../components/extract/Step1Inputs";

export function ExtractPage(): JSX.Element {
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<Step1State>({
    urls: [""],
    files: [],
    slug: "",
    name: "",
    author: "",
    provider: "anthropic",
    model: "",
  });

  useEffect(() => {
    getConfig()
      .then(setConfig)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <div className="p-8 text-red-400">Error: {error}</div>;
  if (!config) return <div className="p-8 text-slate-500">Loading…</div>;

  const onAnalyze = async (): Promise<void> => {
    try {
      const cleanUrls = state.urls.filter((u) => u.startsWith("http"));
      await startExtract({
        urls: cleanUrls,
        files: state.files,
        pack_meta: { slug: state.slug, name: state.name, author: state.author },
        provider: state.provider,
        model: state.model,
      });
      // Step 2/3 wiring lands in Task 7/8 — for now just alert and stay.
      alert("Extract started. Step 2 progress UI lands in Task 7.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-slate-100 mb-6">Extract from URLs</h1>
      <Step1Inputs state={state} config={config} onChange={setState} onAnalyze={onAnalyze} />
    </div>
  );
}
