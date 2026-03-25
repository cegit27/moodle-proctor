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

export const dashboardNavItems: NavItem[] = [
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
    router.push("/login");
  };

  return (
    <aside className="dashboard-panel fixed bottom-4 left-4 top-4 z-40 hidden w-72 overflow-y-auto rounded-[28px] scroll-thin lg:flex lg:flex-col">
      <div className="flex items-center gap-4 border-b border-slate-200/70 px-6 pb-6 pt-7">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-sm font-bold text-white shadow-lg shadow-slate-900/15">
          PV
        </div>
        <div className="min-w-0">
          <p className="dashboard-kicker">Operations Console</p>
          <h1 className="truncate text-lg font-semibold text-slate-900">ProctorVision</h1>
          <p className="mt-1 text-sm text-slate-500">Manage exams, alerts, and live rooms</p>
        </div>
      </div>

      <div className="px-6 py-5">
        <div className="rounded-3xl bg-slate-900 px-4 py-4 text-white shadow-lg shadow-slate-900/10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
            Active Session
          </p>
          <p className="mt-3 text-lg font-semibold">Physics Midterm</p>
          <p className="mt-1 text-sm text-slate-300">Section A / Room 204</p>
          <div className="mt-4 flex items-center gap-2 text-sm text-emerald-300">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            Monitoring in progress
          </div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-2 px-4">
        {dashboardNavItems.map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-200",
                active
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                  : "text-slate-600 hover:bg-white/85 hover:text-slate-900"
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-9 w-9 items-center justify-center rounded-xl border transition-colors",
                  active
                    ? "border-white/20 bg-white/10 text-white"
                    : "border-slate-200 bg-slate-50 text-slate-500 group-hover:border-slate-300 group-hover:bg-white"
                ].join(" ")}
              >
                {item.icon}
              </span>
              <span className="flex-1">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200/70 px-4 py-4">
        <div className="mb-3 rounded-2xl bg-blue-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
            Session Lead
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-900">Dr. Alice Nguyen</p>
          <p className="text-sm text-slate-500">Exam Operations</p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-red-50 hover:text-red-700"
        >
          <FiLogOut className="h-4 w-4" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};
