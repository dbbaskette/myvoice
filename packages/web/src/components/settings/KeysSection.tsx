import { useState } from "react";
import { ApiError } from "../../api/client";
import type { Config } from "../../api/config";
import { listModels } from "../../api/config";

interface KeysSectionProps {
  draft: Config;
  setDraft: (cfg: Config) => void;
}

type Provider = "anthropic" | "openai" | "google";

interface TestState {
  status: "idle" | "testing" | "ok" | "error";
  message: string;
}

const PROVIDERS: { key: Provider; label: string; placeholder: string }[] = [
  { key: "anthropic", label: "Anthropic", placeholder: "sk-ant-…" },
  { key: "openai", label: "OpenAI", placeholder: "sk-…" },
  { key: "google", label: "Google AI", placeholder: "AIza…" },
];

function ProviderRow({
  provider,
  apiKey,
  onKeyChange,
}: {
  provider: (typeof PROVIDERS)[number];
  apiKey: string;
  onKeyChange: (key: string) => void;
}): JSX.Element {
  const [test, setTest] = useState<TestState>({ status: "idle", message: "" });
  const inputId = `api-key-${provider.key}`;

  const handleTest = async () => {
    setTest({ status: "testing", message: "" });
    try {
      const models = await listModels(provider.key);
      setTest({
        status: "ok",
        message: `✓ ${models.length} model${models.length === 1 ? "" : "s"}`,
      });
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
      setTest({ status: "error", message: `✗ ${msg}` });
    }
  };

  return (
    <div className="flex items-center gap-3">
      <label htmlFor={inputId} className="w-24 shrink-0 text-sm text-slate-300">
        {provider.label}
      </label>
      <input
        id={inputId}
        type="password"
        className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100
          placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        placeholder={provider.placeholder}
        value={apiKey}
        onChange={(e) => {
          onKeyChange(e.target.value);
          setTest({ status: "idle", message: "" });
        }}
        autoComplete="off"
        spellCheck={false}
      />
      <button
        type="button"
        onClick={handleTest}
        disabled={test.status === "testing" || !apiKey}
        className="px-2.5 py-1.5 text-xs border border-slate-700 rounded text-slate-300
          hover:bg-slate-800 disabled:opacity-40 shrink-0"
      >
        {test.status === "testing" ? "Testing…" : "Test"}
      </button>
      {test.status !== "idle" && test.status !== "testing" && (
        <span
          className={`text-xs shrink-0 ${test.status === "ok" ? "text-emerald-400" : "text-red-400"}`}
        >
          {test.message}
        </span>
      )}
    </div>
  );
}

export function KeysSection({ draft, setDraft }: KeysSectionProps): JSX.Element {
  const updateKey = (provider: Provider, apiKey: string) => {
    setDraft({
      ...draft,
      providers: {
        ...draft.providers,
        [provider]: { ...draft.providers[provider], api_key: apiKey },
      },
    });
  };

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-slate-200">API keys</h2>
      <div className="space-y-3">
        {PROVIDERS.map((p) => (
          <ProviderRow
            key={p.key}
            provider={p}
            apiKey={draft.providers[p.key].api_key}
            onKeyChange={(key) => updateKey(p.key, key)}
          />
        ))}
      </div>
      <p className="text-xs text-slate-500">
        Keys are stored in <code className="text-slate-400">~/.myvoice/config.yaml</code> (chmod
        600). Existing keys appear masked — leave masked to keep the current value.
      </p>
    </section>
  );
}
