import type { Student } from "@app-types/index";
import { StatusBadge } from "./StatusBadge";

interface Props {
  student: Student;
}

export const StudentCard = ({ student }: Props) => {
  const connectionTone =
    student.connection === "Excellent"
      ? "text-emerald-400"
      : student.connection === "Good"
      ? "text-emerald-300"
      : student.connection === "Fair"
      ? "text-amber-300"
      : "text-red-400";

  return (
    <article className="glass-surface rounded-xl p-4">
      <div className="mb-4 flex aspect-video items-center justify-center rounded-lg border border-dashed border-slate-800 bg-slate-950 text-xs text-slate-500">
        Camera feed
      </div>

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-100">{student.name}</p>
          <p className="mt-1 text-xs text-slate-400">
            {student.id} · {student.exam}
          </p>
        </div>
        <StatusBadge status={student.status} />
      </div>

      <div className="mt-4 flex items-center justify-between text-xs">
        <span className="text-slate-400">Connection</span>
        <span className={connectionTone}>{student.connection}</span>
      </div>
    </article>
  );
};
