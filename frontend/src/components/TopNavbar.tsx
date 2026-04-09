"use client";

import { usePathname } from "next/navigation";
import { FiActivity, FiClock } from "react-icons/fi";

import { useTeacherStats } from "@/hooks/useTeacherData";

const pageMeta: Record<string, { title: string; subtitle: string }> = {
  "/dashboard": {
    title: "Overview",
    subtitle: "Check exam readiness, live rooms, and answer-sheet progress from one place."
  },
  "/dashboard/overview": {
    title: "Overview",
    subtitle: "Check exam readiness, live rooms, and answer-sheet progress from one place."
  },
  "/dashboard/monitoring": {
    title: "Monitoring",
    subtitle: "Create a room, share the student link, and follow the live exam session."
  },
  "/dashboard/exams": {
    title: "Exams",
    subtitle: "Create exams, upload question papers, and manage proctoring settings."
  },
  "/dashboard/alerts": {
    title: "Alerts",
    subtitle: "Review flagged activity and focus on the rooms that need attention first."
  },
  "/dashboard/answer-sheets": {
    title: "Answer Sheets",
    subtitle: "Review uploaded PDFs and match each submission to the correct student and exam."
  },
  "/dashboard/students": {
    title: "Students",
    subtitle: "Check attempt status and manage visibility from one roster."
  },
  "/dashboard/reports": {
    title: "Reports",
    subtitle: "Review completed evidence and exam outcomes."
  },
  "/dashboard/settings": {
    title: "Settings",
    subtitle: "Adjust the workspace and supporting options."
  }
};

export const TopNavbar = () => {
  const pathname = usePathname();
  const meta = pageMeta[pathname] ?? pageMeta["/dashboard/overview"];
  const { stats, isLoading, error } = useTeacherStats();

  const generatedAt = stats?.generatedAt
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      }).format(new Date(stats.generatedAt))
    : null;

  return (
    <header className="surface-panel rounded-[24px] px-5 py-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{meta.title}</h1>
          <p className="mt-1 text-sm text-slate-600">{meta.subtitle}</p>
        </div>

        <div className="flex flex-wrap gap-2 text-sm">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700">
            <span className={`h-2 w-2 rounded-full ${error ? "bg-red-500" : "bg-emerald-500"}`} />
            {error ? "Backend issue" : isLoading ? "Checking backend" : "Backend connected"}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700">
            <FiActivity className="h-4 w-4" />
            {isLoading ? "Loading summary" : `${stats?.students.active ?? 0} active students`}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700">
            <FiClock className="h-4 w-4" />
            {generatedAt ? `Updated ${generatedAt}` : "Waiting for updates"}
          </span>
        </div>
      </div>
    </header>
  );
};
