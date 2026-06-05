import { type KeyboardEvent, useState } from "react";

import { Icon, Input } from "../ui";

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
      <label htmlFor={htmlId} className="block text-sm font-medium text-slate-700 mb-1">
        {label}
      </label>
      <div className="flex flex-wrap gap-1 mb-2">
        {values.map((v, i) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full text-xs"
          >
            {v}
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remove ${v}`}
              className="text-slate-400 hover:text-rose-600 transition-colors"
            >
              <Icon.X size={10} />
            </button>
          </span>
        ))}
      </div>
      <Input
        id={htmlId}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKey}
        placeholder={placeholder ?? "Type and press Enter…"}
      />
    </div>
  );
}
