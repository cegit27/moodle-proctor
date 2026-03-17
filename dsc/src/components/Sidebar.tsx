"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode } from "react";
import { FiActivity, FiAlertTriangle, FiBarChart2, FiLogOut, FiMonitor, FiSettings, FiUsers } from "react-icons/fi";

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: <FiActivity className="h-4 w-4" /> },
  { label: "Live Monitoring", href: "/dashboard/monitoring", icon: <FiMonitor className="h-4 w-4" /> },
  { label: "AI Alerts", href: "/dashboard/alerts", icon: <FiAlertTriangle className="h-4 w-4" /> },
  { label: "Students", href: "/dashboard/students", icon: <FiUsers className="h-4 w-4" /> },
  { label: "Reports", href: "/dashboard/reports", icon: <FiBarChart2 className="h-4 w-4" /> },
  { label: "Settings", href: "/dashboard/settings", icon: <FiSettings className="h-4 w-4" /> }
];

export const Sidebar = () => {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    // TODO: Add real logout logic here (invalidate session, clear tokens, etc.)
    router.push("/login");
  };

  return (
    <aside className="hidden lg:flex lg:flex-col w-64 glass-surface px-4 py-6 gap-6">
      <div className="flex items-center gap-3 px-2">
        <div className="h-9 w-9 rounded-xl bg-accent.blue/20 border border-accent.blue/40 flex items-center justify-center">
          <span className="text-accent.blue font-semibold text-lg">OP</span>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold tracking-wide">ProctorVision</span>
          <span className="text-[11px] text-slate-400 uppercase tracking-[0.18em]">
            Teacher Console
          </span>
        </div>
      </div>

      <nav className="flex-1 flex flex-col gap-1">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                active
                  ? "bg-accent.blue/15 text-accent.blue border border-accent.blue/40"
                  : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
              ].join(" ")}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={handleLogout}
        className="mt-auto flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
      >
        <FiLogOut className="h-4 w-4" />
        <span>Logout</span>
      </button>
    </aside>
  );
};

