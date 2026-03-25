import { useState, useEffect, useCallback, useRef } from "react";
import { students } from "@mock/data";
import type { Alert } from "@app-types/index";
import { FiAlertTriangle, FiMic, FiMonitor, FiSmartphone } from "react-icons/fi";

interface Props {
  roomId?: number; // Room ID for SSE filtering
  apiUrl?: string; // Backend API URL
}

const alertIcon = (type: Alert["type"]) => {
  switch (type) {
    case "multiple_faces":
      return <FiAlertTriangle className="h-4 w-4 text-red-600" />;
    case "phone_detected":
      return <FiSmartphone className="h-4 w-4 text-amber-600" />;
    case "left_screen":
      return <FiMonitor className="h-4 w-4 text-red-600" />;
    case "background_voice":
      return <FiMic className="h-4 w-4 text-blue-600" />;
  }
};

const severityPill = (severity: Alert["severity"]) => {
  if (severity === "high") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (severity === "medium") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-blue-200 bg-blue-50 text-blue-700";
};

export const AlertPanel = () => {
  const highPriority = alerts.filter((alert) => alert.severity === "high").length;
  const mediumPriority = alerts.filter((alert) => alert.severity === "medium").length;

  return (
    <aside className="dashboard-panel rounded-[28px]">
      <div className="border-b border-slate-200/80 px-5 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="dashboard-kicker">Incident Queue</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">
              AI alerts
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Review the latest anomalies detected during the active monitoring session.
            </p>
          </div>
          <span className="rounded-full bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white">
            {alerts.length}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
              High
            </p>
            <p className="mt-2 text-2xl font-semibold text-red-900">{highPriority}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
              Medium
            </p>
            <p className="mt-2 text-2xl font-semibold text-amber-900">{mediumPriority}</p>
          </div>
        </div>
      </div>

      <div className="max-h-[760px] space-y-3 overflow-y-auto px-4 py-4 scroll-thin">
        {alerts.map((alert) => {
          const student = students.find((studentItem) => studentItem.id === alert.studentId);

          return (
            <article
              key={alert.id}
              className="rounded-[22px] border border-slate-200 bg-white px-4 py-4 shadow-sm shadow-slate-200/40"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100">
                  {alertIcon(alert.type)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold leading-6 text-slate-900">
                      {alert.message}
                    </p>
                    <span className="whitespace-nowrap text-xs font-medium text-slate-400">
                      {alert.timestamp}
                    </span>
                  </div>

                  {student && (
                    <p className="mt-2 text-sm text-slate-500">
                      <span className="font-semibold text-slate-700">{student.name}</span>
                      {" / "}
                      {student.id}
                    </p>
                  )}

                  <div className="mt-3 flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${severityPill(
                        alert.severity
                      )}`}
                    >
                      {alert.severity === "high"
                        ? "High priority"
                        : alert.severity === "medium"
                        ? "Medium priority"
                        : "Low priority"}
                    </span>
                  </div>
                </div>
              </div>
            </article>
          );
        })}

        {alerts.length === 0 && (
          <div className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            No alerts at the moment.
          </div>
        )}
      </div>
    </aside>
  );
};
