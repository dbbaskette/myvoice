import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

import { PackList } from "./PackList";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps): JSX.Element {
  return (
    <div className="h-screen flex bg-slate-900 text-slate-200">
      {/* Library sidebar */}
      <aside className="w-[200px] shrink-0 flex flex-col bg-slate-950 border-r border-slate-800">
        <header className="px-4 py-3 border-b border-slate-800">
          <span className="text-slate-100 font-semibold tracking-tight">myvoice</span>
          <span className="text-slate-500 text-xs ml-2">v0.1</span>
        </header>

        <nav className="px-2 py-2 flex flex-col gap-0.5">
          <SidebarLink to="/packs">📚 Packs</SidebarLink>
          <SidebarLink to="/extract">✨ Extract from URLs</SidebarLink>
          <SidebarLink to="/compose">🔁 Compose &amp; test</SidebarLink>
          <SidebarLink to="/settings">⚙ Settings</SidebarLink>
        </nav>

        <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-slate-500">
          Your packs
        </div>
        <PackList className="flex-1 overflow-y-auto px-2 pb-2" />
      </aside>

      {/* Main pane */}
      <main className="flex-1 min-w-0 overflow-hidden">{children}</main>
    </div>
  );
}

interface SidebarLinkProps {
  to: string;
  children: ReactNode;
  disabled?: boolean;
}

function SidebarLink({ to, children, disabled }: SidebarLinkProps): JSX.Element {
  if (disabled) {
    return (
      <span className="px-2 py-1.5 text-sm rounded text-slate-600 cursor-not-allowed">
        {children}
      </span>
    );
  }
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `px-2 py-1.5 text-sm rounded ${
          isActive ? "bg-slate-800 text-slate-100" : "text-slate-300 hover:bg-slate-800/60"
        }`
      }
    >
      {children}
    </NavLink>
  );
}
