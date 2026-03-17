import { examReports } from "@mock/data";

export const ReportTable = () => {
  return (
    <section className="glass-surface overflow-hidden rounded-xl">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div>
          <h2 className="section-title">Reports</h2>
          <p className="section-copy">Generated exam reports</p>
        </div>
        <span className="text-sm text-slate-300">{examReports.length}</span>
      </div>

      <div className="scroll-thin overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-800 bg-slate-950/80 text-slate-400">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Student</th>
              <th className="px-4 py-3 text-left font-medium">Exam</th>
              <th className="px-4 py-3 text-left font-medium">Alerts</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {examReports.map((report) => (
              <tr key={report.id} className="border-b border-slate-900/70">
                <td className="px-4 py-3 text-slate-100">{report.studentName}</td>
                <td className="px-4 py-3 text-slate-300">{report.exam}</td>
                <td className="px-4 py-3 text-slate-300">{report.alertsCount}</td>
                <td className="px-4 py-3 text-slate-300">{report.uploadStatus}</td>
                <td className="px-4 py-3 text-right">
                  <button className="text-sky-300 hover:text-sky-200">Open</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
