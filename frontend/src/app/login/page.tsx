"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { FiActivity, FiArrowRight, FiShield, FiVideo } from "react-icons/fi";

const platformStats = [
  { label: "Live rooms", value: "12", icon: <FiVideo className="h-4 w-4" /> },
  { label: "Open alerts", value: "05", icon: <FiActivity className="h-4 w-4" /> },
  { label: "Secure reviews", value: "98%", icon: <FiShield className="h-4 w-4" /> }
];

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextPath = searchParams.get("next") || "/dashboard/monitoring";

  useEffect(() => {
    let active = true;

    const resumeExistingSession = async () => {
      try {
        const response = await fetch("/api/auth/backend-session", {
          credentials: "include",
        });
        const data = (await response.json().catch(() => ({}))) as {
          authenticated?: boolean;
          token?: string;
        };

        if (!active || !response.ok || !data.authenticated || !data.token) {
          return;
        }

        window.localStorage.setItem("auth_token", data.token);
        router.replace(nextPath);
      } catch {
        // stay on login if session recovery is unavailable
      }
    };

    void resumeExistingSession();

    return () => {
      active = false;
    };
  }, [nextPath, router]);

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
      const data = (await res.json().catch(() => ({}))) as { error?: string; token?: string };
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Login failed");
      }

      if (!data.token) {
        throw new Error("Dashboard session token was not created");
      }

      window.localStorage.setItem("auth_token", data.token);
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
        <section className="relative overflow-hidden rounded-[36px] bg-slate-950 px-6 py-8 text-white shadow-[0_40px_100px_-50px_rgba(15,23,42,0.8)] sm:px-8 sm:py-10 lg:px-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(45,212,191,0.24),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.18),_transparent_26%)]" />
          <div className="relative flex h-full flex-col justify-between gap-10">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-sm font-bold text-white backdrop-blur-sm">
                  PV
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">
                    Exam operations
                  </p>
                  <h1 className="mt-1 text-lg font-semibold">ProctorVision</h1>
                </div>
              </div>

              <div className="mt-12 max-w-2xl">
                <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-100">
                  Calm monitoring system
                </span>
                <h2 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
                  Run secure exams from one clear, steady control desk.
                </h2>
                <p className="mt-5 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
                  Live monitoring, alert review, and reporting stay connected without burying the
                  operator under unnecessary visual noise.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {platformStats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-[24px] border border-white/10 bg-white/10 px-4 py-4 backdrop-blur-sm"
                >
                  <div className="flex items-center justify-between text-emerald-100">
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
              <div className="rounded-[24px] border border-white/10 bg-white/10 px-4 py-4 backdrop-blur-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                  Live response
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-200">
                  Stay close to the room without losing context on alerts and students.
                </p>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-white/10 px-4 py-4 backdrop-blur-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                  Evidence flow
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-200">
                  Reports and incident history stay readable and ready for review.
                </p>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-white/10 px-4 py-4 backdrop-blur-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                  Secure access
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-200">
                  Authentication stays tied to your Moodle-backed teacher account.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="surface-panel flex rounded-[36px] px-6 py-8 sm:px-8 sm:py-10">
          <div className="m-auto w-full max-w-xl">
            <div className="mb-8">
              <span className="eyebrow-pill">Secure access</span>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Sign in to continue
              </h2>
              <p className="section-copy mt-3">
                Enter your Moodle username or email and password to access the teacher workspace.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error ? (
                <div className="rounded-[24px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {error}
                </div>
              ) : null}

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-950">
                  Moodle username or email
                </label>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="proctor@university.edu"
                  disabled={submitting}
                  className="input-field"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-950">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  disabled={submitting}
                  className="input-field"
                />
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white/75 px-4 py-4 text-sm leading-6 text-slate-600">
                Passwords are managed in Moodle. If your access is missing, contact the exam admin
                rather than requesting a reset from this dashboard.
              </div>

              <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm leading-6 text-emerald-800">
                If you opened this from Moodle, sign in once here and you will go straight to the
                monitoring desk.
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn-primary w-full"
              >
                <span>{submitting ? "Signing in..." : "Enter dashboard"}</span>
                <FiArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
