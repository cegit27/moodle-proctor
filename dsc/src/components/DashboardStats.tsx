import { alerts, examReports, students } from "@mock/data";

const stats = [
  {
    label: "Students",
    value: students.length,
    helper: "Active in this session"
  },
  {
    label: "Alerts",
    value: alerts.length,
    helper: "Need review"
  },
  {
    label: "Reports Ready",
    value: examReports.filter((report) => report.uploadStatus === "Completed").length,
    helper: "Available to download"
  },
  {
    label: "Time Left",
    value: "01:23:18",
    helper: "Current exam timer"
  }
];

export const DashboardStats = () => {
  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((stat) => (
        <article key={stat.label} className="glass-surface rounded-xl px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{stat.label}</p>
          <p className="mt-2 text-xl font-semibold text-slate-100">{stat.value}</p>
          <p className="mt-1 text-xs text-slate-400">{stat.helper}</p>
        </article>
      ))}
    </section>
  );
};
