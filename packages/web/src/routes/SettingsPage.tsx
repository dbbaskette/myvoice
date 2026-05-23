import { useEffect, useState } from "react";
import type { Config } from "../api/config";
import { getConfig, putConfig } from "../api/config";
import { DefaultsSection } from "../components/settings/DefaultsSection";
import { KeysSection } from "../components/settings/KeysSection";
import { PackPathsSection } from "../components/settings/PackPathsSection";
import { ServerSection } from "../components/settings/ServerSection";
import { ThemeSection } from "../components/settings/ThemeSection";
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
    return <div className="p-8 text-red-400">Error loading settings: {error}</div>;
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
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 pb-16">
        {/* Sticky action bar */}
        <div className="sticky top-0 z-10 bg-slate-900 py-4 -mx-8 px-8 border-b border-slate-800 flex items-center justify-between mb-8">
          <h1 className="text-xl font-semibold text-slate-100">Settings</h1>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={discard}
              disabled={!dirty || saving}
              className="px-3 py-1.5 text-sm border border-slate-700 rounded text-slate-300
                hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-950 border border-red-800 rounded text-red-300 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-10">
          <KeysSection draft={draft} setDraft={setDraft} />
          <hr className="border-slate-800" />
          <PackPathsSection draft={draft} setDraft={setDraft} />
          <hr className="border-slate-800" />
          <ThemeSection draft={draft} setDraft={setDraft} />
          <hr className="border-slate-800" />
          <DefaultsSection draft={draft} setDraft={setDraft} />
          <hr className="border-slate-800" />
          <ServerSection draft={draft} />
        </div>
      </div>
    </div>
  );
}
