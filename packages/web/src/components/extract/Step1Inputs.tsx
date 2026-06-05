import { type ChangeEvent, type ReactNode, useEffect, useMemo, useState } from "react";

import { type Config, type ModelInfo, listModels } from "../../api/config";
import type { UploadFile } from "../../api/extract";
import { Button } from "../ui";
import { CostEstimate } from "./CostEstimate";
import { FileDropzone } from "./FileDropzone";
import { UrlList } from "./UrlList";

export const SLUG_PATTERN = /^[a-z][a-z0-9\-_]*$/;

export interface Step1State {
  urls: string[];
  files: UploadFile[];
  slug: string;
  name: string;
  author: string;
  provider: "anthropic" | "openai" | "google";
  model: string;
}

interface Step1InputsProps {
  state: Step1State;
  config: Config;
  onChange: (next: Step1State) => void;
  onAnalyze: () => void;
}

export function Step1Inputs({ state, config, onChange, onAnalyze }: Step1InputsProps): JSX.Element {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const set = <K extends keyof Step1State>(k: K, v: Step1State[K]): void =>
    onChange({ ...state, [k]: v });

  // Load models when provider changes
  useEffect(() => {
    if (!state.provider) return;
    const provCfg = config.providers[state.provider];
    if (!provCfg || !provCfg.api_key) {
      setModels([]);
      return;
    }
    let cancelled = false;
    listModels(state.provider)
      .then((m) => {
        if (!cancelled) setModels(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [state.provider, config.providers]);

  // Auto-pick first model when models load
  // biome-ignore lint/correctness/useExhaustiveDependencies: `set` is a stable inline closure; adding it would cause infinite loops
  useEffect(() => {
    if (!state.model && models.length > 0) {
      set("model", models[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, state.model]);

  // Auto-derive slug from name
  const handleName = (e: ChangeEvent<HTMLInputElement>): void => {
    const name = e.target.value;
    const next: Step1State = { ...state, name };
    if (!state.slug || state.slug === slugify(state.name)) {
      next.slug = slugify(name);
    }
    onChange(next);
  };

  // Crude char count for cost estimate: each URL contributes ~12000 chars (guess), each file contributes its base64-decoded size
  const inputChars = useMemo(() => {
    const fromUrls = state.urls.filter((u) => u.length > 0).length * 12_000;
    const fromFiles = state.files.reduce((sum, f) => sum + (f.content_b64.length * 3) / 4, 0);
    return Math.round(fromUrls + fromFiles);
  }, [state.urls, state.files]);

  const slugValid = SLUG_PATTERN.test(state.slug);
  const canAnalyze =
    (state.urls.some((u) => u.startsWith("http")) || state.files.length > 0) &&
    slugValid &&
    state.name.trim() &&
    state.author.trim() &&
    state.model;

  const providers: Array<"anthropic" | "openai" | "google"> = ["anthropic", "openai", "google"];

  return (
    <section className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-2">URLs</h2>
        <UrlList urls={state.urls} onChange={(v) => set("urls", v)} />
      </div>
      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-2">Files</h2>
        <FileDropzone files={state.files} onChange={(v) => set("files", v)} />
      </div>
      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-2">Pack details</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Slug"
            id="ex-slug"
            error={!slugValid && state.slug ? "Must match ^[a-z][a-z0-9-_]*$" : undefined}
          >
            <input
              id="ex-slug"
              type="text"
              value={state.slug}
              onChange={(e) => set("slug", e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus:border-indigo-500"
            />
          </Field>
          <Field label="Name" id="ex-name">
            <input
              id="ex-name"
              type="text"
              value={state.name}
              onChange={handleName}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus:border-indigo-500"
            />
          </Field>
          <Field label="Author" id="ex-author">
            <input
              id="ex-author"
              type="text"
              value={state.author}
              onChange={(e) => set("author", e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus:border-indigo-500"
            />
          </Field>
        </div>
      </div>
      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-2">LLM</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Provider" id="ex-provider">
            <select
              id="ex-provider"
              value={state.provider}
              onChange={(e) => set("provider", e.target.value as Step1State["provider"])}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus:border-indigo-500"
            >
              {providers.map((p) => {
                const has = !!config.providers[p].api_key;
                return (
                  <option key={p} value={p} disabled={!has}>
                    {p}
                    {has ? "" : " (no API key)"}
                  </option>
                );
              })}
            </select>
          </Field>
          <Field label="Model" id="ex-model">
            <select
              id="ex-model"
              value={state.model}
              onChange={(e) => set("model", e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus:border-indigo-500"
            >
              {models.length === 0 && <option value="">No models</option>}
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <CostEstimate inputTextChars={inputChars} provider={state.provider} model={state.model} />
      </div>
      <div className="flex justify-end">
        <Button onClick={onAnalyze} disabled={!canAnalyze}>
          Analyze →
        </Button>
      </div>
    </section>
  );
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^[^a-z]/, "")
    .replace(/-+$/, "");
}

interface FieldProps {
  label: string;
  id: string;
  error?: string;
  children: ReactNode;
}
function Field({ label, id, error, children }: FieldProps): JSX.Element {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1">
        {label}
      </label>
      {children}
      {error && <p className="text-rose-600 text-xs mt-1">{error}</p>}
    </div>
  );
}
