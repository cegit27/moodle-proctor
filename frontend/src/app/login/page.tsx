"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { FiArrowRight, FiLoader } from "react-icons/fi";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
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

        if (active && response.ok && data.authenticated && data.token) {
          window.localStorage.setItem("auth_token", data.token);
          router.replace(nextPath);
          return;
        }
      } catch {
        // stay on login
      } finally {
        if (active) {
          setCheckingSession(false);
        }
      }
    };

    void resumeExistingSession();

    return () => {
      active = false;
    };
  }, [nextPath, router]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/backend-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: identifier.trim(),
          password,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        token?: string;
      };

      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Sign-in failed");
      }

      if (!data.token) {
        throw new Error("Dashboard session token was not created");
      }

      window.localStorage.setItem("auth_token", data.token);
      router.push(nextPath);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Sign-in failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center">
        <section className="w-full rounded-[24px] border border-slate-200 bg-white px-6 py-7 shadow-sm sm:px-8 sm:py-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
              Teacher login
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              Sign in
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Use the same teacher username and password that you use in Moodle.
              There is no separate dashboard account.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {error ? (
              <div className="rounded-[16px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-900">
                Moodle username or email
              </label>
              <input
                type="text"
                required
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="teacher username"
                disabled={submitting || checkingSession}
                className="input-field"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-900">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Moodle password"
                disabled={submitting || checkingSession}
                className="input-field"
              />
            </div>

            <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              After sign-in, you will be taken straight to the teacher monitoring dashboard.
            </div>

            <button
              type="submit"
              disabled={submitting || checkingSession}
              className="btn-primary w-full"
            >
              {submitting || checkingSession ? (
                <>
                  <FiLoader className="h-4 w-4 animate-spin" />
                  {checkingSession ? "Checking session..." : "Signing in..."}
                </>
              ) : (
                <>
                  Enter dashboard
                  <FiArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
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
