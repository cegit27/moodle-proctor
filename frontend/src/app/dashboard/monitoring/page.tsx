"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiAlertTriangle,
  FiClock,
  FiCopy,
  FiLoader,
  FiPlus,
  FiSave,
  FiSlash,
  FiTrash2,
  FiUsers,
  FiVideo,
} from "react-icons/fi";

import { RoomCreationModal } from "@components/RoomCreationModal";
import { RoomSelector } from "@components/RoomSelector";
import { MonitoringStudentSelection, StudentsGrid } from "@components/StudentsGrid";
import { useActiveRooms } from "@/hooks/useTeacherData";
import {
  backendAPI,
  type ProctoringRoomSummary,
  type RoomMonitoringStudent,
} from "@/lib/backend";
import { formatDateTime, getRiskStatus } from "@/lib/dashboard";
import { StatusBadge } from "@components/StatusBadge";

const LAST_ROOM_STORAGE_KEY = "teacher-monitoring:last-room-code";
const ROOM_STUDENT_POLL_INTERVAL_MS = 2500;

interface AttemptViolation {
  id: number;
  violationType: string;
  severity: string;
  detail: string | null;
  occurredAt: string;
}

function getStudentLaunchLink(roomCode: string, examName?: string, courseName?: string) {
  const params = new URLSearchParams({ code: roomCode });

  if (examName) {
    params.set("exam", examName);
  }

  if (courseName) {
    params.set("course", courseName);
  }

  if (typeof window === "undefined") {
    return `/student-demo?${params.toString()}`;
  }

  return new URL(`/student-demo?${params.toString()}`, window.location.origin).toString();
}

function getDesktopInviteLink(roomCode: string) {
  return `proctor://room/${roomCode}`;
}

