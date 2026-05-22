import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useParams } from "react-router-dom";

import { type PackDetail, getPack } from "../api/packs";
import { PackOverview } from "../components/PackOverview";

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

function ManifestStub(): JSX.Element {
  return <div className="p-6 text-slate-400">Manifest editor lands in P3-T9.</div>;
}
function StyleGuideStub(): JSX.Element {
  return <div className="p-6 text-slate-400">Markdown editor lands in P3-T8.</div>;
}
function FormatsStub(): JSX.Element {
  return <div className="p-6 text-slate-400">Formats editor lands in P3-T8.</div>;
}
function SamplesStub(): JSX.Element {
  return <div className="p-6 text-slate-400">Samples editor lands in P3-T8.</div>;
}
function BiosStub(): JSX.Element {
  return <div className="p-6 text-slate-400">Bios editor lands in P3-T8.</div>;
}
