import { alerts } from "@mock/data";
import { FiBell, FiSearch, FiUser } from "react-icons/fi";

export const TopNavbar = () => {
  return (
    <header className="glass-surface rounded-xl px-4 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Current Exam</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-100">Physics Midterm - Group A</span>
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-xs text-emerald-400">Live</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
            <FiSearch className="h-4 w-4 text-slate-500" />
            <input
              placeholder="Search students or alerts"
              className="w-full border-none bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-500"
            />
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-300">
            <FiBell className="h-4 w-4" />
            <span>{alerts.length} alerts</span>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-100">
              T
            </div>
            <span className="hidden text-sm text-slate-300 sm:inline">Dr. Alice Nguyen</span>
            <FiUser className="hidden h-4 w-4 text-slate-500 sm:block" />
          </div>
        </div>
      </div>
    </header>
  );
};
