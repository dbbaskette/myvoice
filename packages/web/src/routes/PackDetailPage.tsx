import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useParams } from "react-router-dom";

import type { EntryKind } from "../api/entries";
import { type PackDetail, getManifest, getPack } from "../api/packs";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { PackOverview } from "../components/PackOverview";
import { DeleteEntryDialog } from "../components/manifest/DeleteEntryDialog";
import { ManifestForm } from "../components/manifest/ManifestForm";
import { NewEntryDialog } from "../components/manifest/NewEntryDialog";
import { Badge, Button, Icon, cn } from "../components/ui";
import { useGlobalEvents } from "../hooks/useGlobalEvents";

export function PackDetailPage(): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  const [pack, setPack] = useState<PackDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    const abort = new AbortController();
    setPack(null);
    setError(null);
    getPack(slug, { signal: abort.signal })
      .then(setPack)
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, [slug]);

  if (!slug) return <Navigate to="/packs" replace />;
  if (error) {
    return (
      <div className="p-8 text-rose-600">
        Error loading pack <code>{slug}</code>: {error}
      </div>
    );
  }
  if (pack === null) {
    return <div className="p-8 text-slate-400">Loading pack {slug}…</div>;
  }

  return (
    <div className="h-full flex min-w-0">
      <PackSubNav pack={pack} />
      <div className="flex-1 min-w-0 overflow-y-auto">
        <Routes>
          <Route index element={<PackOverview pack={pack} />} />
          <Route path="manifest" element={<ManifestStub />} />
          <Route path="style-guide" element={<StyleGuideStub />} />
          <Route path="formats" element={<FormatsStub />} />
          <Route path="samples" element={<SamplesStub />} />
          <Route path="bios" element={<BiosStub />} />
        </Routes>
      </div>
    </div>
  );
}

function PackSubNav({ pack }: { pack: PackDetail }): JSX.Element {
  // Absolute paths so tabs replace the active segment instead of stacking onto
  // the current deep URL (e.g. /packs/dan/style-guide/manifest/...).
  const base = `/packs/${encodeURIComponent(pack.slug)}`;
  return (
    <nav className="w-52 shrink-0 flex flex-col bg-white border-r border-slate-200">
      <div className="px-4 py-4 border-b border-slate-200">
        <div className="text-slate-900 font-semibold tracking-tight truncate">{pack.slug}</div>
        <div className="text-slate-400 text-xs mt-0.5">
          v{pack.version}
          {pack.author ? ` · ${pack.author}` : ""}
        </div>
      </div>
      <div className="px-2 py-2 flex-1 flex flex-col gap-0.5">
        <SubLink to={base} end icon={Icon.LayoutDashboard} label="Overview" />
        <SubLink to={`${base}/manifest`} icon={Icon.Sliders} label="Manifest" />
        <SubLink to={`${base}/style-guide`} icon={Icon.FileText} label="Style guide" />
        <SubLink
          to={`${base}/formats`}
          icon={Icon.Files}
          label="Formats"
          count={pack.counts?.formats}
        />
        <SubLink
          to={`${base}/samples`}
          icon={Icon.MessageSquare}
          label="Samples"
          count={pack.counts?.samples}
        />
        <SubLink to={`${base}/bios`} icon={Icon.User} label="Bios" count={pack.counts?.bios} />
      </div>
      <div className="border-t border-slate-200 px-4 py-3">
        {pack.valid ? (
          <Badge variant="success">
            <Icon.CheckCircle size={13} /> Valid · SPEC v1.0
          </Badge>
        ) : (
          <Badge variant="danger">
            <Icon.AlertCircle size={13} /> {pack.errors.length} error(s)
          </Badge>
        )}
      </div>
    </nav>
  );
}

interface SubLinkProps {
  to: string;
  icon: LucideIcon;
  label: string;
  count?: number;
  end?: boolean;
}

