'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

const FORM_STORAGE_KEY = 'student-desktop-launch-form';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROOM_CODE_REGEX = /^[A-Z0-9]{8}$/;

interface LaunchFormState {
  roomCode: string;
  studentName: string;
  studentEmail: string;
}

function normalizeRoomCode(roomCode: string) {
  return roomCode.replace(/\s/g, '').toUpperCase();
}

export default function StudentDesktopLaunchPage() {
  const launchTimerRef = useRef<number | null>(null);
  const [form, setForm] = useState<LaunchFormState>({
    roomCode: '',
    studentName: '',
    studentEmail: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [showFallbackHelp, setShowFallbackHelp] = useState(false);
  const [copiedField, setCopiedField] = useState<'roomCode' | 'desktopLink' | null>(null);

  const normalizedRoomCode = useMemo(() => normalizeRoomCode(form.roomCode), [form.roomCode]);
  const normalizedStudentName = useMemo(() => form.studentName.trim(), [form.studentName]);
  const normalizedStudentEmail = useMemo(
    () => form.studentEmail.trim().toLowerCase(),
    [form.studentEmail]
  );

  const desktopLink = useMemo(() => {
    if (!normalizedRoomCode) {
      return '';
    }

    const params = new URLSearchParams({ autoJoin: '1' });

    if (normalizedStudentName) {
      params.set('name', normalizedStudentName);
    }

    if (normalizedStudentEmail) {
      params.set('email', normalizedStudentEmail);
    }

    return `proctor://room/${normalizedRoomCode}?${params.toString()}`;
  }, [normalizedRoomCode, normalizedStudentEmail, normalizedStudentName]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const storedForm = window.sessionStorage.getItem(FORM_STORAGE_KEY);
      const queryCode = new URLSearchParams(window.location.search).get('code');

      if (!storedForm && !queryCode) {
        return;
      }

      const parsedForm = storedForm ? (JSON.parse(storedForm) as Partial<LaunchFormState>) : {};

      setForm({
        roomCode: normalizeRoomCode(queryCode || parsedForm.roomCode || ''),
        studentName: parsedForm.studentName || '',
        studentEmail: parsedForm.studentEmail || '',
      });
    } catch (storageError) {
      console.error('Failed to restore desktop launch form:', storageError);
      window.sessionStorage.removeItem(FORM_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.sessionStorage.setItem(
      FORM_STORAGE_KEY,
      JSON.stringify({
        roomCode: normalizedRoomCode,
        studentName: normalizedStudentName,
        studentEmail: normalizedStudentEmail,
      } satisfies LaunchFormState)
    );
  }, [normalizedRoomCode, normalizedStudentEmail, normalizedStudentName]);

  useEffect(() => {
    return () => {
      if (launchTimerRef.current !== null) {
        window.clearTimeout(launchTimerRef.current);
      }
    };
  }, []);

  const handleCopy = async (value: string, field: 'roomCode' | 'desktopLink') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 2000);
    } catch (copyError) {
      console.error('Failed to copy student desktop launch value:', copyError);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!normalizedStudentName || normalizedStudentName.length < 2) {
      setError('Enter your full name before continuing.');
      return;
    }

    if (!EMAIL_REGEX.test(normalizedStudentEmail)) {
      setError('Enter a valid email address before continuing.');
      return;
    }

    if (!ROOM_CODE_REGEX.test(normalizedRoomCode)) {
      setError('Enter the 8-character room code shared by your teacher.');
      return;
    }

    setError(null);
    setShowFallbackHelp(false);
    setStatus('Opening the desktop app and passing your room details...');

    if (launchTimerRef.current !== null) {
      window.clearTimeout(launchTimerRef.current);
    }

    window.location.href = desktopLink;

    launchTimerRef.current = window.setTimeout(() => {
      setShowFallbackHelp(true);
      setStatus('If the desktop app did not open, use the fallback options below.');
    }, 1600);
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,116,144,0.12),_transparent_40%),linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)] px-4 py-10 sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <section className="overflow-hidden rounded-[32px] border border-slate-200/70 bg-white/90 shadow-[0_28px_90px_-50px_rgba(15,23,42,0.6)] backdrop-blur">
          <div className="grid gap-0 lg:grid-cols-[1.05fr,0.95fr]">
            <div className="border-b border-slate-200/80 p-6 sm:p-8 lg:border-b-0 lg:border-r">
              <span className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-700">
                Desktop Exam Launch
              </span>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Continue in the proctoring app
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                The exam runs in the Electron desktop app, not in this browser tab. Enter your
                room details, then continue so the desktop client can join the room and open the
                exam session automatically.
              </p>

              <div className="mt-6 grid gap-3 text-sm text-slate-600">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  1. Enter the room code, your name, and your institutional email.
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  2. Click <span className="font-semibold text-slate-900">Proceed in Desktop App</span>.
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  3. The Electron app opens, joins your room, and starts the exam flow there.
                </div>
              </div>
            </div>

            <div className="p-6 sm:p-8">
              <form onSubmit={handleSubmit} className="space-y-5">
                <label className="block space-y-2">
                  <span className="text-sm font-semibold text-slate-900">Room code</span>
                  <input
                    value={form.roomCode}
                    onChange={event =>
                      setForm(current => ({
                        ...current,
                        roomCode: normalizeRoomCode(event.target.value),
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm uppercase tracking-[0.18em] text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                    maxLength={8}
                    placeholder="AB12CD34"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-semibold text-slate-900">Full name</span>
                  <input
                    value={form.studentName}
                    onChange={event =>
                      setForm(current => ({
                        ...current,
                        studentName: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                    placeholder="Aarav Sharma"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-semibold text-slate-900">Email address</span>
                  <input
                    value={form.studentEmail}
                    onChange={event =>
                      setForm(current => ({
                        ...current,
                        studentEmail: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                    placeholder="student@example.com"
                    type="email"
                  />
                </label>

                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-cyan-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-cyan-700"
                >
                  Proceed in Desktop App
                </button>
              </form>

              {error ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}

              {status ? (
                <div className="mt-4 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
                  {status}
                </div>
              ) : null}

              <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm font-semibold text-slate-900">Prepared desktop handoff</p>
                <p className="mt-1 text-sm text-slate-600">
                  Your room and identity details are packed into the desktop launch link below.
                </p>

                <div className="mt-4 space-y-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Room code
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        readOnly
                        value={normalizedRoomCode}
                        className="flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900"
                      />
                      <button
                        type="button"
                        disabled={!normalizedRoomCode}
                        onClick={() => handleCopy(normalizedRoomCode, 'roomCode')}
                        className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {copiedField === 'roomCode' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Desktop link
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        readOnly
                        value={desktopLink}
                        className="flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs text-slate-700"
                      />
                      <button
                        type="button"
                        disabled={!desktopLink}
                        onClick={() => handleCopy(desktopLink, 'desktopLink')}
                        className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {copiedField === 'desktopLink' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {showFallbackHelp ? (
                <div className="mt-6 rounded-[28px] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
                  <p className="font-semibold">If the desktop app did not open</p>
                  <p className="mt-2 leading-6">
                    Open the Electron proctoring app manually. If it is already open, use the room
                    code above in the desktop join screen. You can also try the launch button again
                    after the app has been started once on this device.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (desktopLink) {
                          window.location.href = desktopLink;
                        }
                      }}
                      className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
                    >
                      Try desktop launch again
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(normalizedRoomCode, 'roomCode')}
                      disabled={!normalizedRoomCode}
                      className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Copy room code
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
