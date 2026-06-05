import { useEffect, useState } from "react";

import { type Manifest, ManifestValidationError, putManifest } from "../../api/manifest";
import { exportPackUrl } from "../../api/pack_zip";
import { getManifest } from "../../api/packs";
import { DeletePackDialog } from "../packs/DeletePackDialog";
import { Button, Icon } from "../ui";
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

  if (!draft || !loaded) return <div className="p-6 text-slate-400">Loading manifest…</div>;

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
      <div className="sticky top-0 -mx-6 px-6 py-3 bg-white border-b border-slate-200 flex items-center justify-between z-10">
        <h1 className="text-lg font-semibold text-slate-900">Manifest</h1>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={discard} disabled={!dirty || saving}>
            Discard
          </Button>
          <Button variant="primary" size="sm" onClick={save} disabled={!dirty || saving}>
            <Icon.Save size={14} />
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      {banner && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-3 text-sm">
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

      <section className="space-y-3 pt-6 mt-6 border-t border-slate-200">
        <h2 className="text-base font-semibold text-slate-900">Distribute</h2>
        <p className="text-slate-600 text-sm">
          Export this pack as a .zip you can share or re-import elsewhere.
        </p>
        <a
          href={exportPackUrl(slug)}
          download
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <Icon.Download size={14} />
          Export pack as .zip
        </a>
      </section>

      <section className="space-y-3 pt-6 mt-6 border-t border-rose-200">
        <h2 className="text-base font-semibold text-rose-600">Danger zone</h2>
        <p className="text-slate-600 text-sm">
          Move this pack to ~/.myvoice/trash/. The files remain on disk and can be restored
          manually.
        </p>
        <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
          Delete pack
        </Button>
      </section>
      <DeletePackDialog slug={slug} open={deleteOpen} onClose={() => setDeleteOpen(false)} />

      {toast && (
        <div className="fixed bottom-4 right-4 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-2 rounded-xl shadow-sm flex items-center gap-2">
          <Icon.CheckCircle size={15} />
          {toast}
        </div>
      )}
    </div>
  );
}
