import { type ChangeEvent, type DragEvent, useRef, useState } from "react";

import type { UploadFile } from "../../api/extract";
import { Icon } from "../ui";

interface FileDropzoneProps {
  files: UploadFile[];
  onChange: (next: UploadFile[]) => void;
}

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 10;
const ACCEPT = ".md,.txt,.docx";
const ALLOWED_EXT = [".md", ".txt", ".docx"];

async function fileToUpload(file: File): Promise<UploadFile> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  // base64 encode in chunks to avoid stack overflow
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return {
    name: file.name,
    content_b64: btoa(bin),
    mime: file.type || "application/octet-stream",
  };
}

export function FileDropzone({ files, onChange }: FileDropzoneProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const addFiles = async (incoming: FileList | File[]): Promise<void> => {
    setError(null);
    const arr = Array.from(incoming);
    for (const f of arr) {
      const ext = `.${(f.name.split(".").pop() || "").toLowerCase()}`;
      if (!ALLOWED_EXT.includes(ext)) {
        setError(`Unsupported file type: ${f.name}`);
        return;
      }
      if (f.size > MAX_BYTES) {
        setError(`${f.name} is larger than 5 MB`);
        return;
      }
    }
    const newOnes = await Promise.all(arr.map(fileToUpload));
    const combined = [...files, ...newOnes];
    if (combined.length > MAX_FILES) {
      setError(`Maximum ${MAX_FILES} files; received ${combined.length}`);
      return;
    }
    onChange(combined);
  };

  const onInputChange = (e: ChangeEvent<HTMLInputElement>): void => {
    if (e.target.files) void addFiles(e.target.files);
    e.target.value = ""; // allow re-selecting the same file
  };

  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) void addFiles(e.dataTransfer.files);
  };

  const remove = (i: number): void => {
    onChange(files.filter((_, idx) => idx !== i));
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
          dragOver ? "border-indigo-400 bg-indigo-50" : "border-slate-300"
        }`}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full text-left cursor-pointer bg-transparent border-0 p-0"
          aria-label="Open file picker"
        >
          <p className="text-slate-600 text-sm">
            Drag and drop .md / .txt / .docx files here, or click to pick
          </p>
          <p className="text-slate-400 text-xs mt-1">Up to {MAX_FILES} files, 5 MB each</p>
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          onChange={onInputChange}
          className="hidden"
          aria-label="Choose files"
        />
      </div>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {files.map((f, i) => (
            <span
              key={`${f.name}-${i}`}
              className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs"
            >
              <Icon.FileText size={12} />
              {f.name}
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove ${f.name}`}
                className="text-slate-400 hover:text-rose-600"
              >
                <Icon.X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      {error && <p className="text-rose-600 text-xs mt-2">{error}</p>}
    </div>
  );
}
