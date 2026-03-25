'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useWebRTCProducer } from '@/hooks/useWebRTCProducer';

const DEFAULT_ROOM_ID = 'exam-monitoring-room';

function LocalVideoPreview({ stream }: { stream: MediaStream | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl shadow-slate-200/50">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">Local Preview</p>
          <p className="text-xs text-slate-500">This is what the monitoring workspace should receive.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
          muted locally
        </span>
      </div>
      <div className="aspect-video bg-slate-950">
        {stream ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Start the broadcast to preview your camera feed.
          </div>
        )}
      </div>
    </div>
  );
}

export default function StudentDemoPage() {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
  const [roomId, setRoomId] = useState(DEFAULT_ROOM_ID);
  const [studentNameInput, setStudentNameInput] = useState('Demo Student');
  const stablePeerId = useRef(`student-${Date.now()}`);
  const normalizedStudentName = useMemo(
    () => studentNameInput.trim() || 'Demo Student',
    [studentNameInput]
  );

  const {
    localStream,
    isConnected,
    isProducing,
    error,
    startBroadcast,
    stopBroadcast,
  } = useWebRTCProducer({
    roomId,
    peerId: stablePeerId.current,
    studentName: normalizedStudentName,
    backendUrl,
  });

  const handleStart = async (event: FormEvent) => {
    event.preventDefault();
    await startBroadcast();
  };

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <section className="dashboard-panel overflow-hidden rounded-[32px] px-6 py-6 sm:px-8 sm:py-8">
          <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
            <div className="space-y-4">
              <span className="inline-flex rounded-full border border-sky-300 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
                Student Broadcaster
              </span>
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                  Push webcam and mic into the live monitoring room
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                  Use this page as the demo student tab. Open the operations dashboard in another
                  logged-in tab and both pages should meet inside the same mediasoup room.
                </p>
              </div>

              <form onSubmit={handleStart} className="grid gap-4 rounded-[24px] border border-slate-200 bg-white p-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-900">Room ID</span>
                    <input
                      value={roomId}
                      onChange={event => setRoomId(event.target.value)}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                      placeholder={DEFAULT_ROOM_ID}
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-900">Student Name</span>
                    <input
                      value={studentNameInput}
                      onChange={event => setStudentNameInput(event.target.value)}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                      placeholder="Demo Student"
                    />
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700"
                  >
                    Start broadcast
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      stopBroadcast().catch(console.error);
                    }}
                    className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
                  >
                    Stop broadcast
                  </button>
                  <div className="ml-auto flex flex-wrap gap-2 text-xs font-semibold">
                    <span
                      className={`rounded-full px-3 py-1 ${
                        isConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      transport: {isConnected ? 'connected' : 'waiting'}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 ${
                        isProducing ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      media: {isProducing ? 'publishing' : 'idle'}
                    </span>
                  </div>
                </div>

                {error ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                  </div>
                ) : null}
              </form>
            </div>

            <LocalVideoPreview stream={localStream} />
          </div>
        </section>
      </div>
    </main>
  );
}
