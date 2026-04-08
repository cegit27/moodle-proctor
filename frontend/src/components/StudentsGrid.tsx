'use client';

import { useEffect, useRef, useState } from 'react';
import { FiLoader, FiMonitor, FiUsers, FiWifi } from 'react-icons/fi';

import { useWebRTC } from '@/hooks/useWebRTC';
import { VideoStream } from './VideoStream';

const MAX_VISIBLE_SLOTS = 15;
const SNAPSHOT_POLL_INTERVAL_MS = 500;
const SNAPSHOT_STALE_THRESHOLD_MS = 3000;
const CONNECTION_LOADING_TIMEOUT_MS = 5000;

interface SnapshotFeed {
  feedId: string;
  attemptId: number | null;
  userId: number;
  studentName: string;
  imageDataUrl: string;
  updatedAt: number;
}

export interface MonitoringStudentSelection {
  enrollmentId?: number | null;
  attemptId?: number | null;
  userId?: number | null;
  studentName: string;
  studentEmail?: string | null;
}

interface StudentsGridProps {
  roomId?: string;
  onStudentSelect?: (student: MonitoringStudentSelection) => void;
  selectedStudentName?: string | null;
}

export const StudentsGrid = ({
  roomId,
  onStudentSelect,
  selectedStudentName,
}: StudentsGridProps) => {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
  const hasAutoJoined = useRef(false);
  const previousRoomId = useRef<string | undefined>(undefined);
  const [snapshotFeeds, setSnapshotFeeds] = useState<SnapshotFeed[]>([]);
  const [showConnectionLoading, setShowConnectionLoading] = useState(true);
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

  useEffect(() => {
    if (!roomId) {
      setSnapshotFeeds([]);
      setShowConnectionLoading(true);
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
          setSnapshotFeeds((previousFeeds) => {
            const nextFeeds = new Map(previousFeeds.map((feed) => [feed.feedId, feed]));

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
        // Keep the latest usable snapshot set during transient polling failures.
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
    if (!roomId) {
      setShowConnectionLoading(true);
      return;
    }

    if (isConnected || snapshotFeeds.length > 0 || videoStreams.length > 0) {
      setShowConnectionLoading(false);
      return;
    }

    setShowConnectionLoading(true);
    const timerId = window.setTimeout(() => {
      setShowConnectionLoading(false);
    }, CONNECTION_LOADING_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [isConnected, roomId, snapshotFeeds.length, videoStreams.length]);

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
      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-10 text-center">
        <FiMonitor className="mx-auto h-8 w-8 text-slate-400" />
        <h3 className="mt-3 text-lg font-semibold text-slate-900">No room selected</h3>
        <p className="mt-1 text-sm text-slate-500">
          Create a room or switch to an active room to start monitoring students.
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-[20px] border border-red-200 bg-red-50 px-5 py-5 text-sm text-red-700">
        {error}
      </section>
    );
  }

  const totalFeeds = hasWebRtcFeeds ? videoStreams.length : snapshotFeeds.length;

  return (
    <section className="rounded-[20px] border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Live monitoring</h2>
            <p className="mt-1 text-sm text-slate-600">
              Click a student tile to view warnings and attempt details.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700">
              <FiWifi className="h-4 w-4" />
              {isConnected ? 'Connected' : 'Connecting'}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700">
              <FiUsers className="h-4 w-4" />
              {totalFeeds} student{totalFeeds === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      </div>

      <div className="px-5 py-5">
        {showConnectionLoading && totalFeeds === 0 ? (
          <div className="flex items-center justify-center gap-2 rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-10 text-sm text-slate-600">
            <FiLoader className="h-4 w-4 animate-spin" />
            Connecting to the room...
          </div>
        ) : null}

        {!showConnectionLoading && totalFeeds === 0 ? (
          <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            Waiting for students to join this room.
          </div>
        ) : null}

        {totalFeeds > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {hasWebRtcFeeds
              ? videoStreams.map((streamInfo) => {
                  const peer = peers.find((participant) => participant.peerId === streamInfo.peerId);
                  if (!peer) {
                    return null;
                  }

                  const isSelected = selectedStudentName === peer.studentName;

                  return (
                    <button
                      key={`${streamInfo.peerId}-${streamInfo.producerId}`}
                      type="button"
                      onClick={() =>
                        onStudentSelect?.({
                          userId: peer.userId || null,
                          studentName: peer.studentName,
                        })
                      }
                      className={`overflow-hidden rounded-[18px] border text-left ${
                        isSelected ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-slate-200'
                      }`}
                    >
                      <div className="aspect-video bg-slate-950">
                        <VideoStream
                          stream={streamInfo.stream}
                          studentName={peer.studentName}
                          peerId={peer.peerId}
                          isProducing={peer.isProducing}
                          connectionState={peer.connectionState}
                          videoEnabled={peer.videoEnabled}
                          audioEnabled={peer.audioEnabled}
                        />
                      </div>
                    </button>
                  );
                })
              : snapshotFeeds.map((feed) => {
                  const isSelected = selectedStudentName === feed.studentName;

                  return (
                    <button
                      key={feed.feedId}
                      type="button"
                      onClick={() =>
                        onStudentSelect?.({
                          attemptId: feed.attemptId,
                          userId: feed.userId,
                          studentName: feed.studentName,
                        })
                      }
                      className={`overflow-hidden rounded-[18px] border text-left ${
                        isSelected ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-slate-200'
                      }`}
                    >
                      <div className="aspect-video bg-slate-950">
                        <img
                          src={feed.imageDataUrl}
                          alt={`${feed.studentName} monitoring snapshot`}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3 px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{feed.studentName}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {Date.now() - feed.updatedAt > SNAPSHOT_STALE_THRESHOLD_MS
                              ? 'Reconnecting'
                              : 'Live snapshot'}
                          </p>
                        </div>
                        <span className="text-xs text-slate-500">
                          {Math.max(0, Math.round((Date.now() - feed.updatedAt) / 1000))}s
                        </span>
                      </div>
                    </button>
                  );
                })}
          </div>
        ) : null}
      </div>
    </section>
  );
};
