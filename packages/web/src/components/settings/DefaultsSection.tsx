import { useEffect, useState } from "react";
import type { Config } from "../../api/config";
import { listPacks } from "../../api/packs";
import { Card } from "../ui";

interface DefaultsSectionProps {
  draft: Config;
  setDraft: (cfg: Config) => void;
}

type ProviderName = "anthropic" | "openai" | "google";

const PROVIDER_LABELS: Record<ProviderName, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google AI",
};

const ALL_PROVIDERS: ProviderName[] = ["anthropic", "openai", "google"];

const selectClass =
  "flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus:border-indigo-500";

export function DefaultsSection({ draft, setDraft }: DefaultsSectionProps): JSX.Element {
  const [packSlugs, setPackSlugs] = useState<string[]>([]);

  useEffect(() => {
    listPacks()
      .then((packs) => setPackSlugs(packs.map((p) => p.slug)))
      .catch(() => {});
  }, []);

  // Only enable providers that have a non-empty API key
  const enabledProviders = ALL_PROVIDERS.filter(
    (p) => draft.providers[p].api_key && draft.providers[p].api_key !== "sk-ant-***",
  );

  const setDefaultPack = (slug: string) => {
    setDraft({ ...draft, ui: { ...draft.ui, default_pack: slug || null } });
  };

  const setComposeProvider = (provider: string) => {
    setDraft({
      ...draft,
      features: { ...draft.features, default_compose_provider: provider },
    });
  };

  const setExtractionProvider = (provider: string) => {
    setDraft({
      ...draft,
      features: { ...draft.features, default_extraction_provider: provider },
    });
  };

  return (
    <Card className="p-5 md:p-6">
      <h2 className="text-sm font-semibold text-slate-900">Defaults</h2>
      <p className="mt-1 text-sm text-slate-400 mb-4">
        {enabledProviders.length === 0
          ? "Add API keys above to enable provider selection."
          : "Choose which provider and pack to use by default."}
      </p>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <label htmlFor="default-pack" className="w-48 shrink-0 text-sm text-slate-600">
            Default pack
          </label>
          <select
            id="default-pack"
            className={selectClass}
            value={draft.ui.default_pack ?? ""}
            onChange={(e) => setDefaultPack(e.target.value)}
          >
            <option value="">— none —</option>
            {packSlugs.map((slug) => (
              <option key={slug} value={slug}>
                {slug}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="compose-provider" className="w-48 shrink-0 text-sm text-slate-600">
            Compose provider
          </label>
          <select
            id="compose-provider"
            className={selectClass}
            value={draft.features.default_compose_provider}
            onChange={(e) => setComposeProvider(e.target.value)}
          >
            {enabledProviders.length === 0 && (
              <option value={draft.features.default_compose_provider}>
                {PROVIDER_LABELS[draft.features.default_compose_provider as ProviderName] ??
                  draft.features.default_compose_provider}
              </option>
            )}
            {enabledProviders.map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABELS[p]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="extraction-provider" className="w-48 shrink-0 text-sm text-slate-600">
            Extraction provider
          </label>
          <select
            id="extraction-provider"
            className={selectClass}
            value={draft.features.default_extraction_provider}
            onChange={(e) => setExtractionProvider(e.target.value)}
          >
            {enabledProviders.length === 0 && (
              <option value={draft.features.default_extraction_provider}>
                {PROVIDER_LABELS[draft.features.default_extraction_provider as ProviderName] ??
                  draft.features.default_extraction_provider}
              </option>
            )}
            {enabledProviders.map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Card>
  );
}
