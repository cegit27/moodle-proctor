"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { FiActivity, FiArrowRight, FiShield, FiVideo } from "react-icons/fi";

const platformStats = [
  { label: "Live Rooms", value: "12", icon: <FiVideo className="h-4 w-4" /> },
  { label: "Open Alerts", value: "05", icon: <FiActivity className="h-4 w-4" /> },
  { label: "Secure Reviews", value: "98%", icon: <FiShield className="h-4 w-4" /> }
];

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextPath = searchParams.get("next") || "/dashboard";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/backend-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: identifier, password }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "Login failed");
      }
      router.push(nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-7xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative overflow-hidden rounded-[32px] border border-slate-200/80 bg-slate-900 px-6 py-8 text-white shadow-2xl shadow-slate-900/15 sm:px-8 sm:py-10 lg:px-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.3),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(45,212,191,0.18),_transparent_26%)]" />
          <div className="relative flex h-full flex-col justify-between gap-8">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-sm font-bold text-white backdrop-blur-sm">
                  PV
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-200">
                    Exam Operations
                  </p>
                  <h1 className="mt-1 text-lg font-semibold">ProctorVision</h1>
                </div>
              </div>

              <div className="mt-10 max-w-2xl">
                <p className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-100">
                  Unified Monitoring Workspace
                </p>
                <h2 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
                  Run secure exams from one calm, responsive control center.
                </h2>
                <p className="mt-5 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
                  Review live feeds, manage alerts, and keep evidence workflows moving with a
                  dashboard built for smooth exam operations.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {platformStats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-[24px] border border-white/10 bg-white/10 px-4 py-4 backdrop-blur-sm"
                >
                  <div className="flex items-center justify-between text-sky-100">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em]">{stat.label}</p>
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
                      {stat.icon}
                    </span>
                  </div>
                  <p className="mt-4 text-3xl font-semibold text-white">{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className="aspect-video rounded-[20px] border border-white/10 bg-white/10 backdrop-blur-sm"
                />
              ))}
            </div>
          </div>
        </section>

        <section className="dashboard-panel flex rounded-[32px] px-6 py-8 sm:px-8 sm:py-10">
          <div className="m-auto w-full max-w-xl">
            <div className="mb-8">
              <p className="dashboard-kicker">Secure Access</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                Sign in to continue
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-500 sm:text-base">
                Access the monitoring workspace, incident queue, participant roster, and reporting tools.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {error}
                </div>
              ) : null}

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-900">
                  Moodle Username or Email
                </label>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="proctor@university.edu"
                  disabled={submitting}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-900">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  disabled={submitting}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-500">Protected by your Moodle account</span>
                <button type="button" className="font-semibold text-blue-700 transition-colors hover:text-blue-800">
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3.5 text-base font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
              >
                <span>{submitting ? "Signing in..." : "Enter Dashboard"}</span>
                <FiArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
