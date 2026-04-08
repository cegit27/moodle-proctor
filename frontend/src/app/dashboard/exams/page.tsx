"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FiClock,
  FiEdit2,
  FiFileText,
  FiLoader,
  FiPlus,
  FiTrash2,
  FiVideo,
} from "react-icons/fi";

import { ExamEditorModal } from "@/components/ExamEditorModal";
import { useExams } from "@/hooks/useTeacherData";
import { backendAPI, type TeacherExam, type TeacherExamPayload } from "@/lib/backend";

const LAST_ROOM_STORAGE_KEY = "teacher-monitoring:last-room-code";

const featurePills = (exam: TeacherExam) => [
  exam.enableAiProctoring ? "AI on" : "AI off",
  exam.enableManualProctoring ? "Manual on" : "Manual off",
  exam.autoSubmitOnWarningLimit ? `Auto end at ${exam.maxWarnings}` : "No auto end",
  `${exam.answerSheetUploadWindowMinutes || 30} min upload window`,
  `${exam.roomCapacity} seats`,
];

export default function ExamsPage() {
  const router = useRouter();
  const { exams, isLoading, error, refetch } = useExams();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState<TeacherExam | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingRoomForExamId, setIsCreatingRoomForExamId] = useState<number | null>(null);
  const [isDeletingExamId, setIsDeletingExamId] = useState<number | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const sortedExams = useMemo(
    () =>
      [...exams].sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      ),
    [exams]
  );

  const openCreate = () => {
    setSelectedExam(null);
    setIsEditorOpen(true);
    setPageError(null);
  };

  const openEdit = (exam: TeacherExam) => {
    setSelectedExam(exam);
    setIsEditorOpen(true);
    setPageError(null);
  };

  const handleSave = async (payload: TeacherExamPayload) => {
    setIsSaving(true);
    setPageError(null);

    try {
      if (selectedExam) {
        await backendAPI.updateExam(selectedExam.id, payload);
      } else {
        await backendAPI.createExam(payload);
      }

      await refetch();
      setIsEditorOpen(false);
      setSelectedExam(null);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Unable to save exam";
      setPageError(message);
      throw new Error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (exam: TeacherExam) => {
    const confirmed = window.confirm(
      `Delete "${exam.examName}"? This also removes its rooms and attempts from the backend.`
    );

    if (!confirmed) {
      return;
    }

    setIsDeletingExamId(exam.id);
    setPageError(null);

    try {
      await backendAPI.deleteExam(exam.id);
      await refetch();
    } catch (deleteError) {
      setPageError(deleteError instanceof Error ? deleteError.message : "Unable to delete exam");
    } finally {
      setIsDeletingExamId(null);
    }
  };

  const handleCreateRoom = async (exam: TeacherExam) => {
    setIsCreatingRoomForExamId(exam.id);
    setPageError(null);

    try {
      const createdRoom = await backendAPI.createRoom(exam.id, {
        capacity: exam.roomCapacity,
      });
      await backendAPI.activateRoom(createdRoom.data.roomId);
      window.localStorage.setItem(LAST_ROOM_STORAGE_KEY, createdRoom.data.roomCode);
      router.push("/dashboard/monitoring");
      router.refresh();
    } catch (createRoomError) {
      setPageError(
        createRoomError instanceof Error ? createRoomError.message : "Unable to create room"
      );
    } finally {
      setIsCreatingRoomForExamId(null);
    }
  };

  return (
    <section className="space-y-5">
      <article className="rounded-[20px] border border-slate-200 bg-white px-5 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Exam setup</h2>
            <p className="mt-1 text-sm text-slate-600">
              Create the exam here, then open a live room when you are ready to run it.
            </p>
          </div>
          <button type="button" onClick={openCreate} className="btn-primary">
            <FiPlus className="h-4 w-4" />
            Create exam
          </button>
        </div>

        {pageError ? (
          <div className="mt-4 rounded-[16px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {pageError}
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-[16px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error.message}
          </div>
        ) : null}
      </article>

      <section className="grid gap-4 xl:grid-cols-2">
        {isLoading ? (
          <div className="col-span-full rounded-[20px] border border-slate-200 bg-white px-5 py-8 text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <FiLoader className="h-4 w-4 animate-spin" />
              Loading exams...
            </div>
          </div>
        ) : sortedExams.length === 0 ? (
          <div className="col-span-full rounded-[20px] border border-slate-200 bg-white px-5 py-10 text-center">
            <h3 className="text-lg font-semibold text-slate-950">No exams yet</h3>
            <p className="mt-2 text-sm text-slate-600">
              Create your first exam here, then open a room from this page or from Monitoring.
            </p>
            <button type="button" onClick={openCreate} className="btn-primary mt-5">
              <FiPlus className="h-4 w-4" />
              Create your first exam
            </button>
          </div>
        ) : (
          sortedExams.map((exam) => (
            <article key={exam.id} className="rounded-[20px] border border-slate-200 bg-white px-5 py-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-950">{exam.examName}</h3>
                  <p className="mt-1 text-sm text-slate-600">{exam.courseName}</p>
                  {exam.description ? (
                    <p className="mt-3 text-sm leading-6 text-slate-600">{exam.description}</p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => openEdit(exam)} className="btn-secondary">
                    <FiEdit2 className="h-4 w-4" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCreateRoom(exam)}
                    className="btn-primary"
                    disabled={isCreatingRoomForExamId === exam.id}
                  >
                    {isCreatingRoomForExamId === exam.id ? (
                      <>
                        <FiLoader className="h-4 w-4 animate-spin" />
                        Opening room...
                      </>
                    ) : (
                      <>
                        <FiVideo className="h-4 w-4" />
                        Create room
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(exam)}
                    className="inline-flex items-center gap-2 rounded-[12px] border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                    disabled={isDeletingExamId === exam.id}
                  >
                    {isDeletingExamId === exam.id ? (
                      <FiLoader className="h-4 w-4 animate-spin" />
                    ) : (
                      <FiTrash2 className="h-4 w-4" />
                    )}
                    Delete
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-sm text-slate-700">
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
                  <FiClock className="h-4 w-4" />
                  {exam.durationMinutes} min
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
                  Warning limit {exam.maxWarnings}
                </span>
                {featurePills(exam).map((item) => (
                  <span
                    key={`${exam.id}-${item}`}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5"
                  >
                    {item}
                  </span>
                ))}
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Question paper
                  </p>
                  <p className="mt-2 text-sm text-slate-900">
                    {exam.questionPaperPath
                      ? exam.questionPaperPath.split("/").pop()
                      : "No PDF uploaded yet"}
                  </p>
                </div>
                <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Questions
                  </p>
                  <p className="mt-2 text-sm text-slate-900">
                    {exam.questions.length} question{exam.questions.length === 1 ? "" : "s"} added
                  </p>
                </div>
                <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Schedule
                  </p>
                  <p className="mt-2 text-sm text-slate-900">
                    {exam.scheduledStartAt
                      ? new Intl.DateTimeFormat("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        }).format(new Date(exam.scheduledStartAt))
                      : "No start time set"}
                  </p>
                </div>
                <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Upload window
                  </p>
                  <p className="mt-2 text-sm text-slate-900">
                    {exam.answerSheetUploadWindowMinutes || 30} minutes after exam submission
                  </p>
                </div>
                <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Notes
                  </p>
                  <p className="mt-2 text-sm text-slate-900">
                    {exam.instructions ? `${exam.instructions.slice(0, 110)}${exam.instructions.length > 110 ? "..." : ""}` : "No instructions added yet"}
                  </p>
                </div>
              </div>

              {exam.questions.length > 0 ? (
                <div className="mt-5 rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <FiFileText className="h-4 w-4" />
                    Question outline
                  </div>
                  <div className="mt-3 space-y-2">
                    {exam.questions.slice(0, 4).map((question, index) => (
                      <div
                        key={question.id}
                        className="rounded-[14px] border border-slate-200 bg-white px-3 py-3 text-sm"
                      >
                        <p className="font-medium text-slate-900">
                          {index + 1}. {question.prompt}
                        </p>
                        <p className="mt-1 text-slate-600">
                          {question.type.replace(/_/g, " ")} • {question.marks} mark
                          {question.marks === 1 ? "" : "s"}
                        </p>
                      </div>
                    ))}
                    {exam.questions.length > 4 ? (
                      <p className="text-sm text-slate-500">
                        +{exam.questions.length - 4} more question
                        {exam.questions.length - 4 === 1 ? "" : "s"}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </article>
          ))
        )}
      </section>

      <ExamEditorModal
        isOpen={isEditorOpen}
        exam={selectedExam}
        isSaving={isSaving}
        onClose={() => {
          if (!isSaving) {
            setIsEditorOpen(false);
            setSelectedExam(null);
          }
        }}
        onSave={handleSave}
      />
    </section>
  );
}
