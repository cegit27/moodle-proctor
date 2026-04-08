"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FiAlertTriangle, FiLoader, FiShield, FiUsers } from "react-icons/fi";

import { AlertPanel } from "@components/AlertPanel";
import { useActiveRooms } from "@/hooks/useTeacherData";

const LAST_ROOM_STORAGE_KEY = "teacher-monitoring:last-room-code";

export default function AlertsPage() {
  const { rooms, isLoading } = useActiveRooms();
  const [currentRoomCode, setCurrentRoomCode] = useState<string | undefined>(undefined);
  const hasHydratedRoom = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || hasHydratedRoom.current || isLoading) {
      return;
    }

    hasHydratedRoom.current = true;

    const storedRoomCode = window.localStorage.getItem(LAST_ROOM_STORAGE_KEY);
    const initialRoom = rooms.find((room) => room.roomCode === storedRoomCode) ?? rooms[0];

    if (initialRoom) {
      setCurrentRoomCode(initialRoom.roomCode);
    }
  }, [isLoading, rooms]);

  useEffect(() => {
    if (!currentRoomCode || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(LAST_ROOM_STORAGE_KEY, currentRoomCode);
  }, [currentRoomCode]);

  const currentRoom = useMemo(
    () => rooms.find((room) => room.roomCode === currentRoomCode) ?? rooms[0] ?? null,
    [currentRoomCode, rooms]
  );

  const stats = [
    {
      label: "Active rooms",
      value: rooms.length,
      icon: <FiAlertTriangle className="h-5 w-5" />
    },
    {
      label: "Selected room",
      value: currentRoom?.roomCode || "-",
      icon: <FiShield className="h-5 w-5" />
    },
    {
      label: "Students in room",
      value: currentRoom?.studentCount ?? 0,
      icon: <FiUsers className="h-5 w-5" />
    }
  ];

  return (
    <section className="space-y-6">
      <article className="surface-panel section-card">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <span className="eyebrow-pill">Review focus</span>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
              Work the queue from highest signal first
            </h2>
            <p className="section-copy mt-3">
              Alerts are now tied to one active room so the queue matches the live monitoring wall.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.label} className="metric-card min-w-[10rem]">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-sm font-medium">{stat.label}</span>
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                    {stat.icon}
                  </span>
                </div>
                <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
                  {isLoading ? "..." : stat.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </article>

      <section className="surface-panel section-card">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Room focus</h3>
            <p className="mt-1 text-sm text-slate-600">Choose which room this alert queue should follow.</p>
          </div>

          {isLoading ? (
            <div className="inline-flex items-center gap-2 text-sm text-slate-600">
              <FiLoader className="h-4 w-4 animate-spin" />
              Loading rooms...
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {rooms.map((room) => {
                const active = room.roomCode === currentRoom?.roomCode;

                return (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => setCurrentRoomCode(room.roomCode)}
                    className={`rounded-full border px-3 py-2 text-sm ${
                      active
                        ? "border-emerald-500 bg-emerald-50 font-semibold text-emerald-800"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    {room.roomCode}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <AlertPanel roomId={currentRoom?.id} roomLabel={currentRoom?.examName} />
    </section>
  );
}
