'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useScanStore } from '@/store/scanStore';
import QRScanner from '@/components/QRScanner';
import { ScanSessionRequestError, validateScanSession } from '@/lib/api';

type Stage = 'idle' | 'scanning' | 'processing' | 'error';

function getCameraErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      return 'Camera access was denied.';
    }

    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return 'No camera was found on this device.';
    }

    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return 'The camera is already being used by another app.';
    }
  }

  return 'The camera could not be started.';
}

export default function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSession = useScanStore((s) => s.setSession);
  const reset = useScanStore((s) => s.reset);

  const [stage, setStage] = useState<Stage>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [cameraPermission, setCameraPermission] = useState<
    'unknown' | 'granted' | 'denied'
  >('unknown');
  const processedRef = useRef(false);

  useEffect(() => {
    const id = searchParams.get('id');
    if (id && !processedRef.current) {
      processedRef.current = true;
      handleToken(id);
    }
  }, [searchParams]);

  const handleToken = async (token: string) => {
    setStage('processing');
    try {
      if (token.length < 8) {
        throw new Error('Invalid QR code');
      }

      const session = await validateScanSession(token);
      reset();
      setSession(session);
      router.push('/upload');
    } catch (err) {
      if (err instanceof ScanSessionRequestError && err.session) {
        reset();
        setSession(err.session);
        router.push('/upload');
        return;
      }

      setErrorMsg(
        err instanceof Error ? err.message : 'QR code not recognised'
      );
      setStage('error');
    }
  };

  const startScan = async () => {
    setErrorMsg('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
        },
        audio: false,
      });

      stream.getTracks().forEach((track) => track.stop());
      setCameraPermission('granted');
      setStage('scanning');
    } catch (error) {
      const message = getCameraErrorMessage(error);
      const denied =
        error instanceof DOMException &&
        (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError');

      setCameraPermission(denied ? 'denied' : 'unknown');
      setErrorMsg(message);

      if (!denied) {
        setStage('error');
      }
    }
  };

  const handleScannerError = (message: string) => {
    setStage('idle');
    setErrorMsg(message);

    if (/denied/i.test(message)) {
      setCameraPermission('denied');
      return;
    }

    setCameraPermission('unknown');
  };

  const retry = () => {
    setStage('idle');
    setErrorMsg('');
    processedRef.current = false;
  };

  return (
    <div className="flex flex-col min-h-screen bg-bg overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: `radial-gradient(circle at 20% 20%, #00e5c8 0%, transparent 50%),
                              radial-gradient(circle at 80% 80%, #0066ff 0%, transparent 50%)`,
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `repeating-linear-gradient(
              0deg, transparent, transparent 39px, #ffffff 39px, #ffffff 40px
            ), repeating-linear-gradient(
              90deg, transparent, transparent 39px, #ffffff 39px, #ffffff 40px
            )`,
          }}
        />
      </div>

      <div className="relative z-10 flex flex-col flex-1 px-6 pt-safe-top">
        <div className="pt-10 pb-8 animate-fade-up" style={{ animationDelay: '0ms' }}>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="font-mono text-xs tracking-widest text-accent uppercase">
              AI Proctor
            </span>
          </div>
          <h1 className="font-display text-3xl font-extrabold text-text-primary leading-tight">
            Answer Sheet
            <br />
            <span className="text-accent">Upload</span>
          </h1>
          <p className="mt-2 text-text-secondary text-sm leading-relaxed">
            Scan the QR code shown after your exam to open your upload session and
            continue to the PDF submission step.
          </p>
        </div>

        <div
          className="flex-1 flex flex-col items-center justify-center animate-fade-up"
          style={{ animationDelay: '120ms' }}
        >
          {stage === 'idle' && (
            <div className="w-full flex flex-col items-center gap-8">
              <div className="relative">
                <div
                  className="w-52 h-52 rounded-2xl border-2 border-dashed border-accent/40
                    flex items-center justify-center bg-surface"
                >
                  <QRIllustration />
                </div>
                {[
                  'top-0 left-0 border-t-2 border-l-2 rounded-tl-lg',
                  'top-0 right-0 border-t-2 border-r-2 rounded-tr-lg',
                  'bottom-0 left-0 border-b-2 border-l-2 rounded-bl-lg',
                  'bottom-0 right-0 border-b-2 border-r-2 rounded-br-lg',
                ].map((cls, i) => (
                  <div
                    key={i}
                    className={`absolute w-5 h-5 border-accent ${cls}`}
                    style={{ animation: `cornerPulse 2s ease ${i * 0.15}s infinite` }}
                  />
                ))}
              </div>

              <div className="w-full flex flex-col gap-3">
                <button
                  onClick={startScan}
                  className="w-full py-4 rounded-xl font-display font-bold text-base
                    bg-accent text-bg tracking-wide
                    active:scale-[0.97] transition-transform shadow-lg shadow-accent/20"
                >
                  Scan QR Code
                </button>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-text-muted font-mono">or</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <div className="bg-surface border border-border rounded-xl p-4 text-center">
                  <p className="text-text-secondary text-sm">
                    You can also scan the QR with your phone&apos;s camera app to open
                    this upload page directly.
                  </p>
                </div>
              </div>

              {(cameraPermission === 'denied' || errorMsg) && (
                <PermissionBanner
                  denied={cameraPermission === 'denied'}
                  message={errorMsg}
                />
              )}
            </div>
          )}

          {stage === 'scanning' && (
            <div className="fixed inset-0 bg-black z-50 flex flex-col">
              <div className="relative flex-1">
                <QRScanner onScan={handleToken} active onError={handleScannerError} />

                <div className="absolute inset-0 pointer-events-none">
                  <div
                    className="flex items-center justify-between px-4 pt-safe-top pb-3
                    bg-gradient-to-b from-black/70 to-transparent"
                  >
                    <span className="font-display text-sm font-bold text-white">
                      Scan QR Code
                    </span>
                    <button
                      className="pointer-events-auto text-white/70 text-sm underline"
                      onClick={() => setStage('idle')}
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative w-64 h-64">
                      <div
                        className="absolute left-4 right-4 h-0.5 bg-accent/80"
                        style={{
                          top: '8px',
                          animation: 'scanLine 2s ease-in-out infinite',
                        }}
                      />
                      {[
                        'top-0 left-0 border-t-4 border-l-4 rounded-tl-lg',
                        'top-0 right-0 border-t-4 border-r-4 rounded-tr-lg',
                        'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-lg',
                        'bottom-0 right-0 border-b-4 border-r-4 rounded-br-lg',
                      ].map((cls, i) => (
                        <div key={i} className={`absolute w-8 h-8 border-accent ${cls}`} />
                      ))}
                    </div>
                  </div>

                  <div
                    className="absolute bottom-0 inset-x-0 pb-safe-bottom pb-8
                    flex justify-center bg-gradient-to-t from-black/60 to-transparent pt-8"
                  >
                    <p className="text-white/60 text-sm font-mono">
                      Point at the QR code on the post-exam upload screen
                      
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {stage === 'processing' && (
            <div className="flex flex-col items-center gap-6 animate-scale-in">
              <div className="relative w-20 h-20">
                <div className="absolute inset-0 rounded-full border-2 border-border" />
                <div
                  className="absolute inset-0 rounded-full border-2 border-accent border-t-transparent"
                  style={{ animation: 'spin 0.8s linear infinite' }}
                />
              </div>
              <div className="text-center">
                <p className="font-display font-bold text-text-primary">
                  Verifying session...
                </p>
                <p className="text-text-secondary text-sm mt-1">
                  Checking your exam, student, and upload window
                </p>
              </div>
            </div>
          )}

          {stage === 'error' && (
            <div className="w-full flex flex-col items-center gap-6 animate-scale-in">
              <div
                className="w-16 h-16 rounded-full bg-danger/10 border border-danger/30
                flex items-center justify-center"
              >
                <span className="text-danger text-2xl">!</span>
              </div>
              <div className="text-center">
                <p className="font-display font-bold text-text-primary">
                  Upload Session Invalid
                </p>
                <p className="text-text-secondary text-sm mt-1">{errorMsg}</p>
              </div>
              <button
                onClick={retry}
                className="w-full py-4 rounded-xl font-display font-bold text-base
                  bg-accent text-bg active:scale-[0.97] transition-transform"
              >
                Try Again
              </button>
            </div>
          )}
        </div>

        <div
          className="pb-safe-bottom pb-8 pt-6 text-center animate-fade-up"
          style={{ animationDelay: '240ms' }}
        >
          <p className="text-text-muted text-xs font-mono">
            Session is secured | PDF upload is verified before submission
          </p>
        </div>
      </div>
    </div>
  );
}

