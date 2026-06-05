import type { Config } from "../../api/config";
import { Card } from "../ui";

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
    <Card className="p-5 md:p-6">
      <h2 className="text-sm font-semibold text-slate-900">Theme</h2>
      <p className="mt-1 text-sm text-slate-400 mb-4">Choose your preferred color scheme.</p>
      <div className="flex gap-4">
        {THEMES.map(({ value, label }) => (
          <label key={value} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="theme"
              value={value}
              checked={draft.ui.theme === value}
              onChange={() => setTheme(value)}
              className="accent-indigo-600"
            />
            <span className="text-sm text-slate-600">{label}</span>
          </label>
        ))}
      </div>
    </Card>
  );
}
