"use client";

import { useEffect, useMemo, useState } from "react";
import { FiCheck, FiCopy, FiLoader, FiPlus, FiSearch, FiX } from "react-icons/fi";

import { backendAPI, type CreatedRoomDetails, type TeacherExam } from "@/lib/backend";

interface CreatedRoomResult extends CreatedRoomDetails {
  launchLink: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onRoomCreated: (room: CreatedRoomResult) => void;
}

export const RoomCreationModal = ({ isOpen, onClose, onRoomCreated }: Props) => {
  const [exams, setExams] = useState<TeacherExam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoadingExams, setIsLoadingExams] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [roomCapacity, setRoomCapacity] = useState<number>(15);
  const [error, setError] = useState<string | null>(null);
  const [createdRoom, setCreatedRoom] = useState<CreatedRoomResult | null>(null);
  const [copiedField, setCopiedField] = useState<"launch" | "invite" | "code" | null>(null);

  const filteredExams = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) {
      return exams;
    }

    return exams.filter((exam) =>
      `${exam.examName} ${exam.courseName}`.toLowerCase().includes(query)
    );
  }, [exams, searchTerm]);

  const selectedExam = filteredExams.find((exam) => exam.id === selectedExamId)
    ?? exams.find((exam) => exam.id === selectedExamId)
    ?? null;

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm("");
      setSelectedExamId(null);
      setCreatedRoom(null);
      setCopiedField(null);
      setRoomCapacity(15);
      setError(null);
      return;
    }

    const fetchExams = async () => {
      setIsLoadingExams(true);
      setError(null);

      try {
        const response = await backendAPI.getExams();
        if (response.success) {
          const nextExams = response.data.exams || [];
          setExams(nextExams);
          setSelectedExamId((current) => current ?? nextExams[0]?.id ?? null);
          setRoomCapacity(nextExams[0]?.roomCapacity ?? 15);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load exams");
      } finally {
        setIsLoadingExams(false);
      }
    };

    fetchExams().catch(console.error);
  }, [isOpen]);

  useEffect(() => {
    if (!filteredExams.length) {
      return;
    }

    const stillSelected = filteredExams.some((exam) => exam.id === selectedExamId);
    if (!stillSelected) {
      setSelectedExamId(filteredExams[0].id);
    }
  }, [filteredExams, selectedExamId]);

  useEffect(() => {
    if (selectedExam) {
      setRoomCapacity(selectedExam.roomCapacity);
    }
  }, [selectedExam]);

  const handleCopy = async (value: string, field: "launch" | "invite" | "code") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 1800);
    } catch (copyError) {
      console.error("Failed to copy room value:", copyError);
    }
  };

  const handleCreateRoom = async () => {
    if (!selectedExamId) {
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const createResponse = await backendAPI.createRoom(selectedExamId, {
        capacity: roomCapacity,
      });
      const { roomId, roomCode, inviteLink, examName, courseName } = createResponse.data;
      await backendAPI.activateRoom(roomId);

      const launchParams = new URLSearchParams({
        code: roomCode,
        exam: examName,
        course: courseName,
      });

      const launchLink =
        typeof window === "undefined"
          ? `/student-demo?${launchParams.toString()}`
          : new URL(`/student-demo?${launchParams.toString()}`, window.location.origin).toString();

      const room = {
        roomId,
        roomCode,
        inviteLink,
        examName,
        courseName,
        launchLink,
      };

      setCreatedRoom(room);
      onRoomCreated(room);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create room");
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isCreating) {
          onClose();
        }
      }}
    >
      <div className="modal-shell max-w-5xl overflow-hidden rounded-[20px] border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">
              {createdRoom ? "Room created" : "Create room"}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {createdRoom
                ? "Copy the student link or room code and continue to live monitoring."
                : "Choose an exam and create one live monitoring room for it."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-6 py-5">
          {createdRoom ? (
            <div className="space-y-4">
              <div className="rounded-[16px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
                Room <span className="font-semibold">{createdRoom.roomCode}</span> is ready for{" "}
                <span className="font-semibold">{createdRoom.examName}</span>.
              </div>

              <div className="grid gap-4">
                <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-sm font-semibold text-slate-900">Student Moodle URL</p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input readOnly value={createdRoom.launchLink} className="input-field flex-1 text-sm" />
                    <button
                      type="button"
                      onClick={() => handleCopy(createdRoom.launchLink, "launch")}
                      className="btn-primary sm:min-w-[6.5rem]"
                    >
                      {copiedField === "launch" ? <FiCheck className="h-4 w-4" /> : <FiCopy className="h-4 w-4" />}
                      {copiedField === "launch" ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-sm font-semibold text-slate-900">Desktop link</p>
                    <div className="mt-3 flex gap-2">
                      <input readOnly value={createdRoom.inviteLink} className="input-field flex-1 text-sm" />
                      <button
                        type="button"
                        onClick={() => handleCopy(createdRoom.inviteLink, "invite")}
                        className="btn-secondary"
                      >
                        {copiedField === "invite" ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-sm font-semibold text-slate-900">Room code</p>
                    <div className="mt-3 flex gap-2">
                      <input readOnly value={createdRoom.roomCode} className="input-field flex-1 font-semibold uppercase" />
                      <button
                        type="button"
                        onClick={() => handleCopy(createdRoom.roomCode, "code")}
                        className="btn-secondary"
                      >
                        {copiedField === "code" ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {error ? (
                <div className="rounded-[16px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <label className="relative block">
                <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search exam or course"
                  className="input-field pl-10"
                />
              </label>

              <div className="rounded-[16px] border border-slate-200 overflow-hidden">
                <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_120px_120px] border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  <span>Exam</span>
                  <span>Course</span>
                  <span>Duration</span>
                  <span>Warnings</span>
                </div>

                {isLoadingExams ? (
                  <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-slate-600">
                    <FiLoader className="h-4 w-4 animate-spin" />
                    Loading exams...
                  </div>
                ) : filteredExams.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-slate-500">
                    No exams available.
                  </div>
                ) : (
                  <div className="max-h-[340px] overflow-y-auto">
                    {filteredExams.map((exam) => {
                      const isSelected = exam.id === selectedExamId;

                      return (
                        <button
                          key={exam.id}
                          type="button"
                          onClick={() => setSelectedExamId(exam.id)}
                          className={`grid w-full grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_120px_120px] items-center gap-3 border-b border-slate-200 px-4 py-3 text-left text-sm ${
                            isSelected ? "bg-emerald-50" : "bg-white hover:bg-slate-50"
                          }`}
                        >
                          <span className="font-medium text-slate-900">{exam.examName}</span>
                          <span className="truncate text-slate-600">{exam.courseName}</span>
                          <span className="text-slate-600">{exam.durationMinutes} min</span>
                          <span className="text-slate-600">{exam.maxWarnings}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {selectedExam ? (
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
                    <p>
                      Selected: <span className="font-semibold text-slate-900">{selectedExam.examName}</span> in{" "}
                      <span className="font-semibold text-slate-900">{selectedExam.courseName}</span>
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
                        {selectedExam.enableAiProctoring ? "AI enabled" : "AI off"}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
                        {selectedExam.enableManualProctoring ? "Manual enabled" : "Manual off"}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
                        {selectedExam.autoSubmitOnWarningLimit
                          ? `Ends at ${selectedExam.maxWarnings} alerts`
                          : "No auto-end"}
                      </span>
                    </div>
                  </div>

                  <label className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-4">
                    <span className="text-sm font-semibold text-slate-900">Room capacity</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={roomCapacity}
                      onChange={(event) => setRoomCapacity(Number(event.target.value) || 1)}
                      className="input-field mt-3"
                    />
                  </label>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          {createdRoom ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setCreatedRoom(null);
                  setCopiedField(null);
                }}
                className="btn-secondary"
              >
                Create another room
              </button>
              <button type="button" onClick={onClose} className="btn-primary">
                Continue
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onClose} className="btn-secondary">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateRoom}
                disabled={!selectedExamId || isCreating || isLoadingExams}
                className="btn-primary"
              >
                {isCreating ? (
                  <>
                    <FiLoader className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <FiPlus className="h-4 w-4" />
                    Create room
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
