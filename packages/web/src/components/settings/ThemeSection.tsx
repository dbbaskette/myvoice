import type { Config } from "../../api/config";

interface ThemeSectionProps {
  draft: Config;
  setDraft: (cfg: Config) => void;
}

const THEMES: { value: "light" | "dark" | "system"; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function ThemeSection({ draft, setDraft }: ThemeSectionProps): JSX.Element {
  const setTheme = (theme: "light" | "dark" | "system") => {
    setDraft({ ...draft, ui: { ...draft.ui, theme } });
  };

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-slate-200">Theme</h2>
      <div className="flex gap-4">
        {THEMES.map(({ value, label }) => (
          <label key={value} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="theme"
              value={value}
              checked={draft.ui.theme === value}
              onChange={() => setTheme(value)}
              className="accent-emerald-500"
            />
            <span className="text-sm text-slate-300">{label}</span>
          </label>
        ))}
      </div>
    </section>
  );
}
