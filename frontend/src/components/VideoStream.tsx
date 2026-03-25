'use client';

import { useEffect, useRef } from 'react';
import { FiMic, FiMicOff, FiVideo, FiVideoOff } from 'react-icons/fi';

export interface VideoStreamProps {
  stream: MediaStream;
  studentName: string;
  peerId: string;
  isProducing: boolean;
  connectionState: 'connecting' | 'connected' | 'disconnected';
  videoEnabled: boolean;
  audioEnabled: boolean;
}

export function VideoStream({
  stream,
  studentName,
  peerId,
  isProducing,
  connectionState,
  videoEnabled,
  audioEnabled,
}: VideoStreamProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch((err) => {
        console.error('Failed to play video:', err);
      });
    }
  }, [stream]);

  const connectionTone = {
    connecting: 'bg-amber-400',
    connected: 'bg-emerald-400',
    disconnected: 'bg-red-400',
  }[connectionState];

  return (
    <article className="group relative h-full overflow-hidden rounded-[22px] border border-white/10 bg-slate-900 shadow-2xl shadow-slate-950/20">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={false}
        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
      />

      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
        <div className="flex items-center gap-2 rounded-full bg-slate-950/65 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
          <span className={`h-2.5 w-2.5 rounded-full ${connectionTone}`} />
          {connectionState}
        </div>

        <div className="flex items-center gap-2 rounded-full bg-slate-950/65 px-3 py-1.5 text-[11px] font-medium text-slate-200 backdrop-blur-sm">
          <span className="truncate">{peerId}</span>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-transparent p-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
              Student feed
            </p>
            <p className="mt-1 truncate text-base font-semibold text-white">{studentName}</p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={[
                'flex h-9 w-9 items-center justify-center rounded-full border text-white backdrop-blur-sm',
                videoEnabled
                  ? 'border-emerald-400/30 bg-emerald-500/20'
                  : 'border-red-400/30 bg-red-500/20'
              ].join(' ')}
            >
              {videoEnabled ? <FiVideo size={15} /> : <FiVideoOff size={15} />}
            </span>
            <span
              className={[
                'flex h-9 w-9 items-center justify-center rounded-full border text-white backdrop-blur-sm',
                audioEnabled
                  ? 'border-emerald-400/30 bg-emerald-500/20'
                  : 'border-red-400/30 bg-red-500/20'
              ].join(' ')}
            >
              {audioEnabled ? <FiMic size={15} /> : <FiMicOff size={15} />}
            </span>
          </div>
        </div>
      </div>

      {!isProducing && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/72 backdrop-blur-sm">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-5 text-center">
            <FiVideoOff size={28} className="mx-auto text-slate-200" />
            <p className="mt-3 text-sm font-semibold text-white">Camera paused</p>
            <p className="mt-1 text-xs text-slate-300">Waiting for the student video feed.</p>
          </div>
        </div>
      )}
    </article>
  );
}
