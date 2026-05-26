/** Client-side mirror of llm/rates.yaml — used for the cost estimate.
 * Drift is acceptable since labels always say "approximate". Update on backend rate changes. */
export interface ModelRate {
  input_per_million_usd: number;
  output_per_million_usd: number;
  label: string;
}

export const RATES: Record<string, Record<string, ModelRate>> = {
  anthropic: {
    "claude-opus-4-7": {
      label: "Claude Opus 4.7",
      input_per_million_usd: 15.0,
      output_per_million_usd: 75.0,
    },
    "claude-sonnet-4-6": {
      label: "Claude Sonnet 4.6",
      input_per_million_usd: 3.0,
      output_per_million_usd: 15.0,
    },
    "claude-haiku-4-5-20251001": {
      label: "Claude Haiku 4.5",
      input_per_million_usd: 0.8,
      output_per_million_usd: 4.0,
    },
  },
  openai: {
    "gpt-5": { label: "GPT-5", input_per_million_usd: 5.0, output_per_million_usd: 15.0 },
    "gpt-5-mini": { label: "GPT-5 Mini", input_per_million_usd: 0.5, output_per_million_usd: 1.5 },
  },
  google: {
    "gemini-2.5-pro": {
      label: "Gemini 2.5 Pro",
      input_per_million_usd: 3.5,
      output_per_million_usd: 10.5,
    },
    "gemini-2.5-flash": {
      label: "Gemini 2.5 Flash",
      input_per_million_usd: 0.3,
      output_per_million_usd: 1.2,
    },
  },
};

export function estimateCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const entry = RATES[provider]?.[model];
  if (!entry) return 0;
  return (
    (inputTokens / 1_000_000) * entry.input_per_million_usd +
    (outputTokens / 1_000_000) * entry.output_per_million_usd
  );
}

/** Crude input-token estimator: chars / 4 (English). */
export function estimateInputTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