function SubLink({ to, icon: IconCmp, label, count, end }: SubLinkProps): JSX.Element {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2.5 px-2.5 py-2 text-sm rounded-lg transition-colors",
          isActive
            ? "bg-indigo-50 text-indigo-700 font-medium"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
        )
      }
    >
      <IconCmp size={16} />
      <span className="flex-1">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="text-[10px] font-medium text-slate-500 bg-slate-100 rounded-full px-1.5 py-0.5">
          {count}
        </span>
      )}
    </NavLink>
  );
}

function StyleGuideStub(): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return <div />;
  return <MarkdownEditor slug={slug} path="style-guide.md" />;
}

function FormatsStub(): JSX.Element {
  return <FileGroup category="formats" />;
}

function SamplesStub(): JSX.Element {
  return <FileGroup category="samples" />;
}

function BiosStub(): JSX.Element {
  return <FileGroup category="bios" />;
}

function ManifestStub(): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return <div />;
  return <ManifestForm slug={slug} />;
}

function FileGroup({ category }: { category: EntryKind }): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  const [manifest, setManifest] = useState<Record<string, unknown> | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const reload = useCallback(
    (preferSelected?: string | null): void => {
      if (!slug) return;
      void getManifest(slug).then((m) => {
        setManifest(m);
        const entries = (m[category] as Array<{ file: string }> | undefined) ?? [];
        if (preferSelected && entries.some((e) => e.file === preferSelected)) {
          setSelected(preferSelected);
        } else if (entries.length > 0) {
          // Keep previous selection if still present; else fall back to first.
          setSelected((prev) =>
            prev && entries.some((e) => e.file === prev) ? prev : entries[0].file,
          );
        } else {
          setSelected(null);
        }
      });
    },
    [slug, category],
  );

  useEffect(() => {
    if (!slug) return;
    reload();
  }, [slug, reload]);

  // Live refresh on pack:updated events for this slug.
  useGlobalEvents(
    useCallback(
      (evt) => {
        if (evt.type === "pack:updated" && evt.slug === slug) reload(selected);
      },
      [slug, selected, reload],
    ),
  );

  if (!slug) return <div />;
  if (manifest === null) return <div className="p-6 text-slate-400">Loading…</div>;
  const entries = (manifest[category] as Array<{ name?: string; id?: string; file: string }>) ?? [];

  // Find the entry's identity (name for formats/bios, id for samples) for the selected file.
  const selectedEntry = entries.find((e) => e.file === selected);
  const selectedIdent = category === "samples" ? selectedEntry?.id : selectedEntry?.name;

  return (
    <div className="flex h-full">
      <div className="w-[220px] shrink-0 flex flex-col border-r border-slate-200 bg-white">
        <ul className="flex-1 overflow-y-auto p-1.5">
          {entries.length === 0 ? (
            <li className="p-3 text-slate-400 text-xs">No {category} yet.</li>
          ) : (
            entries.map((e) => (
              <li key={e.file}>
                <button
                  type="button"
                  onClick={() => setSelected(e.file)}
                  className={cn(
                    "w-full text-left px-2.5 py-2 text-sm rounded-lg transition-colors",
                    selected === e.file
                      ? "bg-indigo-50 text-indigo-700 font-medium"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  )}
                >
                  {e.name ?? e.id ?? e.file}
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="border-t border-slate-200 p-2">
          <Button variant="secondary" size="sm" className="w-full" onClick={() => setNewOpen(true)}>
            <Icon.Plus size={14} /> New {category.slice(0, -1)}
          </Button>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        {selected ? (
          <MarkdownEditor
            slug={slug}
            path={selected}
            onDelete={selectedIdent ? () => setDeleteOpen(true) : undefined}
          />
        ) : (
          <div className="p-6 text-slate-400">
            No file selected. Click &quot;New {category.slice(0, -1)}&quot; to add one.
          </div>
        )}
      </div>
      <NewEntryDialog
        slug={slug}
        kind={category}
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(file) => reload(file)}
      />
      {selectedIdent && selected && (
        <DeleteEntryDialog
          slug={slug}
          kind={category}
          ident={selectedIdent}
          label={selected}
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => {
            setSelected(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
