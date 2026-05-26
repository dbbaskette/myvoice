import { estimateCost } from "../../api/rates";

interface CostEstimateProps {
  inputTextChars: number; // total chars of URLs (rough) + file sizes / encoding ratio
  provider: string;
  model: string;
}

export function CostEstimate({
  inputTextChars,
  provider,
  model,
}: CostEstimateProps): JSX.Element | null {
  if (inputTextChars === 0 || !provider || !model) return null;
  const inputTokens = Math.ceil(inputTextChars / 4);
  const outputTokens = 600;
  const cost = estimateCost(provider, model, inputTokens, outputTokens);
  return (
    <p className="text-slate-500 text-xs mt-2">
      Estimated: ~{inputTokens.toLocaleString()} input tokens → ~${cost.toFixed(4)} with {model}{" "}
      (approximate)
    </p>
  );
}
