import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useParams } from "react-router-dom";

import { type PackDetail, getManifest, getPack } from "../api/packs";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { PackOverview } from "../components/PackOverview";
import { ManifestForm } from "../components/manifest/ManifestForm";

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
      <div className="p-8 text-red-400">
        Error loading pack <code>{slug}</code>: {error}
      </div>
    );
  }
  if (pack === null) {
    return <div className="p-8 text-slate-500">Loading pack {slug}…</div>;
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
  return (
    <nav className="w-[200px] shrink-0 flex flex-col bg-slate-950/50 border-r border-slate-800">
      <div className="px-4 py-3 border-b border-slate-800">
        <div className="text-slate-100 font-semibold">{pack.slug}</div>
        <div className="text-slate-500 text-xs mt-0.5">
          v{pack.version}
          {pack.author ? ` · ${pack.author}` : ""}
        </div>
      </div>
      <div className="px-2 py-2 flex-1">
        <SubLink to="" end label="📋 Overview" />
        <SubLink to="manifest" label="⚙ Manifest" />
        <SubLink to="style-guide" label="📝 Style guide" />
        <SubLink to="formats" label="📄 Formats" count={pack.counts?.formats} />
        <SubLink to="samples" label="💬 Samples" count={pack.counts?.samples} />
        <SubLink to="bios" label="👤 Bios" count={pack.counts?.bios} />
      </div>
      <div className="border-t border-slate-800 px-4 py-2 text-xs">
        {pack.valid ? (
          <span className="text-emerald-400">● Valid against SPEC v1.0</span>
        ) : (
          <span className="text-red-400">● {pack.errors.length} error(s)</span>
        )}
      </div>
    </nav>
  );
}

interface SubLinkProps {
  to: string;
  label: string;
  count?: number;
  end?: boolean;
}

function SubLink({ to, label, count, end }: SubLinkProps): JSX.Element {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center justify-between px-2 py-1.5 text-sm rounded ${isActive ? "bg-slate-800 text-slate-100" : "text-slate-300 hover:bg-slate-800/60"}`
      }
    >
      <span>{label}</span>
      {count !== undefined && (
        <span className="text-[10px] text-slate-500 bg-slate-800 rounded-full px-2 py-0.5">
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

function FileGroup({ category }: { category: "formats" | "samples" | "bios" }): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  const [manifest, setManifest] = useState<Record<string, unknown> | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    getManifest(slug).then((m) => {
      setManifest(m);
      const entries = (m[category] as Array<{ file: string }> | undefined) ?? [];
      if (entries.length > 0) setSelected(entries[0].file);
    });
  }, [slug, category]);

  if (!slug) return <div />;
  if (manifest === null) return <div className="p-6 text-slate-500">Loading…</div>;
  const entries = (manifest[category] as Array<{ name?: string; id?: string; file: string }>) ?? [];
  if (entries.length === 0) {
    return <div className="p-6 text-slate-400">No {category} in this pack.</div>;
  }

  return (
    <div className="flex h-full">
      <ul className="w-[220px] shrink-0 border-r border-slate-800 overflow-y-auto bg-slate-950/30">
        {entries.map((e) => (
          <li key={e.file}>
            <button
              type="button"
              onClick={() => setSelected(e.file)}
              className={`w-full text-left px-4 py-2 text-sm ${
                selected === e.file
                  ? "bg-slate-800 text-slate-100"
                  : "text-slate-300 hover:bg-slate-800/40"
              }`}
            >
              {e.name ?? e.id ?? e.file}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex-1 min-w-0">
        {selected ? (
          <MarkdownEditor slug={slug} path={selected} />
        ) : (
          <div className="p-6 text-slate-500">Select a file</div>
        )}
      </div>
    </div>
  );
}
