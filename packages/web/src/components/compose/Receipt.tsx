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
    <div className="px-4 py-1.5 border-t border-slate-800 bg-slate-950 text-xs text-slate-500 flex items-center gap-3 flex-wrap">
      <span className="text-slate-400 font-medium">{model}</span>
      {elapsedSeconds !== undefined && <span>{elapsedSeconds.toFixed(1)}s</span>}
      <span>
        {inputTokens.toLocaleString()} in / {outputTokens.toLocaleString()} out
      </span>
      <span>~${costUsd.toFixed(4)}</span>
    </div>
  );
}
