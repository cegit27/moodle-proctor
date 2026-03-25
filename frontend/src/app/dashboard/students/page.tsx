import { students } from "@mock/data";
import { StatusBadge } from "@components/StatusBadge";

const connectionTone = {
  Excellent: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Good: "border-teal-200 bg-teal-50 text-teal-700",
  Fair: "border-amber-200 bg-amber-50 text-amber-700",
  Poor: "border-red-200 bg-red-50 text-red-700"
} as const;

export default function StudentsPage() {
  const normalCount = students.filter((student) => student.status === "normal").length;

  return (
    <section className="dashboard-panel overflow-hidden rounded-[28px]">
      <div className="border-b border-slate-200/80 px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="dashboard-kicker">Roster Management</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
              Students
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Review every registered student, monitoring status, and connection quality for the session.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:min-w-[300px]">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Total students
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{students.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Normal status
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{normalCount}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto scroll-thin">
        <table className="min-w-full">
          <thead className="bg-slate-50/80">
            <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <th className="px-6 py-4">Student</th>
              <th className="px-6 py-4">ID</th>
              <th className="px-6 py-4">Exam</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Connection</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr
                key={student.id}
                className="border-t border-slate-200/80 bg-white transition-colors hover:bg-slate-50/80"
              >
                <td className="px-6 py-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{student.name}</p>
                    <p className="mt-1 text-xs text-slate-400">Active roster entry</p>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm font-medium text-slate-600">{student.id}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{student.exam}</td>
                <td className="px-6 py-4">
                  <StatusBadge status={student.status} />
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${connectionTone[student.connection]}`}
                  >
                    {student.connection}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
