"use client";

import { useEffect, useState } from "react";
import { FiLoader, FiPlus, FiTrash2, FiUpload, FiX } from "react-icons/fi";

import {
  type TeacherExam,
  type TeacherExamPayload,
  type TeacherExamQuestion,
  type TeacherExamQuestionPaperUpload,
} from "@/lib/backend";

const QUESTION_TYPE_META: Record<
  string,
  {
    label: string;
    helper: string;
    supportsOptions: boolean;
    supportsAnswer: boolean;
    answerLabel: string;
    answerPlaceholder: string;
  }
> = {
  short_answer: {
    label: "Short answer",
    helper: "Student types a short written answer.",
    supportsOptions: false,
    supportsAnswer: true,
    answerLabel: "Expected answer",
    answerPlaceholder: "Optional reference answer",
  },
  multiple_choice: {
    label: "Multiple choice",
    helper: "Add answer choices below. The first matching answer key can be used as reference.",
    supportsOptions: true,
    supportsAnswer: true,
    answerLabel: "Correct option",
    answerPlaceholder: "Type the correct option text",
  },
  essay: {
    label: "Essay",
    helper: "Long-form written response with no answer choices.",
    supportsOptions: false,
    supportsAnswer: true,
    answerLabel: "Rubric note",
    answerPlaceholder: "Optional rubric or expected points",
  },
  true_false: {
    label: "True / False",
    helper: "Students choose between True and False.",
    supportsOptions: true,
    supportsAnswer: true,
    answerLabel: "Correct answer",
    answerPlaceholder: "Select the correct answer",
  },
};

interface ExamEditorModalProps {
  isOpen: boolean;
  exam?: TeacherExam | null;
  isSaving: boolean;
  onClose: () => void;
  onSave: (payload: TeacherExamPayload) => Promise<void> | void;
}

interface ExamEditorFormState {
  examName: string;
  courseName: string;
  description: string;
  instructions: string;
  durationMinutes: number;
  answerSheetUploadWindowMinutes: number;
  maxWarnings: number;
  roomCapacity: number;
  enableAiProctoring: boolean;
  enableManualProctoring: boolean;
  autoSubmitOnWarningLimit: boolean;
  captureSnapshots: boolean;
  allowStudentRejoin: boolean;
  moodleCourseId: string;
  moodleCourseModuleId: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  questions: TeacherExamQuestion[];
  questionPaper: TeacherExamQuestionPaperUpload | null;
  removeQuestionPaper: boolean;
}

