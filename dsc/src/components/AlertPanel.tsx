import { alerts, students } from "@mock/data";
import type { Alert } from "@app-types/index";
import { FiAlertTriangle, FiMic, FiMonitor, FiSmartphone } from "react-icons/fi";

const alertIcon = (type: Alert["type"]) => {
  switch (type) {
    case "multiple_faces":
      return <FiAlertTriangle className="h-4 w-4 text-red-400" />;
    case "phone_detected":
      return <FiSmartphone className="h-4 w-4 text-amber-300" />;
    case "left_screen":
      return <FiMonitor className="h-4 w-4 text-rose-300" />;
    case "background_voice":
      return <FiMic className="h-4 w-4 text-sky-300" />;
  }
};

const severityTone = (severity: Alert["severity"]) => {
  if (severity === "high") return "text-red-400";
  if (severity === "medium") return "text-amber-300";
  return "text-sky-300";
};

export const AlertPanel = () => {
  return (
    <section className="glass-surface rounded-xl">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div>
          <h2 className="section-title">AI Alerts</h2>
          <p className="section-copy">Recent flagged events</p>
        </div>
        <span className="text-sm text-slate-300">{alerts.length}</span>
      </div>

      <div className="scroll-thin max-h-[520px] space-y-2 overflow-y-auto p-3">
        {alerts.map((alert) => {
          const student = students.find((s) => s.id === alert.studentId);

          return (
            <div key={alert.id} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">{alertIcon(alert.type)}</div>
                  <div>
                    <p className="text-sm text-slate-100">{alert.message}</p>
                    {student && (
                      <p className="mt-1 text-xs text-slate-400">
                        {student.name} · {student.id}
                      </p>
                    )}
                  </div>
                </div>
                <span className="text-xs text-slate-500">{alert.timestamp}</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className={severityTone(alert.severity)}>{alert.severity}</span>
                <button className="text-sky-300 hover:text-sky-200">Review</button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
