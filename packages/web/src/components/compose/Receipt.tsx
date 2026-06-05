import { Badge } from "../ui";

export interface ReceiptData {
  model: string;
  provider?: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  finishReason: string;
  elapsedSeconds?: number;
}

interface ReceiptProps {
  receipt: ReceiptData;
}

export function Receipt({ receipt }: ReceiptProps): JSX.Element {
  const { model, inputTokens, outputTokens, costUsd, elapsedSeconds } = receipt;
  return (
    <div className="px-4 py-1.5 border-t border-slate-200 bg-white text-xs text-slate-500 flex items-center gap-3 flex-wrap">
      <span className="text-slate-700 font-medium">{model}</span>
      {elapsedSeconds !== undefined && (
        <Badge variant="neutral">{elapsedSeconds.toFixed(1)}s</Badge>
      )}
      <span>
        {inputTokens.toLocaleString()} in / {outputTokens.toLocaleString()} out
      </span>
      <Badge variant="neutral">~${costUsd.toFixed(4)}</Badge>
    </div>
  );
}
