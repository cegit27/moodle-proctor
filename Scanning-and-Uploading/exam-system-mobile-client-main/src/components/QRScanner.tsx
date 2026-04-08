'use client';

import { useEffect, useRef, useCallback } from 'react';

interface QRScannerProps {
  onScan: (data: string) => void;
  active?: boolean;
  onError?: (message: string) => void;
}

function getCameraErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      return 'Camera access was denied.';
    }

    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return 'No camera was found on this device.';
    }

    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return 'The camera is already in use by another app.';
    }
  }

  return 'The camera could not be started.';
}

export default function QRScanner({
  onScan,
  active = true,
  onError,
}: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const scannedRef = useRef(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    cancelAnimationFrame(rafRef.current);
  }, []);

  const scanFrame = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || scannedRef.current || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    const { videoWidth: w, videoHeight: h } = video;
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);

    const imageData = ctx.getImageData(0, 0, w, h);

    // Dynamic import to keep bundle small
    const jsQR = (await import('jsqr')).default;
    const code = jsQR(imageData.data, w, h, {
      inversionAttempts: 'dontInvert',
    });

    if (code?.data) {
      scannedRef.current = true;
      if ('vibrate' in navigator) navigator.vibrate([60, 30, 60]);
      stopCamera();
      onScan(code.data);
      return;
    }

    rafRef.current = requestAnimationFrame(scanFrame);
  }, [onScan, stopCamera]);

  useEffect(() => {
    if (!active) return;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          rafRef.current = requestAnimationFrame(scanFrame);
        }
      } catch (err) {
        console.error('Camera error:', err);
        onError?.(getCameraErrorMessage(err));
      }
    };

    start();
    return stopCamera;
  }, [active, onError, scanFrame, stopCamera]);

  return (
    <>
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        playsInline
        muted
      />
      {/* Hidden canvas for QR processing */}
      <canvas ref={canvasRef} className="hidden" />
    </>
  );
}
