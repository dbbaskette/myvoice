import { useState } from "react";
import { useNavigate } from "react-router-dom";

import type { AnalysisResult, PackProposal } from "../../api/extract";
import { saveFromAnalysis } from "../../api/extract";
import { BanishedReview } from "./review/BanishedReview";
import { ExceptionsReview } from "./review/ExceptionsReview";
import { PersonaReview } from "./review/PersonaReview";
import { PopCultureReview } from "./review/PopCultureReview";
import { SampleCard } from "./review/SampleCard";
import { StyleGuideReview } from "./review/StyleGuideReview";

interface Step3ReviewProps {
  proposal: PackProposal;
  packMeta: { slug: string; name: string; author: string };
  onBack: () => void;
}

export function Step3Review({ proposal, packMeta, onBack }: Step3ReviewProps): JSX.Element {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<AnalysisResult>(proposal.analysis);
  const [selected, setSelected] = useState<Set<number>>(
    new Set(proposal.analysis.samples.map((_, i) => i)),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourceCount = proposal.sources.length;
  const wordCount = proposal.sources.reduce((sum, s) => sum + s.word_count, 0);

  const setAnalysisField = <K extends keyof AnalysisResult>(k: K, v: AnalysisResult[K]): void => {
    setDraft((prev) => ({ ...prev, [k]: v }));
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      await saveFromAnalysis({
        slug: packMeta.slug,
        name: packMeta.name,
        author: packMeta.author,
        persona_identity: draft.persona_identity,
        persona_one_line: draft.persona_one_line,
        proposal: draft,
        selected_sample_indexes: Array.from(selected).sort((a, b) => a - b),
      });
      navigate(`/packs/${encodeURIComponent(packMeta.slug)}/manifest`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="bg-slate-900 border border-slate-800 rounded p-3 text-sm text-slate-300">
        {sourceCount} source(s) · {wordCount.toLocaleString()} words · {proposal.model} ·{" "}
        {proposal.elapsed_seconds.toFixed(1)}s · ~${proposal.cost_usd.toFixed(4)}
      </div>

      <PersonaReview
        identity={draft.persona_identity}
        oneLine={draft.persona_one_line}
        onChange={({ identity, oneLine }) =>
          setDraft((prev) => ({ ...prev, persona_identity: identity, persona_one_line: oneLine }))
        }
      />

      <BanishedReview
        words={draft.banished_words}
        phrases={draft.banished_phrases}
        onWordsChange={(v) => setAnalysisField("banished_words", v)}
        onPhrasesChange={(v) => setAnalysisField("banished_phrases", v)}
      />

      <ExceptionsReview
        values={draft.permitted_exceptions}
        onChange={(v) => setAnalysisField("permitted_exceptions", v)}
      />

      <StyleGuideReview
        markdown={draft.style_guide_markdown}
        onChange={(v) => setAnalysisField("style_guide_markdown", v)}
      />

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-100">Samples</h2>
        <p className="text-slate-500 text-xs">Uncheck any you don't want to include.</p>
        <div className="space-y-3">
          {draft.samples.map((s, i) => (
            <SampleCard
              key={s.rank}
              sample={s}
              selected={selected.has(i)}
              onToggle={() => {
                const next = new Set(selected);
                if (next.has(i)) next.delete(i);
                else next.add(i);
                setSelected(next);
              }}
              onExcerptChange={(text) => {
                const samples = draft.samples.map((ss, idx) =>
                  idx === i ? { ...ss, excerpt: text } : ss,
                );
                setAnalysisField("samples", samples);
              }}
            />
          ))}
        </div>
      </section>

      <PopCultureReview
        allowed={draft.pop_culture_allowed}
        banned={draft.pop_culture_banned}
        onAllowedChange={(v) => setAnalysisField("pop_culture_allowed", v)}
        onBannedChange={(v) => setAnalysisField("pop_culture_banned", v)}
      />

      <section className="bg-slate-900 border border-slate-800 rounded p-3 text-sm text-slate-400">
        <strong>Bios:</strong> Kept from the <code>_template</code> placeholders. Edit them on the
        Bios tab after saving.
      </section>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="flex justify-between pt-4">
        <button
          type="button"
          onClick={onBack}
          className="px-3 py-1.5 text-sm border border-slate-700 text-slate-300 rounded hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Pack"}
        </button>
      </div>
    </div>
  );
}
