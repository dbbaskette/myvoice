import { useEffect, useRef, useState } from "react";
import type { Config, ModelInfo } from "../../api/config";
import { getConfig, listModels } from "../../api/config";
import type { PackSummary } from "../../api/packs";
import { Button, Icon } from "../ui";
import { ViewPromptModal } from "./ViewPromptModal";

export interface ComposeControls {
  pack: string;
  format: string | null;
  samples: string[];
  provider: string;
  model: string;
}

interface ControlsBarProps {
  controls: ComposeControls;
  setControls: (c: ComposeControls) => void;
  packs: PackSummary[];
  draft: string;
  onRewrite: () => void;
  running: boolean;
}

type Provider = "anthropic" | "openai" | "google";

const PROVIDER_LABELS: Record<Provider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
};

export function ControlsBar({
  controls,
  setControls,
  packs,
  draft,
  onRewrite,
  running,
}: ControlsBarProps): JSX.Element {
  const [config, setConfig] = useState<Config | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  // Use a ref to avoid re-running config load when controls changes
  const initializedRef = useRef(false);
  const controlsRef = useRef(controls);
  controlsRef.current = controls;
  const setControlsRef = useRef(setControls);
  setControlsRef.current = setControls;

  // Load config once on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    getConfig()
      .then((c) => {
        setConfig(c);
        const cur = controlsRef.current;
        const defaultProvider = c.features.default_compose_provider as Provider;
        if (cur.provider === "anthropic" && defaultProvider !== cur.provider) {
          setControlsRef.current({ ...cur, provider: defaultProvider });
        }
      })
      .catch(() => {});
  }, []);

  // Load models when provider or config changes
  const provider = controls.provider as Provider;
  useEffect(() => {
    if (!config) return;
    const apiKey = config.providers[provider]?.api_key;
    if (!apiKey) {
      setModels([]);
      return;
    }
    setLoadingModels(true);
    const cur = controlsRef.current;
    listModels(provider)
      .then((ms) => {
        setModels(ms);
        const defaultModel = config.providers[provider]?.default_model;
        const first = ms[0]?.id ?? "";
        const model = defaultModel && ms.some((m) => m.id === defaultModel) ? defaultModel : first;
        setControlsRef.current({ ...cur, model });
      })
      .catch(() => {
        setModels([]);
      })
      .finally(() => setLoadingModels(false));
  }, [provider, config]);

  // Compute available providers (those with non-empty keys)
  const availableProviders: Provider[] = config
    ? (["anthropic", "openai", "google"] as Provider[]).filter((p) => config.providers[p]?.api_key)
    : [];

  const canRewrite = !running && controls.pack && controls.model;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-200 bg-white flex-wrap">
      {/* Pack selector */}
      <label className="flex items-center gap-1.5 text-xs text-slate-600">
        Pack
        <select
          className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-sm text-slate-900
            focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          value={controls.pack}
          onChange={(e) => setControls({ ...controls, pack: e.target.value })}
        >
          {packs.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <div className="w-px h-5 bg-slate-200" />

      {/* Provider selector */}
      <label className="flex items-center gap-1.5 text-xs text-slate-600">
        Provider
        <select
          className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-sm text-slate-900
            focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          value={controls.provider}
          onChange={(e) => setControls({ ...controls, provider: e.target.value, model: "" })}
        >
          {availableProviders.length === 0 ? (
            <option value="anthropic">Anthropic (no key)</option>
          ) : (
            availableProviders.map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABELS[p]}
              </option>
            ))
          )}
        </select>
      </label>

      {/* Model selector */}
      <label className="flex items-center gap-1.5 text-xs text-slate-600">
        Model
        <select
          className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-sm text-slate-900
            focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-w-[180px]"
          value={controls.model}
          onChange={(e) => setControls({ ...controls, model: e.target.value })}
          disabled={loadingModels || models.length === 0}
        >
          {loadingModels ? (
            <option value="">Loading…</option>
          ) : models.length === 0 ? (
            <option value="">No models (check API key)</option>
          ) : (
            models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))
          )}
        </select>
      </label>

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowPrompt(true)}
          disabled={!controls.pack}
        >
          <Icon.Eye size={14} />
          View prompt
        </Button>
        <Button variant="primary" size="sm" onClick={onRewrite} disabled={!canRewrite}>
          <Icon.RefreshCw size={14} />
          {running ? "Rewriting…" : "Rewrite"}
        </Button>
      </div>

      {showPrompt && (
        <ViewPromptModal
          pack={controls.pack}
          format={controls.format ?? undefined}
          samples={controls.samples}
          draft={draft}
          onClose={() => setShowPrompt(false)}
        />
      )}
    </div>
  );
}
