import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import type { LintHit } from "../api/compose";
import { lintText } from "../api/compose";
import type { PackSummary } from "../api/packs";
import { listPacks } from "../api/packs";
import { startRewrite } from "../api/rewrite";
import type { ComposeControls } from "../components/compose/ControlsBar";
import { ControlsBar } from "../components/compose/ControlsBar";
import { InputPane } from "../components/compose/InputPane";
import { OutputPane } from "../components/compose/OutputPane";
import type { ReceiptData } from "../components/compose/Receipt";
import { Receipt } from "../components/compose/Receipt";
import type { JobEvent } from "../hooks/useEventStream";
import { useJobEventStream } from "../hooks/useEventStream";

export function ComposePage(): JSX.Element {
  const { slug } = useParams<{ slug?: string }>();
  const [packs, setPacks] = useState<PackSummary[]>([]);
  const [controls, setControls] = useState<ComposeControls | null>(null);
  const [draft, setDraft] = useState("");
  const [output, setOutput] = useState("");
  const [inputHits, setInputHits] = useState<LintHit[]>([]);
  const [outputHits, setOutputHits] = useState<LintHit[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const rewriteStartRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, []);

  // Load pack list
  useEffect(() => {
    listPacks()
      .then(setPacks)
      .catch(() => {});
  }, []);

  // Initialize controls when pack list arrives
  useEffect(() => {
    if (!controls && packs.length > 0) {
      const initial = slug ?? packs[0].slug;
      setControls({ pack: initial, format: null, samples: [], provider: "anthropic", model: "" });
    }
  }, [packs, slug, controls]);

  // Debounced input lint — 250ms
  useEffect(() => {
    if (!controls?.pack || !draft) {
      setInputHits([]);
      return;
    }
    const t = setTimeout(() => {
      lintText({ pack: controls.pack, text: draft })
        .then((r) => {
          setInputHits([...r.violations, ...r.hits]);
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [draft, controls?.pack]);

  const onEvent = useCallback((e: JobEvent) => {
    if (e.type === "token" && typeof e.delta === "string") {
      setOutput((prev) => prev + e.delta);
    } else if (e.type === "complete" && e.result) {
      const r = e.result as Record<string, unknown>;
      setOutput((r.output as string) ?? "");
      const violations = (r.lint_violations as LintHit[] | undefined) ?? [];
      const hits = (r.lint_hits as LintHit[] | undefined) ?? [];
      setOutputHits([...violations, ...hits]);
      const elapsed = rewriteStartRef.current
        ? (Date.now() - rewriteStartRef.current) / 1000
        : undefined;
      setReceipt({
        model: (r.model as string) ?? "",
        provider: (r.provider as string) ?? undefined,
        inputTokens: (r.input_tokens as number) ?? 0,
        outputTokens: (r.output_tokens as number) ?? 0,
        costUsd: (r.cost_usd as number) ?? 0,
        finishReason: (r.finish_reason as string) ?? "stop",
        elapsedSeconds: elapsed,
      });
      setJobId(null);
    } else if (e.type === "error") {
      setError({
        message: (e.message as string) || "An error occurred",
        hint: e.hint as string | undefined,
      });
      setJobId(null);
    }
  }, []);

  useJobEventStream(jobId, onEvent);

  const onRewrite = async () => {
    if (!controls?.pack || !controls.model) return;
    setOutput("");
    setOutputHits([]);
    setReceipt(null);
    setError(null);
    rewriteStartRef.current = Date.now();
    try {
      const { job_id } = await startRewrite({
        pack: controls.pack,
        format: controls.format ?? undefined,
        samples: controls.samples,
        draft,
        provider: controls.provider,
        model: controls.model,
      });
      setJobId(job_id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError({ message: msg });
    }
  };

  if (!controls) {
    return <div className="p-8 text-slate-500">Loading…</div>;
  }

  return (
    <div className="h-full flex flex-col relative">
      <ControlsBar
        controls={controls}
        setControls={setControls}
        packs={packs}
        draft={draft}
        onRewrite={onRewrite}
        running={jobId !== null}
      />
      <div className="flex-1 flex min-h-0">
        <InputPane draft={draft} setDraft={setDraft} hits={inputHits} />
        <OutputPane
          output={output}
          hits={outputHits}
          streaming={jobId !== null}
          error={error}
          packSlug={controls.pack}
          draft={draft}
          onToast={showToast}
        />
      </div>
      {receipt && <Receipt receipt={receipt} />}

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-emerald-800 text-emerald-100 text-sm rounded shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