function QRIllustration() {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none" className="opacity-60">
      <rect x="8" y="8" width="28" height="28" rx="3" stroke="#00e5c8" strokeWidth="3" fill="none" />
      <rect x="14" y="14" width="16" height="16" rx="1" fill="#00e5c8" opacity="0.6" />
      <rect x="60" y="8" width="28" height="28" rx="3" stroke="#00e5c8" strokeWidth="3" fill="none" />
      <rect x="66" y="14" width="16" height="16" rx="1" fill="#00e5c8" opacity="0.6" />
      <rect x="8" y="60" width="28" height="28" rx="3" stroke="#00e5c8" strokeWidth="3" fill="none" />
      <rect x="14" y="66" width="16" height="16" rx="1" fill="#00e5c8" opacity="0.6" />
      {[
        [44, 8], [50, 8], [56, 8], [44, 14], [50, 20], [56, 14], [44, 20], [56, 20],
        [44, 26], [50, 26], [44, 32], [56, 32], [8, 44], [14, 44], [20, 44], [26, 44],
        [8, 50], [20, 50], [26, 50], [8, 56], [14, 56], [20, 56], [26, 56], [8, 62],
        [44, 44], [50, 44], [56, 44], [62, 44], [68, 44], [44, 50], [62, 50], [44, 56],
        [50, 56], [56, 56], [68, 50], [62, 56], [68, 56], [44, 62], [56, 62], [68, 62],
      ].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="4" height="4" rx="0.5" fill="#00e5c8" opacity="0.4" />
      ))}
    </svg>
  );
}

function PermissionBanner({
  denied,
  message,
}: {
  denied: boolean;
  message?: string;
}) {
  return (
    <div className="w-full bg-danger/10 border border-danger/30 rounded-xl p-4">
      <p className="text-danger text-sm font-semibold">
        {denied ? 'Camera permission denied' : 'Camera unavailable'}
      </p>
      <p className="text-text-secondary text-xs mt-1">
        {message ||
          'Tap the scan button again to trigger the browser camera permission prompt.'}
      </p>
      {denied ? (
        <p className="text-text-secondary text-xs mt-2">
          If you previously blocked camera access, the browser may require you to re-enable it for
          this site.
        </p>
      ) : null}
      <p className="text-text-secondary text-xs mt-2">
        The app now asks for camera access when you press the scan button.
      </p>
    </div>
  );
}
