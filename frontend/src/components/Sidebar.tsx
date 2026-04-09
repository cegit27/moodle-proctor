"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode } from "react";
import {
  FiAlertTriangle,
  FiBookOpen,
  FiFileText,
  FiGrid,
  FiLogOut,
  FiMonitor,
} from "react-icons/fi";

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
}

export const dashboardNavItems: NavItem[] = [
  { label: "Overview", href: "/dashboard/overview", icon: <FiGrid className="h-4 w-4" /> },
  { label: "Exams", href: "/dashboard/exams", icon: <FiBookOpen className="h-4 w-4" /> },
  { label: "Monitoring", href: "/dashboard/monitoring", icon: <FiMonitor className="h-4 w-4" /> },
  { label: "Alerts", href: "/dashboard/alerts", icon: <FiAlertTriangle className="h-4 w-4" /> },
  { label: "Answer Sheets", href: "/dashboard/answer-sheets", icon: <FiFileText className="h-4 w-4" /> },
];

export const Sidebar = () => {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.localStorage.removeItem("auth_token");
    router.push("/login");
    router.refresh();
  };

  return (
    <aside className="fixed bottom-4 left-4 top-4 z-40 hidden w-[16rem] overflow-y-auto rounded-[20px] border border-slate-200 bg-white lg:flex lg:flex-col">
      <div className="border-b border-slate-200 px-5 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Teacher Workspace
        </p>
        <h1 className="mt-2 text-xl font-semibold text-slate-950">Exam Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">Run exams, monitor rooms, and review submissions.</p>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
        {dashboardNavItems.map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm ${
                active
                  ? "bg-emerald-50 font-semibold text-emerald-800"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span className="text-slate-500">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 px-3 py-4">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          <FiLogOut className="h-4 w-4" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
};
