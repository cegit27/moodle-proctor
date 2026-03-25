'use client';

import { useEffect, useRef } from 'react';
import { FiCheckCircle, FiGrid, FiLoader, FiRadio, FiUsers } from 'react-icons/fi';
import { useWebRTC } from '@/hooks/useWebRTC';
import { VideoStream } from './VideoStream';

const MAX_VISIBLE_SLOTS = 15;

export const StudentsGrid = () => {
  const roomId = 'exam-monitoring-room';
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
  const hasAutoJoined = useRef(false);

  const teacherPeerId = useRef(`teacher-${Date.now()}`);

  const { peers, isConnected, error, joinRoom, getRemoteStreams } = useWebRTC({
    roomId,
    peerId: teacherPeerId.current,
    userId: 0,
    studentName: 'Teacher',
    backendUrl,
  });

  const remoteStreams = getRemoteStreams();
  const videoStreams = remoteStreams.filter((streamInfo) => streamInfo.kind === 'video');
  const occupiedSlots = Math.min(videoStreams.length, MAX_VISIBLE_SLOTS);
  const availableSlots = Math.max(MAX_VISIBLE_SLOTS - occupiedSlots, 0);
  const occupancy = `${occupiedSlots}/${MAX_VISIBLE_SLOTS}`;

  useEffect(() => {
    if (hasAutoJoined.current) {
      return;
    }

    hasAutoJoined.current = true;
    joinRoom().catch(console.error);
  }, [joinRoom]);

  if (error) {
    return (
      <section className="dashboard-panel rounded-[28px] p-5 md:p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">
          <p className="font-semibold">Monitoring unavailable</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="dashboard-panel rounded-[28px] p-5 md:p-6">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="dashboard-kicker">Live Grid</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
              Student camera wall
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Review active feeds, connection stability, and camera readiness from a
              single monitoring surface.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-500">Room connection</span>
                <span
                  className={[
                    'flex h-10 w-10 items-center justify-center rounded-xl',
                    isConnected ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                  ].join(' ')}
                >
                  <FiRadio className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-4 text-xl font-semibold text-slate-900">
                {isConnected ? 'Connected' : 'Connecting'}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-500">Active streams</span>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                  <FiGrid className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-4 text-xl font-semibold text-slate-900">{videoStreams.length}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-500">Grid occupancy</span>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <FiUsers className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-4 text-xl font-semibold text-slate-900">{occupancy}</p>
            </div>
          </div>
        </div>

        {!isConnected && (
          <div className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-blue-800">
            <FiLoader className="h-4 w-4 animate-spin" />
            <p className="text-sm font-medium">
              Establishing connection to the monitoring server and preparing the video wall.
            </p>
          </div>
        )}

        {isConnected && peers.length === 0 && (
          <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm">
              <FiUsers className="h-6 w-6" />
            </div>
            <h3 className="mt-5 text-lg font-semibold text-slate-900">
              Waiting for students to enter the room
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              The grid will populate automatically as participants join the monitoring session.
            </p>
          </div>
        )}

        {videoStreams.length > 0 && (
          <div className="rounded-[24px] border border-slate-200 bg-slate-950/95 p-3 md:p-4">
            <div className="mb-4 flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Proctoring wall
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  {videoStreams.length} active feeds with {availableSlots} standby slot
                  {availableSlots === 1 ? '' : 's'} remaining.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
                <FiCheckCircle className="h-4 w-4" />
                Camera wall live
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {videoStreams.map((streamInfo) => {
                const peer = peers.find((p) => p.peerId === streamInfo.peerId);

                return (
                  <div key={`${streamInfo.peerId}-${streamInfo.producerId}`} className="min-h-[240px]">
                    {peer && (
                      <VideoStream
                        stream={streamInfo.stream}
                        studentName={peer.studentName}
                        peerId={peer.peerId}
                        isProducing={peer.isProducing}
                        connectionState={peer.connectionState}
                        videoEnabled={peer.videoEnabled}
                        audioEnabled={peer.audioEnabled}
                      />
                    )}
                  </div>
                );
              })}

              {availableSlots > 0 &&
                Array.from({ length: availableSlots }).map((_, idx) => (
                  <div
                    key={`placeholder-${idx}`}
                    className="flex min-h-[240px] items-center justify-center rounded-[22px] border border-dashed border-white/15 bg-white/5 p-6 text-center"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-200">Standby slot</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-500">
                        Position {occupiedSlots + idx + 1}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {peers.length > 0 && (
          <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Active Students
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Quick roster view for everyone currently connected to the room.
                </p>
              </div>
              <span className="text-sm font-semibold text-slate-900">{peers.length} connected</span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {peers.map((peer) => (
                <div
                  key={peer.peerId}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700"
                >
                  {peer.studentName}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
