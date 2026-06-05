import { cancelJob } from "../../api/jobs";
import { Button, Icon } from "../ui";

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
      <h2 className="text-base font-semibold text-slate-900">Analyzing</h2>
      <ol className="space-y-3">
        {STAGES.map((name) => {
          const s = stages[name] ?? { status: "pending" as const };
          return (
            <li key={name} className="flex items-start gap-3">
              <StageIcon status={s.status} />
              <div className="flex-1">
                <div className="text-slate-900 capitalize">{name}</div>
                {s.message && <div className="text-slate-400 text-xs">{s.message}</div>}
              </div>
            </li>
          );
        })}
      </ol>
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-3 text-sm">
          <div>{error.message}</div>
          {error.hint && <div className="text-rose-600/80 mt-1">{error.hint}</div>}
          <Button variant="secondary" size="sm" onClick={onBack} className="mt-2">
            Back to inputs
          </Button>
        </div>
      )}
      {!error && (
        <Button variant="ghost" size="sm" onClick={doCancel}>
          Cancel
        </Button>
      )}
    </section>
  );
}

function StageIcon({ status }: { status: StageState["status"] }): JSX.Element {
  if (status === "done")
    return <Icon.Check size={16} className="text-emerald-600 mt-0.5 shrink-0" />;
  if (status === "running")
    return <Icon.RefreshCw size={16} className="text-indigo-600 mt-0.5 shrink-0 animate-spin" />;
  if (status === "failed")
    return <Icon.AlertCircle size={16} className="text-rose-600 mt-0.5 shrink-0" />;
  return <Icon.ChevronRight size={16} className="text-slate-300 mt-0.5 shrink-0" />;
}
