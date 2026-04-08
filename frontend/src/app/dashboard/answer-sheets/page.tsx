"use client";

import { useMemo, useState } from "react";
import {
  FiClock,
  FiDownload,
  FiFileText,
  FiLoader,
  FiRefreshCw,
  FiSearch,
  FiUser,
} from "react-icons/fi";

import { useAnswerSheetUploads, useExams } from "@/hooks/useTeacherData";
import { backendAPI, type TeacherAnswerSheetUpload } from "@/lib/backend";

const statusClasses: Record<TeacherAnswerSheetUpload["status"], string> = {
  awaiting_upload: "border-amber-200 bg-amber-50 text-amber-800",
  upload_in_progress: "border-sky-200 bg-sky-50 text-sky-800",
  uploaded: "border-emerald-200 bg-emerald-50 text-emerald-800",
  expired: "border-rose-200 bg-rose-50 text-rose-800",
};

function formatDate(value: string | null): string {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatBytes(value: number | null): string {
  if (!value || value <= 0) {
    return "Unknown size";
  }

  if (value < 1024 * 1024) {
    return `${Math.round(value / 102.4) / 10} KB`;
  }

  return `${Math.round(value / (1024 * 102.4)) / 10} MB`;
}

function formatStatus(status: TeacherAnswerSheetUpload["status"]): string {
  return status.replace(/_/g, " ");
}

export default function AnswerSheetsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [examId, setExamId] = useState<string>("all");
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const { exams } = useExams();
  const {
    uploads,
    total,
    isLoading,
    error,
    refetch,
  } = useAnswerSheetUploads({
    examId: examId === "all" ? undefined : Number(examId),
    search: search.trim() || undefined,
    status: status === "all" ? undefined : status,
    limit: 100,
  });

  const groupedUploads = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        studentName: string;
        studentEmail: string;
        studentIdentifier: string;
        uploads: TeacherAnswerSheetUpload[];
      }
    >();

    uploads.forEach((upload) => {
      const key = `${upload.studentIdentifier}:${upload.studentEmail}`;
      const current = groups.get(key);

      if (current) {
        current.uploads.push(upload);
        return;
      }

      groups.set(key, {
        key,
        studentName: upload.studentName,
        studentEmail: upload.studentEmail,
        studentIdentifier: upload.studentIdentifier,
        uploads: [upload],
      });
    });

    return Array.from(groups.values()).sort((left, right) =>
      left.studentName.localeCompare(right.studentName)
    );
  }, [uploads]);

  const summary = useMemo(() => {
    return uploads.reduce(
      (accumulator, upload) => {
        accumulator[upload.status] += 1;
        return accumulator;
      },
      {
        awaiting_upload: 0,
        upload_in_progress: 0,
        uploaded: 0,
        expired: 0,
      }
    );
  }, [uploads]);

  const handleOpenPdf = async (upload: TeacherAnswerSheetUpload) => {
    setDownloadingId(upload.id);
    setPageError(null);

    try {
      const blob = await backendAPI.downloadAnswerSheetUploadFile(upload.id);
      const objectUrl = window.URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60_000);
    } catch (downloadError) {
      setPageError(
        downloadError instanceof Error
          ? downloadError.message
          : "Unable to open the uploaded PDF"
      );
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <section className="space-y-6">
      <article className="surface-panel section-card">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <span className="eyebrow-pill">Stored submissions</span>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
              Answer-sheet uploads by student
            </h2>
            <p className="section-copy mt-3">
              Review uploaded answer sheets here, grouped under the correct student, and open each stored PDF directly from the dashboard.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="metric-card min-w-[9rem]">
              <p className="text-sm font-medium text-slate-500">Total records</p>
              <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
                {isLoading ? "..." : total}
              </p>
            </div>
            <div className="metric-card min-w-[9rem]">
              <p className="text-sm font-medium text-slate-500">Uploaded</p>
              <p className="mt-4 text-3xl font-semibold tracking-tight text-emerald-700">
                {isLoading ? "..." : summary.uploaded}
              </p>
            </div>
            <div className="metric-card min-w-[9rem]">
              <p className="text-sm font-medium text-slate-500">Awaiting</p>
              <p className="mt-4 text-3xl font-semibold tracking-tight text-amber-700">
                {isLoading ? "..." : summary.awaiting_upload}
              </p>
            </div>
            <div className="metric-card min-w-[9rem]">
              <p className="text-sm font-medium text-slate-500">Expired</p>
              <p className="mt-4 text-3xl font-semibold tracking-tight text-rose-700">
                {isLoading ? "..." : summary.expired}
              </p>
            </div>
          </div>
        </div>
      </article>

      <section className="surface-panel section-card">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Find uploads</h3>
            <p className="mt-1 text-sm text-slate-600">
              Search by student name, exam, email, or attempt reference.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3 xl:min-w-[52rem]">
            <label className="relative">
              <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by student or exam"
                className="w-full rounded-2xl border border-slate-200 bg-white px-10 py-3 text-sm text-slate-900 outline-none ring-0 transition focus:border-emerald-400"
              />
            </label>

            <select
              value={examId}
              onChange={(event) => setExamId(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
            >
              <option value="all">All exams</option>
              {exams.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.examName}
                </option>
              ))}
            </select>

            <div className="flex gap-3">
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
              >
                <option value="all">All statuses</option>
                <option value="uploaded">Uploaded</option>
                <option value="awaiting_upload">Awaiting upload</option>
                <option value="expired">Expired</option>
              </select>

              <button
                type="button"
                onClick={() => void refetch()}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <FiRefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </section>

      {pageError ? (
        <div className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {pageError}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error.message}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-[20px] border border-slate-200 bg-white px-5 py-10 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <FiLoader className="h-4 w-4 animate-spin" />
            Loading answer-sheet uploads...
          </div>
        </div>
      ) : groupedUploads.length === 0 ? (
        <div className="rounded-[20px] border border-slate-200 bg-white px-5 py-12 text-center">
          <h3 className="text-lg font-semibold text-slate-950">No answer-sheet uploads yet</h3>
          <p className="mt-2 text-sm text-slate-600">
            Uploaded PDFs will appear here after students scan the post-exam QR code and submit from their phone.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedUploads.map((group) => (
            <article key={group.key} className="rounded-[20px] border border-slate-200 bg-white px-5 py-5">
              <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-slate-950">
                    <FiUser className="h-4 w-4 text-slate-500" />
                    <h3 className="text-lg font-semibold">{group.studentName}</h3>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{group.studentEmail}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-400">
                    Student ID {group.studentIdentifier}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 text-sm text-slate-700">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
                    {group.uploads.length} submission{group.uploads.length === 1 ? "" : "s"}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
                    {group.uploads.filter((upload) => upload.status === "uploaded").length} uploaded
                  </span>
                </div>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {group.uploads.map((upload) => (
                  <div key={upload.id} className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-base font-semibold text-slate-950">{upload.examName}</p>
                        <p className="mt-1 text-sm text-slate-600">
                          {upload.courseName || "Course not set"} | Attempt {upload.attemptId || upload.attemptReference}
                        </p>
                      </div>

                      <span
                        className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] ${statusClasses[upload.status]}`}
                      >
                        {formatStatus(upload.status)}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-white bg-white px-3 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Uploaded
                        </p>
                        <p className="mt-2 text-sm text-slate-900">{formatDate(upload.uploadedAt)}</p>
                      </div>
                      <div className="rounded-2xl border border-white bg-white px-3 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Deadline
                        </p>
                        <p className="mt-2 text-sm text-slate-900">{formatDate(upload.expiresAt)}</p>
                      </div>
                      <div className="rounded-2xl border border-white bg-white px-3 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          File
                        </p>
                        <p className="mt-2 text-sm text-slate-900">
                          {upload.fileName || "Waiting for PDF upload"}
                        </p>
                        {upload.fileName ? (
                          <p className="mt-1 text-xs text-slate-500">{formatBytes(upload.fileSizeBytes)}</p>
                        ) : null}
                      </div>
                      <div className="rounded-2xl border border-white bg-white px-3 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Exam warnings
                        </p>
                        <p className="mt-2 text-sm text-slate-900">
                          {upload.attemptViolationCount} warning{upload.attemptViolationCount === 1 ? "" : "s"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Submitted {formatDate(upload.attemptSubmittedAt)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <FiClock className="h-4 w-4" />
                        Upload window {upload.uploadWindowMinutes} min
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {upload.receiptId ? (
                          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">
                            Receipt {upload.receiptId}
                          </span>
                        ) : null}

                        <button
                          type="button"
                          disabled={upload.status !== "uploaded" || downloadingId === upload.id}
                          onClick={() => void handleOpenPdf(upload)}
                          className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          {downloadingId === upload.id ? (
                            <FiLoader className="h-4 w-4 animate-spin" />
                          ) : (
                            <FiDownload className="h-4 w-4" />
                          )}
                          Open PDF
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 flex items-start gap-2 text-xs text-slate-500">
                      <FiFileText className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                      <span>
                        Source: {upload.source.replace(/_/g, " ")}
                        {upload.attemptSubmissionReason
                          ? ` | Submission reason: ${upload.attemptSubmissionReason.replace(/_/g, " ")}`
                          : ""}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
