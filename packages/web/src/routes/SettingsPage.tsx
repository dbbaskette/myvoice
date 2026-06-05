import { useEffect, useState } from "react";
import type { Config } from "../api/config";
import { getConfig, putConfig } from "../api/config";
import { DefaultsSection } from "../components/settings/DefaultsSection";
import { KeysSection } from "../components/settings/KeysSection";
import { PackPathsSection } from "../components/settings/PackPathsSection";
import { ServerSection } from "../components/settings/ServerSection";
import { ThemeSection } from "../components/settings/ThemeSection";
import { Button, PageHeader } from "../components/ui";
import { useTheme } from "../hooks/useTheme";

export function SettingsPage(): JSX.Element {
  const [loaded, setLoaded] = useState<Config | null>(null);
  const [draft, setDraft] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getConfig()
      .then((c) => {
        setLoaded(c);
        setDraft(c);
      })
      .catch((e: unknown) => setError(String(e)));
  }, []);

  // Apply theme live as user adjusts the draft
  useTheme(draft?.ui.theme ?? "system");

  if (error) {
    return <div className="p-8 text-rose-600">Error loading settings: {error}</div>;
  }
  if (!draft || !loaded) {
    return <div className="p-8 text-slate-500">Loading settings…</div>;
  }

  const dirty = JSON.stringify(loaded) !== JSON.stringify(draft);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const next = await putConfig(draft);
      setLoaded(next);
      setDraft(next);
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const discard = () => setDraft(loaded);

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="max-w-2xl mx-auto px-8 pb-16">
        {/* Sticky action bar */}
        <div className="sticky top-0 z-10 bg-slate-50 py-4 -mx-8 px-8 border-b border-slate-200 flex items-center justify-between mb-8">
          <PageHeader title="Settings" />
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={discard} disabled={!dirty || saving}>
              Discard
            </Button>
            <Button variant="primary" size="sm" onClick={save} disabled={!dirty || saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-600 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-5">
          <KeysSection draft={draft} setDraft={setDraft} />
          <PackPathsSection draft={draft} setDraft={setDraft} />
          <ThemeSection draft={draft} setDraft={setDraft} />
          <DefaultsSection draft={draft} setDraft={setDraft} />
          <ServerSection draft={draft} />
        </div>
      </div>
    </div>
  );
}
