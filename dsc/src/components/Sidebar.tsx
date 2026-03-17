"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode } from "react";
import {
  FiActivity,
  FiAlertTriangle,
  FiBarChart2,
  FiLogOut,
  FiMonitor,
  FiSettings,
  FiUsers
} from "react-icons/fi";

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: <FiActivity className="h-4 w-4" /> },
  { label: "Monitoring", href: "/dashboard/monitoring", icon: <FiMonitor className="h-4 w-4" /> },
  { label: "Alerts", href: "/dashboard/alerts", icon: <FiAlertTriangle className="h-4 w-4" /> },
  { label: "Students", href: "/dashboard/students", icon: <FiUsers className="h-4 w-4" /> },
  { label: "Reports", href: "/dashboard/reports", icon: <FiBarChart2 className="h-4 w-4" /> },
  { label: "Settings", href: "/dashboard/settings", icon: <FiSettings className="h-4 w-4" /> }
];

export const Sidebar = () => {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <>
      <div className="glass-surface flex items-center gap-2 overflow-x-auto rounded-xl px-3 py-3 lg:hidden">
        {navItems.map((item) => {
          const active = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm",
                active ? "bg-slate-100 text-slate-950" : "text-slate-300"
              ].join(" ")}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      <aside className="glass-surface hidden w-60 shrink-0 rounded-xl px-3 py-4 lg:flex lg:flex-col">
        <div className="border-b border-slate-800 px-2 pb-4">
          <p className="text-sm font-semibold text-slate-100">ProctorVision</p>
          <p className="mt-1 text-xs text-slate-400">Teacher Console</p>
        </div>

        <nav className="mt-4 flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            const active = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm",
                  active ? "bg-slate-100 text-slate-950" : "text-slate-300 hover:bg-slate-800"
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
          onClick={() => router.push("/login")}
          className="mt-4 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          <FiLogOut className="h-4 w-4" />
          <span>Logout</span>
        </button>
      </aside>
    </>
  );
};
