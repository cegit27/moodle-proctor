'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useScanStore } from '@/store/scanStore';

export default function SuccessPage() {
  const router = useRouter();
  const studentId = useScanStore((s) => s.studentId);
  const session = useScanStore((s) => s.session);
  const uploadId = useScanStore((s) => s.uploadId);
  const uploadReceipt = useScanStore((s) => s.uploadReceipt);
  const uploadStatus = useScanStore((s) => s.uploadStatus);
  const reset = useScanStore((s) => s.reset);

  useEffect(() => {
    if (uploadStatus !== 'success') {
      router.replace('/');
    }
  }, [uploadStatus, router]);

  if (uploadStatus !== 'success') return null;

  const uploadedAt = uploadReceipt?.uploadedAt || session?.upload.uploadedAt || null;
  const uploadDate = uploadedAt ? new Date(uploadedAt) : new Date();
  const timeStr = uploadDate.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const dateStr = uploadDate.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-between px-6 py-safe-top overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute inset-0 opacity-10"
          style={{
            background: 'radial-gradient(ellipse 70% 50% at 50% 100%, #00e5c8 0%, transparent 70%)',
          }}
        />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center w-full relative z-10 pt-12">
        <div className="relative mb-8">
          <div
            className="absolute inset-0 -m-6 rounded-full border border-accent/20"
            style={{ animation: 'successRing 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.1s both' }}
          />
          <div
            className="absolute inset-0 -m-3 rounded-full border border-accent/30"
            style={{ animation: 'successRing 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.2s both' }}
          />

          <div
            className="w-20 h-20 rounded-full bg-accent flex items-center justify-center shadow-xl shadow-accent/40"
            style={{ animation: 'successRing 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.3s both' }}
          >
            <svg
              className="w-10 h-10 text-bg"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>

        <div
          className="text-center mb-8 animate-fade-up"
          style={{ animationDelay: '400ms' }}
        >
          <h1 className="font-display font-extrabold text-3xl text-text-primary leading-tight">
            Upload Complete
          </h1>
          <p className="text-text-secondary mt-2 text-sm leading-relaxed">
            Your answer-sheet PDF has been uploaded successfully.
            <br />
            Keep this receipt until your teacher confirms the submission.
          </p>
        </div>

        <div
          className="w-full bg-surface border border-border rounded-2xl overflow-hidden animate-fade-up"
          style={{ animationDelay: '520ms' }}
        >
          <div className="px-4 py-3 bg-accent/5 border-b border-accent/10 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent" />
            <span className="font-mono text-xs text-accent uppercase tracking-widest">
              Submission Receipt
            </span>
          </div>

          <div className="divide-y divide-border">
            {[
              { label: 'Student ID', value: studentId ?? '-' },
              { label: 'Student', value: session?.student.name ?? '-' },
              { label: 'Exam', value: session?.exam.name ?? '-' },
              { label: 'PDF file', value: uploadReceipt?.fileName ?? session?.upload.fileName ?? '-' },
              {
                label: 'File size',
                value: uploadReceipt?.fileSizeBytes
                  ? `${(uploadReceipt.fileSizeBytes / 1024 / 1024).toFixed(2)} MB`
                  : '-',
              },
              { label: 'Upload ID', value: uploadId ? `${uploadId.slice(0, 16)}...` : '-' },
              { label: 'Time', value: `${timeStr}` },
              { label: 'Date', value: dateStr },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between px-4 py-3 gap-3">
                <span className="text-text-secondary text-sm">{label}</span>
                <span className="font-mono text-text-primary text-sm text-right break-all">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div
          className="mt-4 flex items-center gap-2 animate-fade-up"
          style={{ animationDelay: '620ms' }}
        >
          <svg className="w-3.5 h-3.5 text-success flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          <p className="text-text-muted text-xs font-mono">
            Verified against the exam upload session token
          </p>
        </div>
      </div>

      <div
        className="w-full pb-safe-bottom pb-8 pt-6 animate-fade-up"
        style={{ animationDelay: '720ms' }}
      >
        <div className="flex flex-col gap-4">
            <button
            type="button"
            onClick={() => {
              reset();
              router.replace('/');
            }}
            className="w-full rounded-2xl bg-accent text-bg py-4 px-5 font-display font-bold text-base shadow-lg shadow-accent/20"
            >
            Finish
          </button>

          <div className="text-center">
          <p className="text-text-muted text-xs font-mono">
            You may now close this page.
          </p>
          </div>
        </div>
      </div>
    </div>
  );
}