export default function LiveMonitoringPage() {
  const { rooms, isLoading: roomsLoading, refetch: refetchRooms } = useActiveRooms();
  const [currentRoomCode, setCurrentRoomCode] = useState<string | undefined>(undefined);
  const [isRoomSelectorOpen, setIsRoomSelectorOpen] = useState(false);
  const [isRoomCreationOpen, setIsRoomCreationOpen] = useState(false);
  const [roomActionError, setRoomActionError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<"code" | "launch" | "invite" | null>(null);
  const [isClosingRoom, setIsClosingRoom] = useState(false);
  const [isDeletingRoom, setIsDeletingRoom] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<MonitoringStudentSelection | null>(null);
  const [selectedViolations, setSelectedViolations] = useState<AttemptViolation[]>([]);
  const [isLoadingViolations, setIsLoadingViolations] = useState(false);
  const [roomStudents, setRoomStudents] = useState<RoomMonitoringStudent[]>([]);
  const [isLoadingRoomStudents, setIsLoadingRoomStudents] = useState(false);
  const [roomCapacityDraft, setRoomCapacityDraft] = useState<number>(15);
  const [isSavingRoomCapacity, setIsSavingRoomCapacity] = useState(false);
  const hasHydratedRoom = useRef(false);

  const currentRoom = useMemo(
    () => rooms.find((room) => room.roomCode === currentRoomCode) ?? null,
    [rooms, currentRoomCode]
  );

  useEffect(() => {
    if (typeof window === "undefined" || hasHydratedRoom.current || roomsLoading) {
      return;
    }

    hasHydratedRoom.current = true;

    const storedRoomCode = window.localStorage.getItem(LAST_ROOM_STORAGE_KEY);
    const initialRoom = rooms.find((room) => room.roomCode === storedRoomCode) ?? rooms[0];

    if (initialRoom) {
      setCurrentRoomCode(initialRoom.roomCode);
    }
  }, [rooms, roomsLoading]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (currentRoomCode) {
      window.localStorage.setItem(LAST_ROOM_STORAGE_KEY, currentRoomCode);
    } else {
      window.localStorage.removeItem(LAST_ROOM_STORAGE_KEY);
    }
  }, [currentRoomCode]);

  useEffect(() => {
    if (!currentRoom && rooms.length > 0) {
      setCurrentRoomCode(rooms[0].roomCode);
    }
  }, [currentRoom, rooms]);

  useEffect(() => {
    setSelectedStudent(null);
    setSelectedViolations([]);
  }, [currentRoom?.id]);

  useEffect(() => {
    if (currentRoom) {
      setRoomCapacityDraft(currentRoom.capacity);
    }
  }, [currentRoom]);

  const fetchRoomStudents = useCallback(async () => {
    if (!currentRoom) {
      setRoomStudents([]);
      setIsLoadingRoomStudents(false);
      return;
    }

    try {
      const response = await backendAPI.getRoomStudents(currentRoom.id);
      if (response.success) {
        setRoomStudents(response.data);
      }
    } catch (error) {
      console.error("Failed to load room students:", error);
      setRoomStudents([]);
    } finally {
      setIsLoadingRoomStudents(false);
    }
  }, [currentRoom]);

  useEffect(() => {
    if (!currentRoom) {
      setRoomStudents([]);
      setIsLoadingRoomStudents(false);
      return;
    }

    setIsLoadingRoomStudents(true);
    void fetchRoomStudents();
    const timerId = window.setInterval(() => {
      void fetchRoomStudents();
    }, ROOM_STUDENT_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(timerId);
    };
  }, [currentRoom, fetchRoomStudents]);

  const flaggedStudents = useMemo(
    () =>
      roomStudents
        .filter((student) => student.warningCount > 0)
        .sort((a, b) => b.warningCount - a.warningCount),
    [roomStudents]
  );

  const selectedMonitoredStudent = useMemo(() => {
    if (!selectedStudent) {
      return null;
    }

    return (
      roomStudents.find(
        (student) =>
          selectedStudent.enrollmentId &&
          student.enrollmentId === selectedStudent.enrollmentId
      ) ??
      roomStudents.find(
        (student) => selectedStudent.attemptId && student.attemptId === selectedStudent.attemptId
      ) ??
      roomStudents.find(
        (student) => selectedStudent.userId && student.userId === selectedStudent.userId
      ) ??
      roomStudents.find(
        (student) =>
          selectedStudent.studentEmail &&
          student.studentEmail.toLowerCase() === selectedStudent.studentEmail.toLowerCase()
      ) ??
      roomStudents.find((student) => student.studentName === selectedStudent.studentName)
      ?? null
    );
  }, [roomStudents, selectedStudent]);

  useEffect(() => {
    if (selectedMonitoredStudent) {
      return;
    }

    if (flaggedStudents.length > 0) {
      setSelectedStudent({
        enrollmentId: flaggedStudents[0].enrollmentId,
        attemptId: flaggedStudents[0].attemptId,
        userId: flaggedStudents[0].userId,
        studentName: flaggedStudents[0].studentName,
        studentEmail: flaggedStudents[0].studentEmail,
      });
      return;
    }

    if (roomStudents.length > 0) {
      setSelectedStudent({
        enrollmentId: roomStudents[0].enrollmentId,
        attemptId: roomStudents[0].attemptId,
        userId: roomStudents[0].userId,
        studentName: roomStudents[0].studentName,
        studentEmail: roomStudents[0].studentEmail,
      });
      return;
    }

    setSelectedStudent(null);
  }, [flaggedStudents, roomStudents, selectedMonitoredStudent]);

  useEffect(() => {
    const attemptId = selectedMonitoredStudent?.attemptId;

    if (!attemptId) {
      setSelectedViolations([]);
      return;
    }

    const loadViolations = async () => {
      setIsLoadingViolations(true);

      try {
        const response = await backendAPI.getAttemptViolations(attemptId);
        if (response.success) {
          setSelectedViolations((response.data.violations || []) as AttemptViolation[]);
        }
      } catch (error) {
        console.error("Failed to load attempt violations:", error);
        setSelectedViolations([]);
      } finally {
        setIsLoadingViolations(false);
      }
    };

    loadViolations().catch(console.error);
  }, [selectedMonitoredStudent?.attemptId]);

  const handleRoomSelect = useCallback((room: ProctoringRoomSummary) => {
    setCurrentRoomCode(room.roomCode);
    setRoomActionError(null);
  }, []);

  const handleRoomCreated = useCallback(
    (room: {
      roomId: number;
      roomCode: string;
      inviteLink: string;
      examName: string;
      courseName: string;
      launchLink: string;
    }) => {
      setCurrentRoomCode(room.roomCode);
      setRoomActionError(null);
      refetchRooms().catch(console.error);
    },
    [refetchRooms]
  );

  const handleCopy = useCallback(async (value: string, kind: "code" | "launch" | "invite") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(kind);
      window.setTimeout(() => setCopiedField(null), 1800);
    } catch (error) {
      console.error("Failed to copy room detail:", error);
      setRoomActionError("Unable to copy that value right now.");
    }
  }, []);

  const handleCloseCurrentRoom = useCallback(async () => {
    if (!currentRoom) {
      return;
    }

    const confirmed = window.confirm(`End room ${currentRoom.roomCode}? Students will not be able to join after this.`);
    if (!confirmed) {
      return;
    }

    setIsClosingRoom(true);
    setRoomActionError(null);

    try {
      await backendAPI.closeRoom(currentRoom.id);
      await refetchRooms();
      setCurrentRoomCode(undefined);
    } catch (error) {
      setRoomActionError(error instanceof Error ? error.message : "Failed to end room");
    } finally {
      setIsClosingRoom(false);
    }
  }, [currentRoom, refetchRooms]);

  const handleDeleteRoom = useCallback(async (room: ProctoringRoomSummary) => {
    const confirmed = window.confirm(`Delete room ${room.roomCode}?`);
    if (!confirmed) {
      return;
    }

    setIsDeletingRoom(true);
    setRoomActionError(null);

    try {
      await backendAPI.deleteRoom(room.id);
      await refetchRooms();

      if (currentRoomCode === room.roomCode) {
        setCurrentRoomCode(undefined);
      }
    } catch (error) {
      setRoomActionError(error instanceof Error ? error.message : "Failed to delete room");
    } finally {
      setIsDeletingRoom(false);
    }
  }, [currentRoomCode, refetchRooms]);

  const handleSaveRoomCapacity = useCallback(async () => {
    if (!currentRoom) {
      return;
    }

    setIsSavingRoomCapacity(true);
    setRoomActionError(null);

    try {
      await backendAPI.updateRoom(currentRoom.id, {
        capacity: roomCapacityDraft,
      });
      await refetchRooms();
    } catch (error) {
      setRoomActionError(error instanceof Error ? error.message : "Failed to update room capacity");
    } finally {
      setIsSavingRoomCapacity(false);
    }
  }, [currentRoom, roomCapacityDraft, refetchRooms]);

  const launchLink = currentRoom
    ? getStudentLaunchLink(currentRoom.roomCode, currentRoom.examName, currentRoom.courseName)
    : "";
  const desktopInviteLink = currentRoom ? getDesktopInviteLink(currentRoom.roomCode) : "";

  return (
    <section className="space-y-5">
      <article className="rounded-[20px] border border-slate-200 bg-white px-5 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Monitoring room</h2>
            <p className="mt-1 text-sm text-slate-600">
              Create a room, share the student link, and click a student to view warnings.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setIsRoomCreationOpen(true)} className="btn-primary">
              <FiPlus className="h-4 w-4" />
              Create room
            </button>
            <button type="button" onClick={() => setIsRoomSelectorOpen(true)} className="btn-secondary">
              <FiVideo className="h-4 w-4" />
              Switch room
            </button>
          </div>
        </div>

        {roomActionError ? (
          <div className="mt-4 rounded-[16px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {roomActionError}
          </div>
        ) : null}

        {currentRoom ? (
          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-sm font-semibold text-slate-900">{currentRoom.examName}</p>
              <p className="mt-1 text-sm text-slate-600">{currentRoom.courseName}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-sm text-slate-700">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                  Room code: <span className="font-semibold">{currentRoom.roomCode}</span>
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                  <FiUsers className="mr-1 inline h-4 w-4" />
                  {currentRoom.studentCount} students
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                  <FiClock className="mr-1 inline h-4 w-4" />
                  {currentRoom.durationMinutes} min
                </span>
              </div>
            </div>

            <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-sm font-semibold text-slate-900">Share with students</p>
              <div className="mt-3 grid gap-2">
                <div className="flex gap-2">
                  <input readOnly value={launchLink} className="input-field flex-1 text-sm" />
                  <button type="button" onClick={() => handleCopy(launchLink, "launch")} className="btn-secondary">
                    {copiedField === "launch" ? "Copied" : "Copy link"}
                  </button>
                </div>
                <div className="flex gap-2">
                  <input readOnly value={desktopInviteLink} className="input-field flex-1 text-sm" />
                  <button type="button" onClick={() => handleCopy(desktopInviteLink, "invite")} className="btn-secondary">
                    {copiedField === "invite" ? "Copied" : "Copy desktop"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <div className="flex items-center gap-2 rounded-[12px] border border-slate-200 bg-white px-2 py-2">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={roomCapacityDraft}
                      onChange={(event) => setRoomCapacityDraft(Number(event.target.value) || 1)}
                      aria-label="Student limit"
                      title="Maximum students allowed in this room"
                      className="w-20 rounded-[10px] border border-slate-200 px-3 py-2 text-sm text-slate-700"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSaveRoomCapacity()}
                      disabled={isSavingRoomCapacity}
                      className="btn-secondary"
                    >
                      {isSavingRoomCapacity ? (
                        <FiLoader className="h-4 w-4 animate-spin" />
                      ) : (
                        <FiSave className="h-4 w-4" />
                      )}
                      Save limit
                    </button>
                  </div>
                  <button type="button" onClick={() => handleCopy(currentRoom.roomCode, "code")} className="btn-secondary">
                    <FiCopy className="h-4 w-4" />
                    {copiedField === "code" ? "Code copied" : "Copy room code"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseCurrentRoom}
                    disabled={isClosingRoom}
                    className="inline-flex items-center gap-2 rounded-[12px] border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700"
                  >
                    {isClosingRoom ? <FiLoader className="h-4 w-4 animate-spin" /> : <FiSlash className="h-4 w-4" />}
                    End room
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteRoom(currentRoom)}
                    disabled={isDeletingRoom}
                    className="inline-flex items-center gap-2 rounded-[12px] border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                  >
                    {isDeletingRoom ? <FiLoader className="h-4 w-4 animate-spin" /> : <FiTrash2 className="h-4 w-4" />}
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            {roomsLoading ? "Loading rooms..." : "No room selected yet."}
          </div>
        )}
      </article>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.45fr)_360px]">
        <div className="space-y-5">
          <StudentsGrid
            roomId={currentRoom?.roomCode}
            roomStudents={roomStudents}
            onStudentSelect={setSelectedStudent}
            selectedStudentName={selectedStudent?.studentName ?? null}
          />

          <section className="rounded-[20px] border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-950">Active rooms</h3>
                  <p className="mt-1 text-sm text-slate-600">Switch between live rooms here.</p>
                </div>
                <button type="button" onClick={() => refetchRooms()} className="btn-secondary" disabled={roomsLoading}>
                  {roomsLoading ? <FiLoader className="h-4 w-4 animate-spin" /> : "Refresh"}
                </button>
              </div>
            </div>

            <div className="px-5 py-4">
              {rooms.length === 0 ? (
                <div className="text-sm text-slate-500">No active rooms.</div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-2">
                  {rooms.map((room) => {
                    const isCurrent = room.roomCode === currentRoomCode;

                    return (
                      <button
                        key={room.id}
                        type="button"
                        onClick={() => handleRoomSelect(room)}
                        className={`rounded-[16px] border px-4 py-4 text-left ${
                          isCurrent ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-slate-50"
                        }`}
                      >
                        <p className="text-sm font-semibold text-slate-900">{room.examName}</p>
                        <p className="mt-1 text-sm text-slate-600">{room.courseName}</p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                          <span>{room.roomCode}</span>
                          <span>{room.studentCount} students</span>
                          <span>{room.durationMinutes} min</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[20px] border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-4">
              <h3 className="text-base font-semibold text-slate-950">Students needing attention</h3>
              <p className="mt-1 text-sm text-slate-600">Highest warning counts in this room.</p>
            </div>

            <div className="max-h-[420px] overflow-y-auto px-4 py-4">
              {flaggedStudents.length === 0 ? (
                <div className="text-sm text-slate-500">No warnings in this room right now.</div>
              ) : (
                <div className="space-y-3">
                  {flaggedStudents.map((student) => {
                    const isSelected = selectedMonitoredStudent?.enrollmentId === student.enrollmentId;

                    return (
                      <button
                        key={student.enrollmentId}
                        type="button"
                        onClick={() =>
                          setSelectedStudent({
                            enrollmentId: student.enrollmentId,
                            attemptId: student.attemptId,
                            userId: student.userId,
                            studentName: student.studentName,
                            studentEmail: student.studentEmail,
                          })
                        }
                        className={`w-full rounded-[14px] border px-3 py-3 text-left ${
                          isSelected ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-slate-50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{student.studentName}</p>
                            <p className="mt-1 text-xs text-slate-500">{student.studentEmail}</p>
                          </div>
                          <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-amber-700">
                            <FiAlertTriangle className="h-3.5 w-3.5" />
                            {student.warningCount}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-[20px] border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-4">
              <h3 className="text-base font-semibold text-slate-950">Student details</h3>
              <p className="mt-1 text-sm text-slate-600">Warnings and status for the selected student.</p>
            </div>

            <div className="px-4 py-4">
              {isLoadingRoomStudents ? (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <FiLoader className="h-4 w-4 animate-spin" />
                  Loading student details...
                </div>
              ) : selectedMonitoredStudent ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-lg font-semibold text-slate-950">{selectedMonitoredStudent.studentName}</p>
                    <p className="mt-1 text-sm text-slate-600">{selectedMonitoredStudent.studentEmail}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <StatusBadge status={getRiskStatus(selectedMonitoredStudent.warningCount)} />
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700">
                      {selectedMonitoredStudent.warningCount} warnings
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700">
                      {selectedMonitoredStudent.status.replace("_", " ")}
                    </span>
                  </div>

                  <div className="grid gap-3">
                    <div className="rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Exam</p>
                      <p className="mt-1 text-sm text-slate-900">{currentRoom?.examName || "Exam"}</p>
                    </div>
                    <div className="rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Started</p>
                      <p className="mt-1 text-sm text-slate-900">
                        {selectedMonitoredStudent.startedAt
                          ? formatDateTime(selectedMonitoredStudent.startedAt)
                          : "Not started yet"}
                      </p>
                    </div>
                    <div className="rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">IP address</p>
                      <p className="mt-1 text-sm text-slate-900">
                        {selectedMonitoredStudent.ipAddress || "Not available"}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-[14px] border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                    {selectedMonitoredStudent.warningCount > 0
                      ? `${selectedMonitoredStudent.warningCount} proctoring warning${selectedMonitoredStudent.warningCount === 1 ? "" : "s"} recorded in this room.`
                      : "No warnings recorded for this student in this room yet."}
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-slate-900">Recorded warnings</p>
                    {isLoadingViolations ? (
                      <div className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                        <FiLoader className="h-4 w-4 animate-spin" />
                        Loading warnings...
                      </div>
                    ) : selectedViolations.length === 0 ? (
                      <div className="mt-2 rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                        No detailed warning entries for this attempt.
                      </div>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {selectedViolations.slice(0, 8).map((violation) => (
                          <div
                            key={violation.id}
                            className="rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">
                                  {violation.violationType.replace(/_/g, " ")}
                                </p>
                                <p className="mt-1 text-sm text-slate-600">
                                  {violation.detail || "No extra detail recorded."}
                                </p>
                              </div>
                              <span className="text-xs text-slate-500">
                                {formatDateTime(violation.occurredAt)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-500">
                  Click a student tile to see details here.
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>

      <RoomSelector
        isOpen={isRoomSelectorOpen}
        onClose={() => setIsRoomSelectorOpen(false)}
        currentRoomCode={currentRoomCode}
        onRoomSelect={handleRoomSelect}
      />

      <RoomCreationModal
        isOpen={isRoomCreationOpen}
        onClose={() => setIsRoomCreationOpen(false)}
        onRoomCreated={handleRoomCreated}
      />
    </section>
  );
}
