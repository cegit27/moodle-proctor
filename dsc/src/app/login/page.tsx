"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    router.push("/dashboard");
  };

  return (
    <main className="min-h-[calc(100vh-2rem)] flex items-center justify-center">
      <div className="grid w-full max-w-4xl grid-cols-1 lg:grid-cols-[1.1fr,0.9fr] gap-6">
        <section className="glass-surface rounded-2xl px-8 py-8 sm:px-10 sm:py-10 flex flex-col justify-center">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-2xl bg-accent.blue/20 border border-accent.blue/40 flex items-center justify-center">
                <span className="text-accent.blue font-semibold text-lg">OP</span>
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold tracking-tight">ProctorVision</span>
                <span className="text-[11px] text-slate-400 uppercase tracking-[0.18em]">
                  Teacher Console
                </span>
              </div>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold text-slate-50 tracking-tight">
              Sign in to monitor your exam
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Securely access the live monitoring dashboard and AI proctoring tools.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">Institutional Email</label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="proctor@university.edu"
                  className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-accent.blue"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-accent.blue"
              />
              <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                <span>Minimum 8 characters.</span>
                <button type="button" className="text-sky-300 hover:text-sky-200">
                  Forgot password?
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-sky-400 px-4 py-2.5 text-sm font-medium text-slate-950 hover:bg-sky-300 transition-colors"
            >
              Login as Teacher
            </button>
          </form>
        </section>

        <section className="hidden lg:flex flex-col justify-between glass-surface rounded-2xl px-7 py-7 border border-slate-800/80">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                Live Exam Snapshot
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400 border border-emerald-500/30">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Session Active
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className="aspect-video rounded-md bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border border-slate-800/80"
                />
              ))}
            </div>
          </div>
          <div className="mt-6 space-y-1 text-[11px] text-slate-400">
            <p>Monitor live webcam feeds, AI alerts, and student activity in real-time.</p>
            <p>Designed for secure high-stakes examinations and scalable invigilation.</p>
          </div>
        </section>
      </div>
    </main>
  );
}

