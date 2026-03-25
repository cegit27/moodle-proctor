"use client";

import { useState, useCallback } from "react";
import { AlertPanel } from "@components/AlertPanel";
import { StudentsGrid } from "@components/StudentsGrid";
import { alerts, students } from "@mock/data";
import { FiActivity, FiShield, FiUsers } from "react-icons/fi";

const suspiciousCount = students.filter((student) => student.status === "suspicious").length;

const workspaceStats = [
  {
    label: "Students in session",
    value: students.length,
    icon: <FiUsers className="h-4 w-4" />
  },
  {
    label: "Open alerts",
    value: alerts.length,
    icon: <FiActivity className="h-4 w-4" />
  },
  {
    label: "Priority cases",
    value: suspiciousCount,
    icon: <FiShield className="h-4 w-4" />
  }
];

export default function LiveMonitoringPage() {
  const [currentRoomId, setCurrentRoomId] = useState<number | undefined>(undefined);
  const [isRoomSelectorOpen, setIsRoomSelectorOpen] = useState(false);
  const [isRoomCreationOpen, setIsRoomCreationOpen] = useState(false);

  // Handle room switch
  const handleRoomSelect = useCallback((roomId: number) => {
    setCurrentRoomId(roomId);
    // Note: Room switching logic with 2s debounce is handled inside RoomSelector
  }, []);

  // Handle room creation
  const handleRoomCreated = useCallback((room: { roomId: number; roomCode: string; inviteLink: string }) => {
    setCurrentRoomId(room.roomId);
    // Automatically switch to the newly created room
    console.log('[Monitoring] Room created:', room);
  }, []);

  return (
    <section className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <div className="dashboard-panel rounded-[28px] p-5 md:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className="dashboard-kicker">Monitoring Workspace</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                  Live proctoring board for the active exam room
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Keep the grid centered on student presence, escalate suspicious cases faster,
                  and maintain a cleaner operator view throughout the exam session.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {workspaceStats.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-4"
                  >
                    <div className="flex items-center justify-between text-slate-500">
                      <span className="text-sm font-medium">{stat.label}</span>
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                        {stat.icon}
                      </span>
                    </div>
                    <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <StudentsGrid />
        </div>

        <div className="xl:sticky xl:top-6 xl:self-start">
          <AlertPanel />
        </div>
      </div>
    </section>
  );
}
