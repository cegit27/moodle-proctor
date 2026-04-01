'use client';

import { useEffect, useRef, useState } from 'react';
import { FiCheckCircle, FiGrid, FiLoader, FiRadio, FiUsers } from 'react-icons/fi';
import { useWebRTC } from '@/hooks/useWebRTC';
import { VideoStream } from './VideoStream';

const MAX_VISIBLE_SLOTS = 15;
const SNAPSHOT_POLL_INTERVAL_MS = 500;
const SNAPSHOT_STALE_THRESHOLD_MS = 3000;

interface SnapshotFeed {
  feedId: string;
  attemptId: number | null;
  userId: number;
  studentName: string;
  imageDataUrl: string;
  updatedAt: number;
}

interface StudentsGridProps {
  roomId?: string;
}

export const StudentsGrid = ({ roomId }: StudentsGridProps) => {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
  const hasAutoJoined = useRef(false);
  const previousRoomId = useRef<string | undefined>(undefined);
  const [snapshotFeeds, setSnapshotFeeds] = useState<SnapshotFeed[]>([]);
  const snapshotSinceRef = useRef(0);
  const snapshotFetchInFlightRef = useRef(false);

  const teacherPeerId = useRef(`teacher-${Date.now()}`);

  const { peers, isConnected, error, joinRoom, leaveRoom, getRemoteStreams } = useWebRTC({
    roomId: roomId ?? '',
    peerId: teacherPeerId.current,
    userId: 0,
    studentName: 'Teacher',
    backendUrl,
  });

  const remoteStreams = getRemoteStreams();
  const videoStreams = remoteStreams.filter((streamInfo) => streamInfo.kind === 'video');
  const hasWebRtcFeeds = videoStreams.length > 0;
  const occupiedSlots = Math.min(
    hasWebRtcFeeds ? videoStreams.length : snapshotFeeds.length,
    MAX_VISIBLE_SLOTS
  );
  const availableSlots = Math.max(MAX_VISIBLE_SLOTS - occupiedSlots, 0);

  useEffect(() => {
    if (!roomId) {
      setSnapshotFeeds([]);
      snapshotSinceRef.current = 0;
      snapshotFetchInFlightRef.current = false;
      return;
    }

    let isMounted = true;

    const loadSnapshots = async () => {
      if (snapshotFetchInFlightRef.current) {
        return;
      }

      snapshotFetchInFlightRef.current = true;

      try {
        const response = await fetch(
          `${backendUrl}/api/live-monitoring/rooms/${encodeURIComponent(roomId)}/frames?since=${snapshotSinceRef.current}`,
          {
            credentials: 'include',
          }
        );

        if (!response.ok) {
          return;
        }

        const result = await response.json().catch(() => null);
        const frames = Array.isArray(result?.data?.frames) ? result.data.frames : [];
        const activeFeedIds = Array.isArray(result?.data?.activeFeedIds)
          ? result.data.activeFeedIds
          : [];
        const roomUpdatedAt =
          typeof result?.data?.roomUpdatedAt === 'number' ? result.data.roomUpdatedAt : 0;

        if (isMounted) {
          setSnapshotFeeds(previousFeeds => {
            const nextFeeds = new Map(previousFeeds.map(feed => [feed.feedId, feed]));

            for (const frame of frames) {
              if (!frame?.feedId) {
                continue;
              }

              nextFeeds.set(frame.feedId, frame as SnapshotFeed);
            }

            for (const feedId of Array.from(nextFeeds.keys())) {
              if (!activeFeedIds.includes(feedId)) {
                nextFeeds.delete(feedId);
              }
            }

            return Array.from(nextFeeds.values())
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .slice(0, MAX_VISIBLE_SLOTS);
          });
        }

        if (roomUpdatedAt > snapshotSinceRef.current) {
          snapshotSinceRef.current = roomUpdatedAt;
        }
      } catch {
        // Keep the last good frame set in place to avoid wall flicker on transient failures.
      } finally {
        snapshotFetchInFlightRef.current = false;
      }
    };

    snapshotSinceRef.current = 0;
    loadSnapshots().catch(console.error);
    const timerId = window.setInterval(() => {
      loadSnapshots().catch(console.error);
    }, SNAPSHOT_POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(timerId);
    };
  }, [backendUrl, roomId]);

  useEffect(() => {
    if (previousRoomId.current === undefined && roomId === undefined) {
      return;
    }

    if (previousRoomId.current !== roomId) {
      if (previousRoomId.current !== undefined && isConnected) {
        leaveRoom();
        hasAutoJoined.current = false;
      }

      if (roomId !== undefined && !hasAutoJoined.current) {
        setTimeout(() => {
          joinRoom().catch(console.error);
          hasAutoJoined.current = true;
        }, 100);
      }

      previousRoomId.current = roomId;
    }
  }, [roomId, isConnected, joinRoom, leaveRoom]);

  useEffect(() => {
    if (roomId && !hasAutoJoined.current) {
      hasAutoJoined.current = true;
      joinRoom().catch(console.error);
    }
  }, [joinRoom, roomId]);

  if (!roomId) {
    return (
      <section className="surface-panel section-card">
        <div className="empty-state px-6 py-14">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm">
            <FiUsers className="h-6 w-6" />
          </div>
          <h3 className="mt-5 text-lg font-semibold text-slate-900">
            No monitoring room selected yet
          </h3>
          <p className="mt-2 text-sm text-slate-500">
            Create a room or switch to an active room to bring the student wall online.
          </p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="surface-panel section-card">
        <div className="rounded-[24px] border border-red-200 bg-red-50 px-5 py-5 text-red-800">
          <p className="font-semibold">Monitoring unavailable</p>
          <p className="mt-2 text-sm leading-6">{error}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="surface-panel section-card">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <span className="eyebrow-pill">Live grid</span>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
              Student camera wall
            </h2>
            <p className="section-copy mt-3 max-w-2xl">
              Review camera availability, room connection health, and the live feed wall from one
              focused surface.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 xl:max-w-[34rem] xl:justify-end">
            <span className="info-chip">
              <FiRadio className="h-3.5 w-3.5" />
              {isConnected ? 'Room connected' : 'Joining room'}
            </span>
            <span className="info-chip">
              <FiGrid className="h-3.5 w-3.5" />
              {hasWebRtcFeeds ? videoStreams.length : snapshotFeeds.length} active feeds
            </span>
            <span className="info-chip">
              <FiUsers className="h-3.5 w-3.5" />
              {occupiedSlots}/{MAX_VISIBLE_SLOTS} wall slots used
            </span>
            <span className="info-chip font-mono uppercase tracking-[0.16em]">
              Room {roomId}
            </span>
          </div>
        </div>

        {!isConnected && (
          <div className="surface-subtle flex items-center gap-3 rounded-[24px] px-4 py-4 text-slate-700">
            <FiLoader className="h-4 w-4 animate-spin text-emerald-700" />
            <p className="text-sm font-medium">
              Establishing the live room connection and preparing the monitoring wall.
            </p>
          </div>
        )}

        {isConnected && peers.length === 0 && (
          <div className="empty-state px-6 py-14">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm">
              <FiUsers className="h-6 w-6" />
            </div>
            <h3 className="mt-5 text-lg font-semibold text-slate-900">
              Waiting for students to enter the room
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              The wall will populate as soon as participants connect their desktop client.
            </p>
          </div>
        )}

        {(videoStreams.length > 0 || snapshotFeeds.length > 0) && (
          <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-slate-950 px-4 py-4 shadow-[0_30px_70px_-38px_rgba(15,23,42,0.85)]">
            <div className="mb-5 flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Proctoring wall
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  {(hasWebRtcFeeds ? videoStreams.length : snapshotFeeds.length)} live camera feed
                  {(hasWebRtcFeeds ? videoStreams.length : snapshotFeeds.length) === 1 ? '' : 's'} and{' '}
                  {availableSlots} standby slot{availableSlots === 1 ? '' : 's'} remaining.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                <FiCheckCircle className="h-4 w-4" />
                Camera wall live
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {hasWebRtcFeeds
                ? videoStreams.map((streamInfo) => {
                    const peer = peers.find((participant) => participant.peerId === streamInfo.peerId);

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
                  })
                : snapshotFeeds.map((feed) => (
                    <article
                      key={feed.feedId}
                      className="group relative min-h-[240px] overflow-hidden rounded-[24px] border border-white/10 bg-slate-900 shadow-2xl shadow-slate-950/20"
                    >
                      <img
                        src={feed.imageDataUrl}
                        alt={`${feed.studentName} live snapshot`}
                        loading="eager"
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.015]"
                      />

                      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
                        <div className="flex items-center gap-2 rounded-full bg-slate-950/70 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
                          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                          live snapshot
                        </div>

                        <div className="rounded-full bg-slate-950/70 px-3 py-1.5 text-[11px] font-medium text-slate-200 backdrop-blur-sm">
                          {Date.now() - feed.updatedAt > SNAPSHOT_STALE_THRESHOLD_MS
                            ? 'reconnecting'
                            : `${Math.max(0, Math.round((Date.now() - feed.updatedAt) / 1000))}s ago`}
                        </div>
                      </div>

                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950 via-slate-950/75 to-transparent p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                          Student feed
                        </p>
                        <p className="mt-1 truncate text-base font-semibold text-white">
                          {feed.studentName}
                        </p>
                      </div>
                    </article>
                  ))}

              {availableSlots > 0 &&
                Array.from({ length: availableSlots }).map((_, idx) => (
                  <div
                    key={`placeholder-${idx}`}
                    className="flex min-h-[240px] items-center justify-center rounded-[24px] border border-dashed border-white/15 bg-white/5 p-6 text-center"
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

        {(peers.length > 0 || snapshotFeeds.length > 0) && (
          <div className="surface-card rounded-[24px] px-4 py-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Active students
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Quick roster view for participants currently attached to this room.
                </p>
              </div>
              <span className="text-sm font-semibold text-slate-900">
                {hasWebRtcFeeds ? peers.length : snapshotFeeds.length} connected
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {hasWebRtcFeeds
                ? peers.map((peer) => (
                    <div
                      key={peer.peerId}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700"
                    >
                      {peer.studentName}
                    </div>
                  ))
                : snapshotFeeds.map((feed) => (
                    <div
                      key={feed.feedId}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700"
                    >
                      {feed.studentName}
                    </div>
                  ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
