import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

import { PackList } from "./PackList";
import { Icon, cn } from "./ui";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps): JSX.Element {
  return (
    <div className="h-screen flex bg-slate-50 text-slate-900">
      {/* Library sidebar */}
      <aside className="w-56 shrink-0 flex flex-col bg-white border-r border-slate-200">
        <header className="px-4 py-4 flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <Icon.Wand size={16} />
          </span>
          <span className="text-slate-900 font-semibold tracking-tight">myvoice</span>
          <span className="ml-auto text-[10px] font-medium text-slate-400">v0.1</span>
        </header>

        <nav className="px-2 flex flex-col gap-0.5">
          <SidebarLink to="/packs" icon={Icon.BookOpen} label="Packs" />
          <SidebarLink to="/extract" icon={Icon.Sparkles} label="Extract from URLs" />
          <SidebarLink to="/compose" icon={Icon.Wand} label="Compose & test" />
          <SidebarLink to="/settings" icon={Icon.Settings} label="Settings" />
        </nav>

        <div className="px-4 pt-5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Your packs
        </div>
        <PackList className="flex-1 overflow-y-auto px-2 pb-3" />
      </aside>

      {/* Main pane */}
      <main className="flex-1 min-w-0 overflow-hidden">{children}</main>
    </div>
  );
}

interface SidebarLinkProps {
  to: string;
  icon: LucideIcon;
  label: string;
}

function SidebarLink({ to, icon: IconCmp, label }: SidebarLinkProps): JSX.Element {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2.5 px-2.5 py-2 text-sm rounded-lg transition-colors",
          isActive
            ? "bg-indigo-50 text-indigo-700 font-medium"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
        )
      }
    >
      <IconCmp size={17} />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}
