import { useState } from "react";
import { ApiError } from "../../api/client";
import type { Config } from "../../api/config";
import { listModels } from "../../api/config";
import { Button, Card, Icon, Input } from "../ui";

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
        message: `${models.length} model${models.length === 1 ? "" : "s"}`,
      });
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
      setTest({ status: "error", message: msg });
    }
  };

  return (
    <div className="flex items-center gap-3">
      <label htmlFor={inputId} className="w-24 shrink-0 text-sm text-slate-600">
        {provider.label}
      </label>
      <Input
        id={inputId}
        type="password"
        className="flex-1"
        placeholder={provider.placeholder}
        value={apiKey}
        onChange={(e) => {
          onKeyChange(e.target.value);
          setTest({ status: "idle", message: "" });
        }}
        autoComplete="off"
        spellCheck={false}
      />
      <Button
        variant="secondary"
        size="sm"
        onClick={handleTest}
        disabled={test.status === "testing" || !apiKey}
        className="shrink-0"
      >
        {test.status === "testing" ? "Testing…" : "Test"}
      </Button>
      {test.status !== "idle" && test.status !== "testing" && (
        <span
          className={`text-xs shrink-0 flex items-center gap-1 ${test.status === "ok" ? "text-emerald-600" : "text-rose-600"}`}
        >
          {test.status === "ok" ? <Icon.Check size={12} /> : <Icon.X size={12} />}
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
    <Card className="p-5 md:p-6">
      <h2 className="text-sm font-semibold text-slate-900">API keys</h2>
      <p className="mt-1 text-sm text-slate-400 mb-4">
        Keys are stored in <code className="text-slate-500">~/.myvoice/config.yaml</code> (chmod
        600). Existing keys appear masked — leave masked to keep the current value.
      </p>
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
    </Card>
  );
}
