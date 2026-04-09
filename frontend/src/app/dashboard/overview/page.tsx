"use client";

import Link from "next/link";
import {
  FiActivity,
  FiAlertTriangle,
  FiArrowRight,
  FiBookOpen,
  FiClock,
  FiFileText,
  FiLoader,
  FiMonitor,
  FiUploadCloud,
  FiUsers,
} from "react-icons/fi";

import {
  useActiveRooms,
  useAnswerSheetUploads,
  useExams,
  useTeacherStats,
} from "@/hooks/useTeacherData";

function formatDate(value: string | null | undefined) {
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

function formatRelativeLabel(count: number, singular: string, plural?: string) {
  return `${count} ${count === 1 ? singular : plural || `${singular}s`}`;
}

export default function DashboardOverviewPage() {
  const { stats, isLoading: statsLoading, error: statsError } = useTeacherStats();
  const { exams, isLoading: examsLoading } = useExams();
  const { rooms, isLoading: roomsLoading } = useActiveRooms();
  const { uploads, isLoading: uploadsLoading } = useAnswerSheetUploads({ limit: 8 });

  const uploadSummary = uploads.reduce(
    (accumulator, upload) => {
      accumulator.total += 1;

      if (upload.status === "uploaded") {
        accumulator.uploaded += 1;
      }

      if (upload.status === "awaiting_upload" || upload.status === "upload_in_progress") {
        accumulator.pending += 1;
      }

      if (upload.status === "expired") {
        accumulator.expired += 1;
      }

      return accumulator;
    },
    { total: 0, uploaded: 0, pending: 0, expired: 0 }
  );

  const recentExams = [...exams]
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, 4);

  const latestUploads = [...uploads]
    .sort((left, right) => {
      const leftTime = new Date(left.uploadedAt || left.createdAt).getTime();
      const rightTime = new Date(right.uploadedAt || right.createdAt).getTime();
      return rightTime - leftTime;
    })
    .slice(0, 5);

  const actionItems = [
    {
      title: "Create an exam",
      copy: "Set up a paper, warning limit, and answer-sheet upload window.",
      href: "/dashboard/exams",
      icon: <FiBookOpen className="h-4 w-4" />,
    },
    {
      title: "Open a live room",
      copy: "Launch a room, share the student link, and begin monitoring.",
      href: "/dashboard/monitoring",
      icon: <FiMonitor className="h-4 w-4" />,
    },
    {
      title: "Review alerts",
      copy: "Go straight to the highest-risk queue for the active rooms.",
      href: "/dashboard/alerts",
      icon: <FiAlertTriangle className="h-4 w-4" />,
    },
    {
      title: "Check answer sheets",
      copy: "Open uploaded PDFs and follow pending or expired submissions.",
      href: "/dashboard/answer-sheets",
      icon: <FiFileText className="h-4 w-4" />,
    },
  ];

  const attentionItems = [
    {
      label: "Pending answer-sheet uploads",
      value: uploadSummary.pending,
      tone:
        uploadSummary.pending > 0
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-emerald-200 bg-emerald-50 text-emerald-800",
      helper:
        uploadSummary.pending > 0
          ? "Students still have open upload windows after submission."
          : "No students are currently waiting to upload answer sheets.",
    },
    {
      label: "Expired upload windows",
      value: uploadSummary.expired,
      tone:
        uploadSummary.expired > 0
          ? "border-rose-200 bg-rose-50 text-rose-900"
          : "border-slate-200 bg-slate-50 text-slate-700",
      helper:
        uploadSummary.expired > 0
          ? "Some students missed the PDF upload deadline."
          : "No expired answer-sheet windows right now.",
    },
    {
      label: "Live rooms",
      value: rooms.length,
      tone:
        rooms.length > 0
          ? "border-sky-200 bg-sky-50 text-sky-900"
          : "border-slate-200 bg-slate-50 text-slate-700",
      helper:
        rooms.length > 0
          ? "Live rooms are open and ready for monitoring."
          : "No live rooms are active at the moment.",
    },
  ];

  return (
    <section className="space-y-6">
      <article className="surface-panel section-card overflow-hidden">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_420px]">
          <div>
            <span className="eyebrow-pill">Teacher control center</span>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
              Keep exams, monitoring, and uploads moving together
            </h2>
            <p className="section-copy mt-3 max-w-3xl">
              This overview brings together the parts of the workflow that matter most during a live exam cycle:
              exam setup, room activity, warning pressure, and post-exam answer-sheet collection.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/dashboard/exams" className="btn-primary">
                <FiBookOpen className="h-4 w-4" />
                Manage exams
              </Link>
              <Link href="/dashboard/monitoring" className="btn-secondary">
                <FiMonitor className="h-4 w-4" />
                Open monitoring
              </Link>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Workspace health
                </p>
                <h3 className="mt-2 text-lg font-semibold text-slate-950">Current status</h3>
              </div>
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] ${
                  statsError
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${statsError ? "bg-rose-500" : "bg-emerald-500"}`} />
                {statsError ? "Needs attention" : "Healthy"}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {attentionItems.map((item) => (
                <div key={item.label} className={`rounded-[18px] border px-4 py-4 ${item.tone}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{item.label}</p>
                      <p className="mt-1 text-sm opacity-80">{item.helper}</p>
                    </div>
                    <span className="text-2xl font-semibold tracking-tight">{item.value}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </article>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="metric-card">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-sm font-medium">Total exams</span>
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
              <FiBookOpen className="h-5 w-5" />
            </span>
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
            {examsLoading ? "..." : exams.length}
          </p>
          <p className="mt-2 text-sm text-slate-500">Configured exams ready for rooms and delivery.</p>
        </div>

        <div className="metric-card">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-sm font-medium">Live rooms</span>
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
              <FiMonitor className="h-5 w-5" />
            </span>
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
            {roomsLoading ? "..." : rooms.length}
          </p>
          <p className="mt-2 text-sm text-slate-500">Rooms currently open for student joins or live monitoring.</p>
        </div>

        <div className="metric-card">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-sm font-medium">Active students</span>
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
              <FiUsers className="h-5 w-5" />
            </span>
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
            {statsLoading ? "..." : stats?.students.active ?? 0}
          </p>
          <p className="mt-2 text-sm text-slate-500">Students currently active in the dashboard summary.</p>
        </div>

        <div className="metric-card">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-sm font-medium">Uploaded PDFs</span>
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
              <FiUploadCloud className="h-5 w-5" />
            </span>
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
            {uploadsLoading ? "..." : uploadSummary.uploaded}
          </p>
          <p className="mt-2 text-sm text-slate-500">Answer sheets received from the post-exam phone flow.</p>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)]">
        <section className="surface-panel section-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">Quick actions</h3>
              <p className="mt-1 text-sm text-slate-600">
                Jump straight into the next step without hunting through the workspace.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {actionItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4 transition hover:border-emerald-300 hover:bg-emerald-50"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm">
                    {item.icon}
                  </span>
                  <FiArrowRight className="h-4 w-4 text-slate-400 transition group-hover:text-emerald-700" />
                </div>
                <h4 className="mt-4 text-base font-semibold text-slate-950">{item.title}</h4>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.copy}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="surface-panel section-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">Live rooms snapshot</h3>
              <p className="mt-1 text-sm text-slate-600">
                See which exam rooms are currently running and how many students are inside.
              </p>
            </div>
            <Link href="/dashboard/monitoring" className="text-sm font-medium text-emerald-700">
              Open monitoring
            </Link>
          </div>

          {roomsLoading ? (
            <div className="mt-5 flex items-center gap-2 text-sm text-slate-600">
              <FiLoader className="h-4 w-4 animate-spin" />
              Loading live rooms...
            </div>
          ) : rooms.length === 0 ? (
            <div className="mt-5 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
              No live rooms are open right now. Create a room from Monitoring or from an exam card.
            </div>
          ) : (
            <div className="mt-5 grid gap-3">
              {rooms.slice(0, 4).map((room) => (
                <div key={room.id} className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-base font-semibold text-slate-950">{room.examName}</p>
                      <p className="mt-1 text-sm text-slate-600">{room.courseName}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-sm text-slate-700">
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                        {room.roomCode}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                        {formatRelativeLabel(room.studentCount, "student")}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                        {room.durationMinutes} min
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className="surface-panel section-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">Recently updated exams</h3>
              <p className="mt-1 text-sm text-slate-600">
                The latest exam configurations, schedules, and upload windows.
              </p>
            </div>
            <Link href="/dashboard/exams" className="text-sm font-medium text-emerald-700">
              View exams
            </Link>
          </div>

          {examsLoading ? (
            <div className="mt-5 flex items-center gap-2 text-sm text-slate-600">
              <FiLoader className="h-4 w-4 animate-spin" />
              Loading exams...
            </div>
          ) : recentExams.length === 0 ? (
            <div className="mt-5 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
              No exams have been created yet.
            </div>
          ) : (
            <div className="mt-5 grid gap-3">
              {recentExams.map((exam) => (
                <div key={exam.id} className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-base font-semibold text-slate-950">{exam.examName}</p>
                      <p className="mt-1 text-sm text-slate-600">{exam.courseName}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-sm text-slate-700">
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                        {exam.durationMinutes} min
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                        {exam.answerSheetUploadWindowMinutes || 30} min upload
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                        Warning limit {exam.maxWarnings}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <FiClock className="h-3.5 w-3.5" />
                      Updated {formatDate(exam.updatedAt)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <FiActivity className="h-3.5 w-3.5" />
                      {exam.enableAiProctoring ? "AI on" : "AI off"} |{" "}
                      {exam.enableManualProctoring ? "manual on" : "manual off"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="surface-panel section-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">Latest answer-sheet activity</h3>
              <p className="mt-1 text-sm text-slate-600">
                The most recent uploads and open upload windows across exams.
              </p>
            </div>
            <Link href="/dashboard/answer-sheets" className="text-sm font-medium text-emerald-700">
              Open answer sheets
            </Link>
          </div>

          {uploadsLoading ? (
            <div className="mt-5 flex items-center gap-2 text-sm text-slate-600">
              <FiLoader className="h-4 w-4 animate-spin" />
              Loading answer-sheet activity...
            </div>
          ) : latestUploads.length === 0 ? (
            <div className="mt-5 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
              No answer-sheet activity has been recorded yet.
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {latestUploads.map((upload) => (
                <div key={upload.id} className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-base font-semibold text-slate-950">{upload.studentName}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {upload.examName} | Attempt {upload.attemptId || upload.attemptReference}
                      </p>
                    </div>
                    <span
                      className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] ${
                        upload.status === "uploaded"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : upload.status === "expired"
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      }`}
                    >
                      {upload.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-600">
                    <span>Uploaded: {formatDate(upload.uploadedAt)}</span>
                    <span>Deadline: {formatDate(upload.expiresAt)}</span>
                    <span>Window: {upload.uploadWindowMinutes} min</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
