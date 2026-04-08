"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FiAlertTriangle, FiMonitor, FiSmartphone } from "react-icons/fi";

import { backendAPI, type RoomMonitoringStudent } from "@/lib/backend";
import {
  formatTimeOnly,
  getAlertSeverity,
  getRiskStatus
} from "@/lib/dashboard";
import { StatusBadge } from "./StatusBadge";

interface Props {
  roomId?: number;
  roomLabel?: string;
}

const alertIcon = (severity: "low" | "medium" | "high") => {
  if (severity === "high") {
    return <FiAlertTriangle className="h-4 w-4 text-red-600" />;
  }

  if (severity === "medium") {
    return <FiSmartphone className="h-4 w-4 text-amber-600" />;
  }

  return <FiMonitor className="h-4 w-4 text-blue-600" />;
};

const severityPill = (severity: "low" | "medium" | "high") => {
  if (severity === "high") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (severity === "medium") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-blue-200 bg-blue-50 text-blue-700";
};

const severityBorder = (severity: "low" | "medium" | "high") => {
  if (severity === "high") {
    return "border-red-200/80";
  }
  if (severity === "medium") {
    return "border-amber-200/80";
  }
  return "border-blue-200/80";
};

export const AlertPanel = ({ roomId, roomLabel }: Props) => {
  const [students, setStudents] = useState<RoomMonitoringStudent[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(roomId));
  const [error, setError] = useState<Error | null>(null);

  const fetchAlerts = useCallback(async () => {
    if (!roomId) {
      setStudents([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await backendAPI.getRoomStudents(roomId);
      if (response.success) {
        setStudents(response.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to load room alerts"));
      setStudents([]);
    } finally {
      setIsLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    void fetchAlerts();

    if (!roomId) {
      return;
    }

    const timerId = window.setInterval(() => {
      void fetchAlerts();
    }, 2500);

    return () => {
      window.clearInterval(timerId);
    };
  }, [fetchAlerts, roomId]);

  const attentionQueue = useMemo(
    () =>
      students
        .filter((student) => student.warningCount > 0)
        .sort((a, b) => {
          if (b.warningCount !== a.warningCount) {
            return b.warningCount - a.warningCount;
          }

          return new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime();
        })
        .slice(0, 8)
        .map((student) => ({
          id: student.enrollmentId,
          studentName: student.studentName,
          studentLabel: student.studentEmail,
          severity: getAlertSeverity(student.warningCount),
          message:
            student.warningCount === 1
              ? "1 room warning requires review."
              : `${student.warningCount} room warnings require review.`,
          timestamp: formatTimeOnly(student.submittedAt || student.startedAt),
          examName: roomLabel || "Current room",
          riskStatus: getRiskStatus(student.warningCount)
        })),
    [roomLabel, students]
  );

  const highPriority = attentionQueue.filter((alert) => alert.severity === "high").length;
  const mediumPriority = attentionQueue.filter((alert) => alert.severity === "medium").length;

  return (
    <section className="surface-panel table-shell">
      <div className="border-b border-slate-200/80 px-5 py-5 md:px-6 md:py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <span className="eyebrow-pill">Incident queue</span>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
              Alerts waiting for review
            </h2>
            <p className="section-copy mt-3 max-w-2xl">
              {roomLabel
                ? `Warnings for ${roomLabel} surface here first so teachers can triage one room at a time.`
                : "Select an active room to see its warning queue."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:min-w-[18rem]">
            <div className="metric-card">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">High</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                {isLoading ? "..." : highPriority}
              </p>
            </div>
            <div className="metric-card">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Medium</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                {isLoading ? "..." : mediumPriority}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-h-[780px] space-y-3 overflow-y-auto px-4 py-4 md:px-5 md:py-5 scroll-thin">
        {error ? (
          <div className="rounded-[24px] border border-red-200 bg-red-50 px-4 py-4 text-sm font-medium text-red-700">
            {error.message}
          </div>
        ) : null}

        {!error && !roomId && (
          <div className="empty-state">
            No room selected yet.
          </div>
        )}

        {!error && roomId &&
          attentionQueue.map((alert) => (
            <article
              key={alert.id}
              className={`surface-card rounded-[24px] border px-4 py-4 ${severityBorder(alert.severity)}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100">
                    {alertIcon(alert.severity)}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-950">{alert.studentName}</p>
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${severityPill(
                          alert.severity
                        )}`}
                      >
                        {alert.severity}
                      </span>
                      <StatusBadge status={alert.riskStatus} />
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{alert.examName}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{alert.message}</p>
                    <p className="mt-2 text-xs text-slate-400">{alert.studentLabel}</p>
                  </div>
                </div>

                <span className="whitespace-nowrap text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                  {alert.timestamp}
                </span>
              </div>
            </article>
          ))}

        {!error && roomId && !isLoading && attentionQueue.length === 0 && (
          <div className="empty-state">
            No room warnings are waiting for review right now.
          </div>
        )}

        {roomId && isLoading && (
          <div className="empty-state">
            Loading incident queue...
          </div>
        )}
      </div>
    </section>
  );
};
