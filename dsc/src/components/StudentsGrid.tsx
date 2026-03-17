import { monitoringStudents } from "@mock/data";
import { StudentCard } from "./StudentCard";

export const StudentsGrid = () => {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="section-title">Live Monitoring</h2>
          <p className="mt-1 text-xs text-slate-400">{monitoringStudents.length} students on screen</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {monitoringStudents.map((student) => (
          <StudentCard key={student.id} student={student} />
        ))}
      </div>
    </section>
  );
};
