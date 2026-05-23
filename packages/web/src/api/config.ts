import { apiFetch } from "./client";

export interface ProviderConfig {
  api_key: string;
  default_model: string | null;
}

export interface Config {
  version: number;
  server: { port: number; open_browser: boolean };
  ui: { default_pack: string | null; theme: "light" | "dark" | "system" };
  pack_paths: string[];
  providers: {
    anthropic: ProviderConfig;
    openai: ProviderConfig;
    google: ProviderConfig;
  };
  features: {
    default_compose_provider: string;
    default_extraction_provider: string;
  };
}

export interface ModelInfo {
  id: string;
  label: string;
  context_window: number;
  supports_streaming: boolean;
}

export async function getConfig(): Promise<Config> {
  return apiFetch<Config>("/api/config");
}

export async function putConfig(patch: Partial<Config> | Record<string, unknown>): Promise<Config> {
  return apiFetch<Config>("/api/config", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

export async function listModels(
  provider: "anthropic" | "openai" | "google",
): Promise<ModelInfo[]> {
  return apiFetch<ModelInfo[]>(`/api/providers/${provider}/models`);
}