function toDateTimeLocal(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function createEmptyQuestion(index: number): TeacherExamQuestion {
  return {
    id: `question-${Date.now()}-${index}`,
    prompt: "",
    type: "short_answer",
    marks: 1,
    options: [],
    answer: null,
  };
}

function normalizeQuestionForType(
  question: TeacherExamQuestion,
  type: string
): TeacherExamQuestion {
  if (type === "true_false") {
    const answer =
      question.answer === "True" || question.answer === "False" ? question.answer : "True";

    return {
      ...question,
      type,
      options: ["True", "False"],
      answer,
    };
  }

  if (type === "multiple_choice") {
    return {
      ...question,
      type,
      options: question.options.length ? question.options : ["", ""],
    };
  }

  return {
    ...question,
    type,
    options: [],
  };
}

function buildInitialState(exam?: TeacherExam | null): ExamEditorFormState {
  return {
    examName: exam?.examName || "",
    courseName: exam?.courseName || "",
    description: exam?.description || "",
    instructions: exam?.instructions || "",
    durationMinutes: exam?.durationMinutes || 60,
    answerSheetUploadWindowMinutes: exam?.answerSheetUploadWindowMinutes || 30,
    maxWarnings: exam?.maxWarnings || 10,
    roomCapacity: exam?.roomCapacity || 15,
    enableAiProctoring: exam?.enableAiProctoring ?? true,
    enableManualProctoring: exam?.enableManualProctoring ?? true,
    autoSubmitOnWarningLimit: exam?.autoSubmitOnWarningLimit ?? true,
    captureSnapshots: exam?.captureSnapshots ?? true,
    allowStudentRejoin: exam?.allowStudentRejoin ?? true,
    moodleCourseId: exam?.moodleCourseId?.toString() || "",
    moodleCourseModuleId: exam?.moodleCourseModuleId?.toString() || "",
    scheduledStartAt: toDateTimeLocal(exam?.scheduledStartAt),
    scheduledEndAt: toDateTimeLocal(exam?.scheduledEndAt),
    questions: exam?.questions?.length ? exam.questions : [createEmptyQuestion(1)],
    questionPaper: null,
    removeQuestionPaper: false,
  };
}

export const ExamEditorModal = ({
  isOpen,
  exam,
  isSaving,
  onClose,
  onSave,
}: ExamEditorModalProps) => {
  const [form, setForm] = useState<ExamEditorFormState>(() => buildInitialState(exam));
  const [error, setError] = useState<string | null>(null);
  const [uploadLabel, setUploadLabel] = useState<string>("");

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setForm(buildInitialState(exam));
    setError(null);
    setUploadLabel("");
  }, [exam, isOpen]);

  if (!isOpen) {
    return null;
  }

  const updateQuestion = (index: number, next: Partial<TeacherExamQuestion>) => {
    setForm((current) => ({
      ...current,
      questions: current.questions.map((question, questionIndex) =>
        questionIndex === index ? { ...question, ...next } : question
      ),
    }));
  };

  const updateQuestionType = (index: number, type: string) => {
    setForm((current) => ({
      ...current,
      questions: current.questions.map((question, questionIndex) =>
        questionIndex === index ? normalizeQuestionForType(question, type) : question
      ),
    }));
  };

  const updateQuestionOption = (index: number, optionIndex: number, value: string) => {
    setForm((current) => ({
      ...current,
      questions: current.questions.map((question, questionIndex) => {
        if (questionIndex !== index) {
          return question;
        }

        const nextOptions = question.options.map((option, currentOptionIndex) =>
          currentOptionIndex === optionIndex ? value : option
        );

        return {
          ...question,
          options: nextOptions,
        };
      }),
    }));
  };

  const addQuestionOption = (index: number) => {
    setForm((current) => ({
      ...current,
      questions: current.questions.map((question, questionIndex) =>
        questionIndex === index
          ? {
              ...question,
              options: [...question.options, ""],
            }
          : question
      ),
    }));
  };

  const removeQuestionOption = (index: number, optionIndex: number) => {
    setForm((current) => ({
      ...current,
      questions: current.questions.map((question, questionIndex) => {
        if (questionIndex !== index) {
          return question;
        }

        const nextOptions = question.options.filter((_, currentOptionIndex) => currentOptionIndex !== optionIndex);

        return {
          ...question,
          options: nextOptions.length ? nextOptions : ["", ""],
        };
      }),
    }));
  };

  const handleUploadChange = async (file: File | null) => {
    if (!file) {
      setForm((current) => ({ ...current, questionPaper: null }));
      setUploadLabel("");
      return;
    }

    if (file.type !== "application/pdf") {
      setError("Question paper must be a PDF file.");
      return;
    }

    const contentBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        resolve(result.split(",")[1] || "");
      };
      reader.onerror = () => reject(new Error("Unable to read the selected PDF."));
      reader.readAsDataURL(file);
    });

    setForm((current) => ({
      ...current,
      questionPaper: {
        fileName: file.name,
        mimeType: file.type || "application/pdf",
        contentBase64,
      },
      removeQuestionPaper: false,
    }));
    setUploadLabel(file.name);
    setError(null);
  };

  const handleSubmit = async () => {
    try {
      setError(null);

      const payload: TeacherExamPayload = {
        examName: form.examName.trim(),
        courseName: form.courseName.trim(),
        description: form.description.trim() || null,
        instructions: form.instructions.trim() || null,
        durationMinutes: Number(form.durationMinutes),
        answerSheetUploadWindowMinutes: Number(form.answerSheetUploadWindowMinutes),
        maxWarnings: Number(form.maxWarnings),
        roomCapacity: Number(form.roomCapacity),
        enableAiProctoring: form.enableAiProctoring,
        enableManualProctoring: form.enableManualProctoring,
        autoSubmitOnWarningLimit: form.autoSubmitOnWarningLimit,
        captureSnapshots: form.captureSnapshots,
        allowStudentRejoin: form.allowStudentRejoin,
        moodleCourseId: form.moodleCourseId ? Number(form.moodleCourseId) : null,
        moodleCourseModuleId: form.moodleCourseModuleId ? Number(form.moodleCourseModuleId) : null,
        scheduledStartAt: form.scheduledStartAt ? new Date(form.scheduledStartAt).toISOString() : null,
        scheduledEndAt: form.scheduledEndAt ? new Date(form.scheduledEndAt).toISOString() : null,
        questions: form.questions.map((question, index) => ({
          ...question,
          id: question.id || `question-${index + 1}`,
          prompt: question.prompt.trim(),
          answer: question.answer?.trim() || null,
          options: question.options.map((option) => option.trim()).filter(Boolean),
          marks: Number(question.marks) || 0,
        })),
        questionPaper: form.questionPaper,
        removeQuestionPaper: form.removeQuestionPaper,
      };

      await onSave(payload);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Unable to save exam");
    }
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) {
          onClose();
        }
      }}
    >
      <div className="modal-shell max-w-6xl overflow-hidden rounded-[20px] border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">
              {exam ? "Edit exam" : "Create exam"}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Set the paper, questions, warning policy, and proctoring options in one place.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[80vh] overflow-y-auto px-6 py-5">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_360px]">
            <div className="space-y-5">
              <section className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4">
                <h3 className="text-sm font-semibold text-slate-900">Exam basics</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Exam name</span>
                    <input
                      value={form.examName}
                      onChange={(event) => setForm((current) => ({ ...current, examName: event.target.value }))}
                      className="input-field mt-2"
                      placeholder="Semester final"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Course name</span>
                    <input
                      value={form.courseName}
                      onChange={(event) => setForm((current) => ({ ...current, courseName: event.target.value }))}
                      className="input-field mt-2"
                      placeholder="Data Structures"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Duration (minutes)</span>
                    <input
                      type="number"
                      min={1}
                      value={form.durationMinutes}
                      onChange={(event) => setForm((current) => ({ ...current, durationMinutes: Number(event.target.value) }))}
                      className="input-field mt-2"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Alert limit</span>
                    <input
                      type="number"
                      min={0}
                      value={form.maxWarnings}
                      onChange={(event) => setForm((current) => ({ ...current, maxWarnings: Number(event.target.value) }))}
                      className="input-field mt-2"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">
                      Answer-sheet upload window (minutes)
                    </span>
                    <input
                      type="number"
                      min={1}
                      value={form.answerSheetUploadWindowMinutes}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          answerSheetUploadWindowMinutes: Number(event.target.value),
                        }))
                      }
                      className="input-field mt-2"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Room capacity</span>
                    <input
                      type="number"
                      min={1}
                      value={form.roomCapacity}
                      onChange={(event) => setForm((current) => ({ ...current, roomCapacity: Number(event.target.value) }))}
                      className="input-field mt-2"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Moodle course ID</span>
                    <input
                      type="number"
                      min={0}
                      value={form.moodleCourseId}
                      onChange={(event) => setForm((current) => ({ ...current, moodleCourseId: event.target.value }))}
                      className="input-field mt-2"
                      placeholder="Optional"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Moodle module ID</span>
                    <input
                      type="number"
                      min={0}
                      value={form.moodleCourseModuleId}
                      onChange={(event) => setForm((current) => ({ ...current, moodleCourseModuleId: event.target.value }))}
                      className="input-field mt-2"
                      placeholder="Optional"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Start time</span>
                    <input
                      type="datetime-local"
                      value={form.scheduledStartAt}
                      onChange={(event) => setForm((current) => ({ ...current, scheduledStartAt: event.target.value }))}
                      className="input-field mt-2"
                    />
                  </label>
                  <label className="block md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">End time</span>
                    <input
                      type="datetime-local"
                      value={form.scheduledEndAt}
                      onChange={(event) => setForm((current) => ({ ...current, scheduledEndAt: event.target.value }))}
                      className="input-field mt-2"
                    />
                  </label>
                  <label className="block md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">Short description</span>
                    <textarea
                      value={form.description}
                      onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                      className="input-field mt-2 min-h-[96px]"
                      placeholder="What this exam is for and who should take it."
                    />
                  </label>
                  <label className="block md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">Instructions</span>
                    <textarea
                      value={form.instructions}
                      onChange={(event) => setForm((current) => ({ ...current, instructions: event.target.value }))}
                      className="input-field mt-2 min-h-[120px]"
                      placeholder="Rules shown before the exam starts."
                    />
                  </label>
                </div>
              </section>

              <section className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Questions</h3>
                    <p className="mt-1 text-sm text-slate-600">Add the quick question outline shown in Electron.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        questions: [...current.questions, createEmptyQuestion(current.questions.length + 1)],
                      }))
                    }
                    className="btn-secondary"
                  >
                    <FiPlus className="h-4 w-4" />
                    Add question
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  {form.questions.map((question, index) => {
                    const questionMeta =
                      QUESTION_TYPE_META[question.type] || QUESTION_TYPE_META.short_answer;

                    return (
                    <div key={question.id} className="rounded-[16px] border border-slate-200 bg-white px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-900">Question {index + 1}</p>
                        <button
                          type="button"
                          onClick={() =>
                            setForm((current) => ({
                              ...current,
                              questions:
                                current.questions.length === 1
                                  ? [createEmptyQuestion(1)]
                                  : current.questions.filter((_, currentIndex) => currentIndex !== index),
                            }))
                          }
                          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-red-600"
                          aria-label={`Remove question ${index + 1}`}
                        >
                          <FiTrash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_120px]">
                        <label className="block md:col-span-3">
                          <span className="text-sm font-medium text-slate-700">Prompt</span>
                          <textarea
                            value={question.prompt}
                            onChange={(event) => updateQuestion(index, { prompt: event.target.value })}
                            className="input-field mt-2 min-h-[90px]"
                            placeholder="Enter the question prompt"
                          />
                        </label>
                        <label className="block">
                          <span className="text-sm font-medium text-slate-700">Type</span>
                          <select
                            value={question.type}
                            onChange={(event) => updateQuestionType(index, event.target.value)}
                            className="input-field mt-2"
                          >
                            <option value="short_answer">Short answer</option>
                            <option value="multiple_choice">Multiple choice</option>
                            <option value="essay">Essay</option>
                            <option value="true_false">True/False</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-sm font-medium text-slate-700">Marks</span>
                          <input
                            type="number"
                            min={0}
                            value={question.marks}
                            onChange={(event) => updateQuestion(index, { marks: Number(event.target.value) })}
                            className="input-field mt-2"
                          />
                        </label>
                        <label className="block">
                          <span className="text-sm font-medium text-slate-700">{questionMeta.answerLabel}</span>
                          {question.type === "true_false" ? (
                            <select
                              value={question.answer || "True"}
                              onChange={(event) => updateQuestion(index, { answer: event.target.value })}
                              className="input-field mt-2"
                            >
                              <option value="True">True</option>
                              <option value="False">False</option>
                            </select>
                          ) : (
                            <input
                              value={question.answer || ""}
                              onChange={(event) => updateQuestion(index, { answer: event.target.value })}
                              className="input-field mt-2"
                              placeholder={questionMeta.answerPlaceholder}
                            />
                          )}
                        </label>
                        <div className="block md:col-span-3 rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-3">
                          <p className="text-sm font-semibold text-slate-900">{questionMeta.label}</p>
                          <p className="mt-1 text-sm text-slate-600">{questionMeta.helper}</p>

                          {questionMeta.supportsOptions ? (
                            <div className="mt-4 space-y-3">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm font-medium text-slate-700">Options</span>
                                {question.type === "multiple_choice" ? (
                                  <button
                                    type="button"
                                    onClick={() => addQuestionOption(index)}
                                    className="btn-secondary"
                                  >
                                    <FiPlus className="h-4 w-4" />
                                    Add option
                                  </button>
                                ) : null}
                              </div>

                              <div className="space-y-2">
                                {question.options.map((option, optionIndex) => (
                                  <div key={`${question.id}-option-${optionIndex}`} className="flex items-center gap-2">
                                    <span className="w-8 text-center text-sm font-medium text-slate-500">
                                      {String.fromCharCode(65 + optionIndex)}
                                    </span>
                                    <input
                                      value={option}
                                      onChange={(event) =>
                                        updateQuestionOption(index, optionIndex, event.target.value)
                                      }
                                      disabled={question.type === "true_false"}
                                      className="input-field flex-1"
                                      placeholder={`Option ${optionIndex + 1}`}
                                    />
                                    {question.type === "multiple_choice" ? (
                                      <button
                                        type="button"
                                        onClick={() => removeQuestionOption(index, optionIndex)}
                                        className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-red-600"
                                        aria-label={`Remove option ${optionIndex + 1}`}
                                      >
                                        <FiTrash2 className="h-4 w-4" />
                                      </button>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )})}
                </div>
              </section>
            </div>

            <div className="space-y-5">
              <section className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4">
                <h3 className="text-sm font-semibold text-slate-900">Proctoring options</h3>
                <div className="mt-4 space-y-3">
                  {[
                    {
                      key: "enableAiProctoring" as const,
                      title: "AI proctoring",
                      detail: "Allow AI checks and live warning signals for this exam.",
                    },
                    {
                      key: "enableManualProctoring" as const,
                      title: "Manual proctoring",
                      detail: "Keep the teacher review path and warning panel enabled.",
                    },
                    {
                      key: "autoSubmitOnWarningLimit" as const,
                      title: "End exam at alert limit",
                      detail: "Automatically submit when the warning limit is reached.",
                    },
                    {
                      key: "captureSnapshots" as const,
                      title: "Capture snapshots",
                      detail: "Save live snapshots for room monitoring fallback.",
                    },
                    {
                      key: "allowStudentRejoin" as const,
                      title: "Allow rejoin",
                      detail: "Let a student reconnect to the same room before submission.",
                    },
                  ].map((item) => (
                    <label
                      key={item.key}
                      className="flex items-start gap-3 rounded-[14px] border border-slate-200 bg-white px-3 py-3"
                    >
                      <input
                        type="checkbox"
                        checked={form[item.key]}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, [item.key]: event.target.checked }))
                        }
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-slate-900">{item.title}</span>
                        <span className="mt-1 block text-sm text-slate-600">{item.detail}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </section>

              <section className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4">
                <h3 className="text-sm font-semibold text-slate-900">Question paper</h3>
                <p className="mt-1 text-sm text-slate-600">Upload the PDF that Electron opens beside the summary.</p>

                <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-[14px] border border-dashed border-slate-300 bg-white px-4 py-4 text-sm font-semibold text-slate-700 hover:border-slate-400">
                  <FiUpload className="h-4 w-4" />
                  {uploadLabel || "Choose PDF"}
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(event) => {
                      void handleUploadChange(event.target.files?.[0] || null);
                    }}
                  />
                </label>

                {exam?.questionPaperPath ? (
                  <div className="mt-3 rounded-[14px] border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                    Current file: <span className="font-semibold">{exam.questionPaperPath.split("/").pop()}</span>
                  </div>
                ) : null}

                {exam?.questionPaperPath ? (
                  <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.removeQuestionPaper}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          removeQuestionPaper: event.target.checked,
                          questionPaper: event.target.checked ? null : current.questionPaper,
                        }))
                      }
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    Remove the current PDF
                  </label>
                ) : null}
              </section>

              {error ? (
                <div className="rounded-[16px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={isSaving}>
            Cancel
          </button>
          <button type="button" onClick={() => void handleSubmit()} className="btn-primary" disabled={isSaving}>
            {isSaving ? (
              <>
                <FiLoader className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>{exam ? "Save changes" : "Create exam"}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
