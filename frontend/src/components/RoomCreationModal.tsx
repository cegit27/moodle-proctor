"use client";

import { useEffect, useState } from "react";
import { FiCheck, FiCopy, FiLoader, FiPlus, FiX } from "react-icons/fi";

import type { TeacherExam } from "@/lib/backend";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onRoomCreated: (room: { roomId: number; roomCode: string; inviteLink: string }) => void;
  apiUrl?: string;
}

export const RoomCreationModal = ({
  isOpen,
  onClose,
  onRoomCreated,
  apiUrl = "http://localhost:5000"
}: Props) => {
  const [exams, setExams] = useState<TeacherExam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingExams, setIsLoadingExams] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdRoom, setCreatedRoom] = useState<{
    roomCode: string;
    inviteLink: string;
    launchLink: string;
  } | null>(null);
  const [copiedValue, setCopiedValue] = useState<"invite" | "launch" | "code" | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSelectedExamId(null);
      setError(null);
      setCreatedRoom(null);
      setCopiedValue(null);
      return;
    }

    const fetchExams = async () => {
      setIsLoadingExams(true);
      setError(null);

      try {
        const response = await fetch(`${apiUrl}/api/teacher/exams`, {
          credentials: "include"
        });
        const result = await response.json().catch(() => ({}));

        if (!response.ok || !result.success) {
          throw new Error(result.error || "Failed to load exams");
        }

        setExams(result.data.exams || []);
      } catch (err) {
        console.error("[RoomCreation] Error fetching exams:", err);
        setError(err instanceof Error ? err.message : "Failed to load exams");
      } finally {
        setIsLoadingExams(false);
      }
    };

    fetchExams();
  }, [apiUrl, isOpen]);

  const handleCreateRoom = async () => {
    if (!selectedExamId) return;

    setIsCreating(true);
    setError(null);

    try {
      const createResponse = await fetch(`${apiUrl}/api/room/create`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ examId: selectedExamId })
      });

      const createResult = await createResponse.json().catch(() => ({}));

      if (!createResponse.ok || !createResult.success) {
        throw new Error(createResult.error || "Failed to create room");
      }

      const { roomId, roomCode, inviteLink } = createResult.data;

      await fetch(`${apiUrl}/api/room/${roomId}/activate`, {
        method: "POST",
        credentials: "include"
      }).then(async (response) => {
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.error || "Failed to activate room");
        }
      });

      const launchLink = new URL(
        `/student-demo?code=${encodeURIComponent(roomCode)}`,
        window.location.origin
      ).toString();

      setCreatedRoom({ roomCode, inviteLink, launchLink });
      onRoomCreated({ roomId, roomCode, inviteLink });
    } catch (err) {
      console.error("[RoomCreation] Error creating room:", err);
      setError(err instanceof Error ? err.message : "Failed to create room");
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopy = async (value: string, kind: "invite" | "launch" | "code") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(kind);
      setTimeout(() => setCopiedValue(null), 2000);
    } catch (err) {
      console.error("[RoomCreation] Failed to copy:", err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Create Proctoring Room</h2>
            <p className="mt-0.5 text-sm text-gray-600">
              {createdRoom ? "Room created successfully." : "Select an exam to monitor."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 transition-colors hover:text-gray-600"
            disabled={isCreating}
          >
            <FiX className="h-6 w-6" />
          </button>
        </div>

        <div className="px-6 py-4">
          {createdRoom ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <p className="text-sm font-medium text-green-800">Room activated successfully.</p>
                <p className="mt-1 text-xs text-green-600">
                  Share the student launch page so candidates can open the Electron exam app with the room code prefilled.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Student Launch Link</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={createdRoom.launchLink}
                    className="flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-mono"
                  />
                  <button
                    onClick={() => handleCopy(createdRoom.launchLink, "launch")}
                    className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-white transition-colors hover:bg-blue-700"
                  >
                    {copiedValue === "launch" ? <FiCheck className="h-4 w-4" /> : <FiCopy className="h-4 w-4" />}
                    {copiedValue === "launch" ? "Copied!" : "Copy"}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Students open this page in the browser, enter their details, and click proceed to continue in the desktop app.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Desktop Deep Link</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={createdRoom.inviteLink}
                    className="flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-mono"
                  />
                  <button
                    onClick={() => handleCopy(createdRoom.inviteLink, "invite")}
                    className="flex items-center gap-1 rounded-lg bg-gray-900 px-3 py-2 text-white transition-colors hover:bg-gray-700"
                  >
                    {copiedValue === "invite" ? <FiCheck className="h-4 w-4" /> : <FiCopy className="h-4 w-4" />}
                    {copiedValue === "invite" ? "Copied!" : "Copy"}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Use this if the student already has the Electron app open and registered on the machine.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Room Code</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={createdRoom.roomCode}
                    className="flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-center text-lg font-bold"
                  />
                  <button
                    onClick={() => handleCopy(createdRoom.roomCode, "code")}
                    className="rounded-lg bg-gray-600 px-3 py-2 text-white transition-colors hover:bg-gray-700"
                  >
                    {copiedValue === "code" ? <FiCheck className="h-4 w-4" /> : <FiCopy className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {isLoadingExams ? (
                <div className="flex items-center justify-center py-8">
                  <FiLoader className="h-6 w-6 animate-spin text-blue-600" />
                  <span className="ml-2 text-gray-600">Loading exams...</span>
                </div>
              ) : error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                  {error}
                </div>
              ) : exams.length === 0 ? (
                <div className="py-8 text-center text-gray-500">
                  No exams are available yet.
                </div>
              ) : (
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Select Exam</label>
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {exams.map((exam) => (
                      <button
                        key={exam.id}
                        onClick={() => setSelectedExamId(exam.id)}
                        className={[
                          "w-full rounded-lg border-2 p-3 text-left transition-all",
                          selectedExamId === exam.id
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 bg-white hover:border-blue-300"
                        ].join(" ")}
                      >
                        <p className="font-medium text-gray-900">{exam.examName}</p>
                        <p className="text-sm text-gray-600">{exam.courseName}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {!createdRoom ? (
          <div className="flex justify-end gap-2 border-t border-gray-200 bg-gray-50 px-6 py-4">
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50"
              disabled={isCreating}
            >
              Cancel
            </button>
            <button
              onClick={handleCreateRoom}
              disabled={!selectedExamId || isCreating}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCreating ? (
                <>
                  <FiLoader className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <FiPlus className="h-4 w-4" />
                  Create Room
                </>
              )}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};
