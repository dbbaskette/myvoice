import { type KeyboardEvent, useState } from "react";

interface TagInputProps {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  htmlId: string;
}

export function TagInput({
  label,
  values,
  onChange,
  placeholder,
  htmlId,
}: TagInputProps): JSX.Element {
  const [text, setText] = useState("");

  const add = (): void => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (values.includes(trimmed)) {
      setText("");
      return;
    }
    onChange([...values, trimmed]);
    setText("");
  };

  const remove = (i: number): void => {
    onChange(values.filter((_, idx) => idx !== i));
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  };

  return (
    <div>
      <label htmlFor={htmlId} className="block text-sm font-medium text-slate-200 mb-1">
        {label}
      </label>
      <div className="flex flex-wrap gap-1 mb-2">
        {values.map((v, i) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 bg-slate-800 text-slate-200 px-2 py-0.5 rounded-full text-xs"
          >
            {v}
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remove ${v}`}
              className="text-slate-400 hover:text-red-400"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        id={htmlId}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKey}
        placeholder={placeholder ?? "Type and press Enter…"}
        className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 text-sm"
      />
    </div>
  );
}
