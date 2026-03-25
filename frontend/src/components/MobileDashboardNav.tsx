"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { dashboardNavItems } from "./Sidebar";

export const MobileDashboardNav = () => {
  const pathname = usePathname();

  return (
    <nav className="dashboard-panel mb-4 overflow-x-auto rounded-[24px] px-3 py-3 scroll-thin lg:hidden">
      <div className="flex min-w-max gap-2">
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
                "flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition-colors",
                active
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                  : "bg-white/80 text-slate-600"
              ].join(" ")}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-black/5">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
