'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useScanStore } from '@/store/scanStore';
import SortablePageGrid from '@/components/SortablePageGrid';
import { requestUploadUrls } from '@/lib/api';
import { uploadAllPages } from '@/lib/s3Upload';

type ModalPage = { dataUrl: string; index: number } | null;

export default function ReviewPage() {
  const router = useRouter();
  const sessionToken = useScanStore((s) => s.sessionToken);
  const studentId = useScanStore((s) => s.studentId);
  const pages = useScanStore((s) => s.pages);
  const reorderPages = useScanStore((s) => s.reorderPages);
  const removePage = useScanStore((s) => s.removePage);
  const uploadStatus = useScanStore((s) => s.uploadStatus);
  const uploadProgress = useScanStore((s) => s.uploadProgress);
  const setUploadId = useScanStore((s) => s.setUploadId);
  const setUploadStatus = useScanStore((s) => s.setUploadStatus);

  const [previewPage, setPreviewPage] = useState<ModalPage>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Guard: redirect if no session or no pages
  useEffect(() => {
    if (!sessionToken) router.replace('/');
    else if (pages.length === 0) router.replace('/scan');
  }, [sessionToken, pages.length, router]);

  if (!sessionToken) return null;

  const handleUpload = async () => {
    if (uploadStatus === 'uploading') return;
    setErrorMsg('');
    setUploadStatus('uploading', 0);

    try {
      // 1. Get pre-signed URLs from our Next.js API
      const { uploadId, urls } = await requestUploadUrls(sessionToken, pages.length);
      setUploadId(uploadId);

      // 2. Upload all pages directly to S3
      const results = await uploadAllPages(
        urls,
        pages.map((p) => p.dataUrl),
        (pct) => setUploadStatus('uploading', pct)
      );

      // Check for failures
      const failed = results.filter((r) => !r.success);
      if (failed.length > 0) {
        throw new Error(`${failed.length} page(s) failed to upload. Please retry.`);
      }

      // 3. Confirm with backend
      await fetch('/api/confirm-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: sessionToken, uploadId }),
      });

      setUploadStatus('success', 100);
      router.push('/success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed. Please retry.';
      setErrorMsg(msg);
      setUploadStatus('error', 0);
    }
  };

  const isUploading = uploadStatus === 'uploading';

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-bg/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-3 px-4 pt-safe-top py-3">
          <button
            onClick={() => router.back()}
            disabled={isUploading}
            className="w-8 h-8 rounded-lg flex items-center justify-center
              text-text-secondary hover:text-text-primary
              disabled:opacity-30 transition-colors"
            aria-label="Go back"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>

          <div className="flex-1">
            <h1 className="font-display font-bold text-text-primary text-base">
              Review Pages
            </h1>
            {studentId && (
              <p className="font-mono text-xs text-text-secondary truncate">
                ID: {studentId}
              </p>
            )}
          </div>

          {/* Page count badge */}
          <div className="flex items-center gap-1.5 bg-surface border border-border
            rounded-lg px-3 py-1.5">
            <span className="font-mono text-accent font-bold text-sm">{pages.length}</span>
            <span className="text-text-secondary text-xs">pages</span>
          </div>
        </div>
      </div>

      {/* ── Instruction bar ──────────────────────────────────────────────────── */}
      <div className="px-4 py-2 bg-accent/5 border-b border-accent/10 flex items-center gap-2">
        <svg className="w-4 h-4 text-accent flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"/>
        </svg>
        <p className="text-xs text-text-secondary">
          Tap to preview · Long-press to reorder · Swipe card for delete
        </p>
      </div>

      {/* ── Page grid ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto pb-40">
        <SortablePageGrid
          pages={pages}
          onChange={reorderPages}
          onDelete={(id) => {
            removePage(id);

            setTimeout(() => {
              const remaining = useScanStore.getState().pages.length;
              if (remaining === 0) {
                router.replace('/scan');
              }
            }, 50);
          }}
          onRetake={(id) => {
            router.push(`/scan?retake=${id}`);
          }}
        />

        {/* Add more pages button */}
        <div className="px-4 pb-4">
          <button
            onClick={() => router.push('/scan')}
            disabled={isUploading || pages.length >= 50}
            className="w-full py-3 rounded-xl border border-dashed border-border
              text-text-secondary text-sm font-mono
              disabled:opacity-30 active:bg-surface transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add more pages ({50 - pages.length} remaining)
          </button>
        </div>
      </div>

      {/* ── Upload panel ─────────────────────────────────────────────────────── */}
      <div className="fixed bottom-0 inset-x-0 z-20 bg-bg/95 backdrop-blur-sm border-t border-border
        px-4 pb-safe-bottom pb-6 pt-4">
        {/* Error */}
        {errorMsg && (
          <div className="mb-3 px-4 py-2 bg-danger/10 border border-danger/30 rounded-xl
            text-danger text-sm animate-fade-up flex items-center gap-2">
            <span>⚠</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Progress bar */}
        {isUploading && (
          <div className="mb-3 animate-fade-up">
            <div className="flex justify-between text-xs text-text-secondary font-mono mb-1.5">
              <span>Uploading to secure storage…</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="h-1.5 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={isUploading || pages.length === 0}
          className="w-full py-4 rounded-xl font-display font-bold text-base
            bg-accent text-bg tracking-wide
            disabled:opacity-40 disabled:cursor-not-allowed
            active:scale-[0.97] transition-all shadow-lg shadow-accent/25"
        >
          {isUploading ? (
            <span className="flex items-center justify-center gap-2">
              <Spinner />
              Uploading {uploadProgress}%…
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              Submit Answer Sheet
            </span>
          )}
        </button>
      </div>

      {/* ── Page preview modal ───────────────────────────────────────────────── */}
      {previewPage && (
        <PagePreviewModal
          dataUrl={previewPage.dataUrl}
          index={previewPage.index}
          onClose={() => setPreviewPage(null)}
        />
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  );
}

function PagePreviewModal({
  dataUrl,
  index,
  onClose,
}: {
  dataUrl: string;
  index: number;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div className="w-full max-h-[80vh] rounded-2xl overflow-hidden relative animate-scale-in"
        onClick={(e) => e.stopPropagation()}>
        <img src={dataUrl} alt={`Page ${index + 1}`} className="w-full object-contain" />
        <div className="absolute top-3 right-3">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center text-lg"
          >
            ×
          </button>
        </div>
        <div className="absolute bottom-3 left-3 bg-black/60 rounded-lg px-2 py-1">
          <span className="font-mono text-xs text-white">Page {index + 1}</span>
        </div>
      </div>
    </div>
  );
}
