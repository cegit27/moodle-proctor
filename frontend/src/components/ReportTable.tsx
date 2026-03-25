import { examReports } from "@mock/data";

const reportStatusTone = {
  Completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Processing: "border-blue-200 bg-blue-50 text-blue-700",
  Pending: "border-amber-200 bg-amber-50 text-amber-700",
  Failed: "border-red-200 bg-red-50 text-red-700"
} as const;

export const ReportTable = () => {
  const completedCount = examReports.filter((report) => report.uploadStatus === "Completed").length;

  return (
    <section className="dashboard-panel overflow-hidden rounded-[28px]">
      <div className="border-b border-slate-200/80 px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="dashboard-kicker">Evidence Library</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
              Exam reports
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Review evidence packages, upload progress, and post-exam AI summaries from one place.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:min-w-[300px]">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Total reports
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{examReports.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Completed
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{completedCount}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto scroll-thin">
        <table className="min-w-full">
          <thead className="bg-slate-50/80">
            <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <th className="px-6 py-4">Student</th>
              <th className="px-6 py-4">Exam</th>
              <th className="px-6 py-4 text-center">Alerts</th>
              <th className="px-6 py-4">Upload Status</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {examReports.map((report) => (
              <tr
                key={report.id}
                className="border-t border-slate-200/80 bg-white transition-colors hover:bg-slate-50/80"
              >
                <td className="px-6 py-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{report.studentName}</p>
                    <p className="mt-1 text-xs text-slate-400">{report.id}</p>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm font-medium text-slate-600">{report.exam}</td>
                <td className="px-6 py-4 text-center">
                  <span className="inline-flex min-w-10 items-center justify-center rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                    {report.alertsCount}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${reportStatusTone[report.uploadStatus]}`}
                  >
                    {report.uploadStatus}
                  </span>
                </td>
                <td className="px-6 py-4 text-right text-sm">
                  <div className="flex justify-end gap-2">
                    <button className="rounded-full border border-blue-200 bg-blue-50 px-4 py-2 font-semibold text-blue-700 transition-colors hover:bg-blue-100">
                      View
                    </button>
                    <button className="rounded-full border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 transition-colors hover:bg-slate-100">
                      Download
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
