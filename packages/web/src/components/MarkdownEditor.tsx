import Link from "@tiptap/extension-link";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { marked } from "marked";
import { useCallback, useEffect, useMemo, useState } from "react";
import TurndownService from "turndown";

import { apiFetch } from "../api/client";
import { getPackFile } from "../api/packs";
import { Button, Icon, cn } from "./ui";

interface MarkdownEditorProps {
  slug: string;
  path: string;
  onDelete?: () => void; // when provided, renders a Delete button in the header
}

type Mode = "rich" | "raw";

export function MarkdownEditor({ slug, path, onDelete }: MarkdownEditorProps): JSX.Element {
  const [initial, setInitial] = useState<string | null>(null);
  const [raw, setRaw] = useState<string>("");
  const [mode, setMode] = useState<Mode>("rich");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const turndown = useMemo(
    () =>
      new TurndownService({
        headingStyle: "atx",
        codeBlockStyle: "fenced",
        bulletListMarker: "-",
      }),
    [],
  );

  const editor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: false })],
    content: "",
    editorProps: {
      attributes: {
        class: "prose prose-slate max-w-none min-h-[400px] p-6 focus:outline-none",
      },
    },
  });

  // Load file content on mount / when path changes.
  useEffect(() => {
    let cancelled = false;
    setInitial(null);
    setError(null);
    setSavedMessage(null);
    getPackFile(slug, path)
      .then((text) => {
        if (cancelled) return;
        setInitial(text);
        setRaw(text);
        if (editor) editor.commands.setContent(marked.parse(text) as string);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, path, editor]);

  const handleSave = useCallback(async () => {
    if (!editor) return;
    setSaving(true);
    setError(null);
    let content: string;
    if (mode === "rich") {
      content = turndown.turndown(editor.getHTML());
    } else {
      content = raw;
    }
    try {
      await apiFetch<unknown>(`/api/packs/${encodeURIComponent(slug)}/files/${path}`, {
        method: "PUT",
        body: JSON.stringify({ content }),
      });
      setInitial(content);
      setRaw(content);
      if (mode === "raw" && editor) {
        editor.commands.setContent(marked.parse(content) as string);
      }
      setSavedMessage("Saved");
      setTimeout(() => setSavedMessage(null), 2000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [editor, mode, raw, turndown, slug, path]);

  const handleSwitchMode = (next: Mode) => {
    if (next === mode || !editor) return;
    if (next === "raw") {
      // Convert current HTML to markdown for raw editing.
      setRaw(turndown.turndown(editor.getHTML()));
    } else {
      editor.commands.setContent(marked.parse(raw) as string);
    }
    setMode(next);
  };

  if (error) {
    return <div className="p-6 text-rose-600">Error: {error}</div>;
  }
  if (initial === null) {
    return <div className="p-6 text-slate-400">Loading {path}…</div>;
  }

  const dirty =
    (mode === "rich" && editor && turndown.turndown(editor.getHTML()).trim() !== initial.trim()) ||
    (mode === "raw" && raw !== initial);

  return (
    <div className="flex flex-col h-full bg-white">
      <header className="border-b border-slate-200 px-6 py-3 flex items-center gap-3 bg-white">
        <div className="flex-1 min-w-0">
          <div className="text-slate-900 font-semibold text-sm">{path}</div>
          <div className="text-xs text-slate-400 font-mono truncate">
            packs/{slug}/{path}
          </div>
        </div>
        <div className="inline-flex bg-slate-100 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => handleSwitchMode("rich")}
            className={cn(
              "px-3 py-1 text-xs rounded-md transition-colors",
              mode === "rich" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500",
            )}
          >
            Rich
          </button>
          <button
            type="button"
            onClick={() => handleSwitchMode("raw")}
            className={cn(
              "px-3 py-1 text-xs rounded-md transition-colors",
              mode === "raw" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500",
            )}
          >
            Raw
          </button>
        </div>
        {onDelete && (
          <Button variant="danger" size="sm" onClick={onDelete}>
            <Icon.Trash size={14} /> Delete
          </Button>
        )}
        <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
          <Icon.Save size={14} /> {saving ? "Saving…" : "Save"}
        </Button>
        {savedMessage && (
          <span className="text-emerald-600 text-xs font-medium">{savedMessage}</span>
        )}
      </header>

      {mode === "rich" && editor && (
        <>
          <Toolbar editor={editor} />
          <div className="flex-1 overflow-y-auto bg-white">
            <EditorContent editor={editor} />
          </div>
        </>
      )}
      {mode === "raw" && (
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          className="flex-1 bg-white text-slate-800 font-mono text-sm p-6 focus:outline-none resize-none"
        />
      )}
    </div>
  );
}

interface ToolbarProps {
  editor: ReturnType<typeof useEditor>;
}

function Toolbar({ editor }: ToolbarProps): JSX.Element | null {
  if (!editor) return null;
  return (
    <div className="border-b border-slate-200 px-4 py-2 flex gap-1 bg-slate-50 text-sm">
      <TButton
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H2
      </TButton>
      <TButton
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        H3
      </TButton>
      <div className="w-px h-5 bg-slate-200 mx-1" />
      <TButton
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <b>B</b>
      </TButton>
      <TButton
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <i>I</i>
      </TButton>
      <TButton
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <s>S</s>
      </TButton>
      <div className="w-px h-5 bg-slate-200 mx-1" />
      <TButton
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        •
      </TButton>
      <TButton
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1.
      </TButton>
      <TButton
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        ❝
      </TButton>
      <TButton
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        {"<>"}
      </TButton>
    </div>
  );
}

interface TButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function TButton({ active, onClick, children }: TButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2 py-1 rounded text-xs transition-colors",
        active ? "bg-slate-200 text-slate-900" : "text-slate-500 hover:bg-slate-100",
      )}
    >
      {children}
    </button>
  );
}
