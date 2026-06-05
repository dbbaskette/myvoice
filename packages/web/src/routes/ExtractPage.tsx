import { useCallback, useEffect, useState } from "react";

import { type Config, getConfig } from "../api/config";
import { type PackProposal, startExtract } from "../api/extract";
import { Step1Inputs, type Step1State } from "../components/extract/Step1Inputs";
import { Step2Progress } from "../components/extract/Step2Progress";
import { Step3Review } from "../components/extract/Step3Review";
import { useExtractJob } from "../hooks/useExtractJob";

type Step = 1 | 2 | 3;

interface StageState {
  status: "pending" | "running" | "done" | "failed";
  message?: string;
}

const STAGE_ORDER = ["fetching", "cleaning", "analyzing", "proposing"] as const;

export function ExtractPage(): JSX.Element {
  const [config, setConfig] = useState<Config | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [state, setState] = useState<Step1State>({
    urls: [""],
    files: [],
    slug: "",
    name: "",
    author: "",
    provider: "anthropic",
    model: "",
  });
  const [jobId, setJobId] = useState<string | null>(null);
  const [stages, setStages] = useState<Record<string, StageState>>({});
  const [proposal, setProposal] = useState<PackProposal | null>(null);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);

  useEffect(() => {
    getConfig()
      .then(setConfig)
      .catch((e: Error) => setConfigError(e.message));
  }, []);

  const onStage = useCallback((name: string, message: string, _progress: number) => {
    setStages((prev) => {
      const next = { ...prev, [name]: { status: "running" as const, message } };
      // Mark all prior stages as done when a later stage starts
      const idx = STAGE_ORDER.indexOf(name as (typeof STAGE_ORDER)[number]);
      for (let i = 0; i < idx; i++) {
        const prior = STAGE_ORDER[i];
        if (next[prior]?.status !== "done") {
          next[prior] = { status: "done", message: next[prior]?.message };
        }
      }
      return next;
    });
  }, []);

  const onComplete = useCallback((result: PackProposal) => {
    setStages((prev) => {
      const next = { ...prev };
      for (const s of STAGE_ORDER) {
        next[s] = { status: "done", message: next[s]?.message };
      }
      return next;
    });
    setProposal(result);
    setStep(3);
  }, []);

  const onErrorEvt = useCallback((code: string, message: string, hint?: string) => {
    setError({ message: `[${code}] ${message}`, hint });
    setStages((prev) => {
      const next = { ...prev };
      for (const s of STAGE_ORDER) {
        if (next[s]?.status === "running") {
          next[s] = { status: "failed", message: next[s]?.message };
        }
      }
      return next;
    });
  }, []);

  useExtractJob(jobId, { onStage, onComplete, onError: onErrorEvt });

  if (configError) return <div className="p-8 text-rose-600">Error: {configError}</div>;
  if (!config) return <div className="p-8 text-slate-400">Loading…</div>;

  const onAnalyze = async (): Promise<void> => {
    setError(null);
    setStages({});
    setProposal(null);
    try {
      const cleanUrls = state.urls.filter((u) => u.startsWith("http"));
      const { job_id } = await startExtract({
        urls: cleanUrls,
        files: state.files,
        pack_meta: { slug: state.slug, name: state.name, author: state.author },
        provider: state.provider,
        model: state.model,
      });
      setJobId(job_id);
      setStep(2);
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : String(e) });
    }
  };

  const backToStep1 = (): void => {
    setStep(1);
    setJobId(null);
    setProposal(null);
    setError(null);
    setStages({});
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">Extract from URLs</h1>
      {step === 1 && (
        <Step1Inputs state={state} config={config} onChange={setState} onAnalyze={onAnalyze} />
      )}
      {step === 2 && jobId && (
        <Step2Progress
          stages={stages}
          jobId={jobId}
          error={error}
          onCancel={backToStep1}
          onBack={backToStep1}
        />
      )}
      {step === 3 && proposal && (
        <Step3Review
          proposal={proposal}
          packMeta={{ slug: state.slug, name: state.name, author: state.author }}
          onBack={backToStep1}
        />
      )}
    </div>
  );
}
