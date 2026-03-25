import { StudentsGrid } from "@components/StudentsGrid";
import { StatusBadge } from "@components/StatusBadge";
import { alerts, examReports, students } from "@mock/data";
import { FiActivity, FiAlertTriangle, FiCheckCircle, FiClock, FiFileText, FiUsers } from "react-icons/fi";

const summaryCards = [
  {
    label: "Students Monitored",
    value: students.length,
    note: "Active roster for the current session",
    icon: <FiUsers className="h-5 w-5" />
  },
  {
    label: "Open Alerts",
    value: alerts.length,
    note: "Incidents waiting for review",
    icon: <FiAlertTriangle className="h-5 w-5" />
  },
  {
    label: "Reports Ready",
    value: examReports.filter((report) => report.uploadStatus === "Completed").length,
    note: "Evidence packages completed",
    icon: <FiFileText className="h-5 w-5" />
  },
  {
    label: "Time Remaining",
    value: "01:23:18",
    note: "Estimated exam countdown",
    icon: <FiClock className="h-5 w-5" />
  }
];

const watchlistStudents = students
  .filter((student) => student.status !== "normal")
  .slice(0, 5);

const recentAlerts = alerts.slice(0, 4).map((alert) => ({
  ...alert,
  student: students.find((student) => student.id === alert.studentId)
}));

const reportSummary = {
  completed: examReports.filter((report) => report.uploadStatus === "Completed").length,
  processing: examReports.filter((report) => report.uploadStatus === "Processing").length,
  pending: examReports.filter((report) => report.uploadStatus === "Pending").length,
  failed: examReports.filter((report) => report.uploadStatus === "Failed").length
};

export default function DashboardOverviewPage() {
  return (
    <section className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <article key={card.label} className="dashboard-panel rounded-[28px] px-5 py-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="dashboard-kicker">{card.label}</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
                  {card.value}
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                {card.icon}
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-500">{card.note}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]">
        <article className="dashboard-panel rounded-[28px] px-6 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="dashboard-kicker">Operational Snapshot</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                Session health overview
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Review the latest alerts and keep the current watchlist visible before entering the live grid.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
              <FiCheckCircle className="h-4 w-4" />
              Monitoring session active
            </div>
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Latest Alerts
                </h3>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {recentAlerts.length}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {recentAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold leading-6 text-slate-900">
                          {alert.message}
                        </p>
                        {alert.student && (
                          <p className="mt-2 text-sm text-slate-500">
                            <span className="font-semibold text-slate-700">{alert.student.name}</span>
                            {" · "}
                            {alert.student.id}
                          </p>
                        )}
                      </div>
                      <span className="whitespace-nowrap text-xs font-medium text-slate-400">
                        {alert.timestamp}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Watchlist
                </h3>
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                  <FiActivity className="h-4 w-4" />
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {watchlistStudents.map((student) => (
                  <div
                    key={student.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{student.name}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {student.exam} · {student.connection} connection
                        </p>
                      </div>
                      <StatusBadge status={student.status} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </article>

        <article className="dashboard-panel rounded-[28px] px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="dashboard-kicker">Reporting Pulse</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                Evidence progress
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Keep an eye on how post-exam reports are progressing while the session is still active.
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
              <FiFileText className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                Completed
              </p>
              <p className="mt-2 text-2xl font-semibold text-emerald-900">{reportSummary.completed}</p>
            </div>
            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                Processing
              </p>
              <p className="mt-2 text-2xl font-semibold text-blue-900">{reportSummary.processing}</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                Pending
              </p>
              <p className="mt-2 text-2xl font-semibold text-amber-900">{reportSummary.pending}</p>
            </div>
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
                Failed
              </p>
              <p className="mt-2 text-2xl font-semibold text-red-900">{reportSummary.failed}</p>
            </div>
          </div>

          <div className="mt-6 rounded-[24px] border border-slate-200 bg-white px-4 py-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Highest Alert Reports
            </h3>
            <div className="mt-4 space-y-3">
              {examReports
                .slice()
                .sort((a, b) => b.alertsCount - a.alertsCount)
                .slice(0, 4)
                .map((report) => (
                  <div
                    key={report.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{report.studentName}</p>
                      <p className="mt-1 text-sm text-slate-500">{report.exam}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-slate-900">{report.alertsCount}</p>
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                        Alerts
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </article>
      </div>

      <StudentsGrid />
    </section>
  );
}
