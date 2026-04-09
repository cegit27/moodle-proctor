'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { FiCopy, FiExternalLink } from 'react-icons/fi';

const FORM_STORAGE_KEY = 'student-desktop-launch-form';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROOM_CODE_REGEX = /^[A-Z0-9]{8}$/;

interface LaunchFormState {
  roomCode: string;
  studentName: string;
  studentEmail: string;
}

interface LaunchContextState {
  examName: string;
  courseName: string;
}

function normalizeRoomCode(roomCode: string) {
  return roomCode.replace(/\s/g, '').toUpperCase();
}

export default function StudentDesktopLaunchPage() {
  const launchTimerRef = useRef<number | null>(null);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [hasAcceptedRules, setHasAcceptedRules] = useState(false);
  const [form, setForm] = useState<LaunchFormState>({
    roomCode: '',
    studentName: '',
    studentEmail: '',
  });
  const [context, setContext] = useState<LaunchContextState>({
    examName: '',
    courseName: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [showFallback, setShowFallback] = useState(false);
  const [copiedField, setCopiedField] = useState<'roomCode' | 'desktopLink' | null>(null);

  const normalizedRoomCode = useMemo(() => normalizeRoomCode(form.roomCode), [form.roomCode]);
  const normalizedStudentName = useMemo(() => form.studentName.trim(), [form.studentName]);
  const normalizedStudentEmail = useMemo(
    () => form.studentEmail.trim().toLowerCase(),
    [form.studentEmail]
  );
  const warningLimitCopy = 'the warning limit set for this exam';

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
      const searchParams = new URLSearchParams(window.location.search);
      const queryCode = searchParams.get('code');
      const queryExamName = searchParams.get('exam');
      const queryCourseName = searchParams.get('course');

      if (!storedForm && !queryCode) {
        return;
      }

      const parsedForm = storedForm ? (JSON.parse(storedForm) as Partial<LaunchFormState>) : {};

      setForm({
        roomCode: normalizeRoomCode(queryCode || parsedForm.roomCode || ''),
        studentName: parsedForm.studentName || '',
        studentEmail: parsedForm.studentEmail || '',
      });
      setContext({
        examName: queryExamName || '',
        courseName: queryCourseName || '',
      });
    } catch (storageError) {
      console.error('Failed to restore student launch form:', storageError);
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
      window.setTimeout(() => setCopiedField(null), 1800);
    } catch (copyError) {
      console.error('Failed to copy student launch value:', copyError);
    }
  };

  const validateLaunchForm = () => {
    if (!normalizedStudentName || normalizedStudentName.length < 2) {
      setError('Enter your full name.');
      return false;
    }

    if (!EMAIL_REGEX.test(normalizedStudentEmail)) {
      setError('Enter a valid email address.');
      return false;
    }

    if (!ROOM_CODE_REGEX.test(normalizedRoomCode)) {
      setError('Enter the 8-character room code.');
      return false;
    }

    setError(null);
    setShowFallback(false);
    return true;
  };

  const launchDesktopApp = () => {
    setStatus('Opening the desktop app...');

    if (launchTimerRef.current !== null) {
      window.clearTimeout(launchTimerRef.current);
    }

    window.location.href = desktopLink;

    launchTimerRef.current = window.setTimeout(() => {
      setShowFallback(true);
      setStatus('If the app did not open, use the fallback options below.');
    }, 1600);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validateLaunchForm()) {
      return;
    }

    setHasAcceptedRules(false);
    setIsRulesModalOpen(true);
    setStatus('Please review the exam rules before opening the desktop app.');
  };

  const handleConfirmLaunch = () => {
    setIsRulesModalOpen(false);
    launchDesktopApp();
  };

  const handleCloseRulesModal = () => {
    setIsRulesModalOpen(false);
    setHasAcceptedRules(false);
    setStatus('Exam start cancelled. Review the rules when you are ready.');
  };

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <section className="rounded-[20px] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-5">
            <h1 className="text-2xl font-semibold text-slate-950">Start exam in desktop app</h1>
            <p className="mt-1 text-sm text-slate-600">
              Fill your details below, then continue in the Electron exam app.
            </p>
          </div>

          <div className="px-6 py-5">
            <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Assigned exam</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">
                {context.examName || 'Scheduled exam'}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {context.courseName || 'Course details will appear here when opened from Moodle.'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-900">Room code</span>
                <input
                  value={form.roomCode}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      roomCode: normalizeRoomCode(event.target.value),
                    }))
                  }
                  className="input-field uppercase tracking-[0.18em]"
                  maxLength={8}
                  placeholder="AB12CD34"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-900">Full name</span>
                <input
                  value={form.studentName}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      studentName: event.target.value,
                    }))
                  }
                  className="input-field"
                  placeholder="Student name"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-900">Email address</span>
                <input
                  value={form.studentEmail}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      studentEmail: event.target.value,
                    }))
                  }
                  className="input-field"
                  placeholder="student@example.com"
                  type="email"
                />
              </label>

              <button type="submit" className="btn-primary w-full">
                <FiExternalLink className="h-4 w-4" />
                Open desktop app
              </button>
            </form>

            {error ? (
              <div className="mt-4 rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {status ? (
              <div className="mt-4 rounded-[14px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {status}
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-sm font-semibold text-slate-900">Room code</p>
                <div className="mt-3 flex gap-2">
                  <input readOnly value={normalizedRoomCode} className="input-field flex-1 font-semibold uppercase" />
                  <button
                    type="button"
                    onClick={() => handleCopy(normalizedRoomCode, 'roomCode')}
                    disabled={!normalizedRoomCode}
                    className="btn-secondary"
                  >
                    {copiedField === 'roomCode' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-sm font-semibold text-slate-900">Desktop link</p>
                <div className="mt-3 flex gap-2">
                  <input readOnly value={desktopLink} className="input-field flex-1 text-xs" />
                  <button
                    type="button"
                    onClick={() => handleCopy(desktopLink, 'desktopLink')}
                    disabled={!desktopLink}
                    className="btn-secondary"
                  >
                    {copiedField === 'desktopLink' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>

            {showFallback ? (
              <div className="mt-5 rounded-[16px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                <p className="font-semibold">If the desktop app did not open</p>
                <p className="mt-2">
                  Open the Electron app manually and enter the room code, or try the launch again.
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (desktopLink) {
                        window.location.href = desktopLink;
                      }
                    }}
                    className="btn-primary"
                  >
                    Try again
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy(normalizedRoomCode, 'roomCode')}
                    disabled={!normalizedRoomCode}
                    className="btn-secondary"
                  >
                    <FiCopy className="h-4 w-4" />
                    Copy room code
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {isRulesModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
            <div className="w-full max-w-2xl rounded-[24px] border border-slate-200 bg-white shadow-2xl">
              <div className="border-b border-slate-200 px-6 py-5">
                <h2 className="text-2xl font-semibold text-slate-950">Exam rules and conditions</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Read these rules carefully. Warnings are recorded during the exam, and the exam will end automatically at {warningLimitCopy}.
                </p>
              </div>

              <div className="px-6 py-5">
                <ul className="space-y-3 text-sm text-slate-700">
                  <li>Your camera must stay on before and during the exam.</li>
                  <li>Leaving fullscreen or kiosk mode counts as a warning.</li>
                  <li>Switching away from the exam window or hiding it counts as a warning.</li>
                  <li>Blocked apps such as browsers, chat apps, or meeting apps may be closed automatically.</li>
                  <li>Printing during the exam counts as a warning.</li>
                  <li>Leaving the exam before submission may submit your attempt immediately.</li>
                  <li>Each warning increases your warning count and is saved in the proctoring log.</li>
                  <li>At {warningLimitCopy}, the exam is submitted automatically and cannot be resumed.</li>
                </ul>

                <div className="mt-5 rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-sm font-semibold text-slate-900">AI proctoring checks</p>
                  <p className="mt-2 text-sm text-slate-600">
                    If AI proctoring is enabled for this exam, warnings may also be raised for the checks below.
                  </p>
                  <ul className="mt-3 space-y-2 text-sm text-slate-700">
                    <li>Face monitoring: keep your face visible and stay in frame.</li>
                    <li>Gaze tracking: keep your attention on the exam screen.</li>
                    <li>Phone detection: do not hold or use a mobile phone during the exam.</li>
                    <li>Forbidden object detection: keep banned items away from the exam area.</li>
                    <li>Identity verification: only the registered student may remain in view.</li>
                  </ul>
                </div>

                <label className="mt-5 flex items-start gap-3 rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <input
                    type="checkbox"
                    checked={hasAcceptedRules}
                    onChange={(event) => setHasAcceptedRules(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-sm text-slate-700">
                    I have read and understood the exam rules, AI warning checks, warning policy, and automatic submission policy.
                  </span>
                </label>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:justify-end">
                <button type="button" onClick={handleCloseRulesModal} className="btn-secondary">
                  Not now
                </button>
                <button
                  type="button"
                  onClick={handleConfirmLaunch}
                  disabled={!hasAcceptedRules}
                  className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  I understand, open desktop app
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
