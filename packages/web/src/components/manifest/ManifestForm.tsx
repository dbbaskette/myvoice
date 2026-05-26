import { useEffect, useState } from "react";

import { type Manifest, ManifestValidationError, putManifest } from "../../api/manifest";
import { exportPackUrl } from "../../api/pack_zip";
import { getManifest } from "../../api/packs";
import { DeletePackDialog } from "../packs/DeletePackDialog";
import { BanishedSection } from "./BanishedSection";
import { EntriesSection } from "./EntriesSection";
import { PackMetadataSection } from "./PackMetadataSection";
import { PersonaSection } from "./PersonaSection";
import { PopCultureSection } from "./PopCultureSection";
import { RulesSection } from "./RulesSection";

interface ManifestFormProps {
  slug: string;
}

export function ManifestForm({ slug }: ManifestFormProps): JSX.Element {
  const [loaded, setLoaded] = useState<Manifest | null>(null);
  const [draft, setDraft] = useState<Manifest | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    let aborted = false;
    getManifest(slug)
      .then((data) => {
        if (aborted) return;
        const m = data as unknown as Manifest;
        setLoaded(m);
        setDraft(structuredClone(m));
      })
      .catch((e: Error) => setBanner(e.message));
    return () => {
      aborted = true;
    };
  }, [slug]);

  if (!draft || !loaded) return <div className="p-6 text-slate-500">Loading manifest…</div>;

  const dirty = JSON.stringify(loaded) !== JSON.stringify(draft);

  const discard = (): void => {
    setDraft(structuredClone(loaded));
    setErrors({});
    setBanner(null);
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    setErrors({});
    setBanner(null);
    try {
      await putManifest(slug, draft);
      // Reload from server (which normalizes)
      const fresh = (await getManifest(slug)) as unknown as Manifest;
      setLoaded(fresh);
      setDraft(structuredClone(fresh));
      setToast("Manifest saved.");
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      if (e instanceof ManifestValidationError) {
        setErrors(e.fieldErrors);
        setBanner(e.message);
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      setBanner(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="sticky top-0 -mx-6 px-6 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between z-10">
        <h1 className="text-lg font-semibold text-slate-100">Manifest</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={discard}
            disabled={!dirty || saving}
            className="px-3 py-1.5 text-sm border border-slate-700 rounded text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {banner && (
        <div className="bg-red-900/40 border border-red-700 text-red-200 rounded p-3 text-sm">
          {banner}
        </div>
      )}

      <PackMetadataSection
        pack={draft.pack}
        errors={errors}
        onChange={(next) => setDraft({ ...draft, pack: next })}
      />
      <PersonaSection
        persona={draft.persona}
        errors={errors}
        onChange={(next) => setDraft({ ...draft, persona: next })}
      />
      <BanishedSection
        banished={draft.banished}
        onChange={(next) => setDraft({ ...draft, banished: next })}
      />
      <RulesSection rules={draft.rules} onChange={(next) => setDraft({ ...draft, rules: next })} />
      <PopCultureSection
        popCulture={draft.pop_culture}
        onChange={(next) => setDraft({ ...draft, pop_culture: next })}
      />
      <EntriesSection
        slug={slug}
        formatsCount={draft.formats.length}
        samplesCount={draft.samples.length}
        biosCount={draft.bios.length}
      />

      <section className="space-y-3 pt-6 mt-6 border-t border-slate-800">
        <h2 className="text-base font-semibold text-slate-100">Distribute</h2>
        <p className="text-slate-400 text-sm">
          Export this pack as a .zip you can share or re-import elsewhere.
        </p>
        <a
          href={exportPackUrl(slug)}
          download
          className="inline-block px-3 py-1.5 text-sm border border-slate-700 text-slate-300 rounded hover:bg-slate-800"
        >
          Export pack as .zip
        </a>
      </section>

      <section className="space-y-3 pt-6 mt-6 border-t border-red-900/40">
        <h2 className="text-base font-semibold text-red-300">Danger zone</h2>
        <p className="text-slate-400 text-sm">
          Move this pack to ~/.myvoice/trash/. The files remain on disk and can be restored
          manually.
        </p>
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="px-3 py-1.5 text-sm border border-red-700 text-red-300 rounded hover:bg-red-900/30"
        >
          Delete pack
        </button>
      </section>
      <DeletePackDialog slug={slug} open={deleteOpen} onClose={() => setDeleteOpen(false)} />

      {toast && (
        <div className="fixed bottom-4 right-4 bg-emerald-700 text-emerald-50 px-4 py-2 rounded shadow">
          {toast}
        </div>
      )}
    </div>
  );
}
