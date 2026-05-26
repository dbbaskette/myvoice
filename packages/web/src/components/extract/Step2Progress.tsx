import { cancelJob } from "../../api/jobs";

interface StageState {
  status: "pending" | "running" | "done" | "failed";
  message?: string;
}

interface Step2ProgressProps {
  stages: Record<string, StageState>;
  jobId: string;
  error: { message: string; hint?: string } | null;
  onCancel: () => void;
  onBack: () => void;
}

const STAGES = ["fetching", "cleaning", "analyzing", "proposing"] as const;

export function Step2Progress({
  stages,
  jobId,
  error,
  onCancel,
  onBack,
}: Step2ProgressProps): JSX.Element {
  const doCancel = async (): Promise<void> => {
    try {
      await cancelJob(jobId);
    } catch {
      // ignore cancel errors
    }
    onCancel();
  };

  return (
    <section className="space-y-6 max-w-2xl">
      <h2 className="text-base font-semibold text-slate-100">Analyzing</h2>
      <ol className="space-y-3">
        {STAGES.map((name) => {
          const s = stages[name] ?? { status: "pending" as const };
          return (
            <li key={name} className="flex items-start gap-3">
              <Icon status={s.status} />
              <div className="flex-1">
                <div className="text-slate-100 capitalize">{name}</div>
                {s.message && <div className="text-slate-400 text-xs">{s.message}</div>}
              </div>
            </li>
          );
        })}
      </ol>
      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-200 rounded p-3 text-sm">
          <div>{error.message}</div>
          {error.hint && <div className="text-red-300/80 mt-1">{error.hint}</div>}
          <button
            type="button"
            onClick={onBack}
            className="mt-2 px-3 py-1.5 text-sm border border-red-700 text-red-200 rounded hover:bg-red-900/30"
          >
            Back to inputs
          </button>
        </div>
      )}
      {!error && (
        <button
          type="button"
          onClick={doCancel}
          className="px-3 py-1.5 text-sm border border-slate-700 text-slate-300 rounded hover:bg-slate-800"
        >
          Cancel
        </button>
      )}
    </section>
  );
}

function Icon({ status }: { status: StageState["status"] }): JSX.Element {
  if (status === "done") return <span className="text-emerald-400">✓</span>;
  if (status === "running") return <span className="text-amber-400 animate-pulse">●</span>;
  if (status === "failed") return <span className="text-red-400">✗</span>;
  return <span className="text-slate-600">○</span>;
}
