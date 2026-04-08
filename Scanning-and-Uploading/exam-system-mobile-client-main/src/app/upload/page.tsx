'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useScanStore } from '@/store/scanStore';
import {
  ScanSessionRequestError,
  uploadPdfAnswerSheet,
  validateScanSession,
} from '@/lib/api';
import type { ScanUploadSession, UploadReceipt } from '@/lib/scanSession';

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) {
    return '0 B';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return 'Not available';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Not available';
  }

  return date.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatCountdown(expiresAt: number): string {
  const remaining = Math.max(0, expiresAt - Date.now());
  const totalSeconds = Math.ceil(remaining / 1000);

  if (totalSeconds <= 0) {
    return 'Expired';
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  }

  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function isPdfLikeFile(file: File): boolean {
  return (
    file.type === 'application/pdf' ||
    String(file.name || '').toLowerCase().endsWith('.pdf')
  );
}

function buildReceiptFromSession(session: ScanUploadSession): UploadReceipt | null {
  if (
    !session.upload?.receiptId ||
    !session.upload?.uploadedAt ||
    !session.upload?.fileName ||
    !session.upload?.fileSizeBytes
  ) {
    return null;
  }

  return {
    id: session.upload.receiptId,
    uploadedAt: session.upload.uploadedAt,
    fileName: session.upload.fileName,
    fileSizeBytes: session.upload.fileSizeBytes,
  };
}

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sessionToken = useScanStore((s) => s.sessionToken);
  const session = useScanStore((s) => s.session);
  const uploadStatus = useScanStore((s) => s.uploadStatus);
  const uploadProgress = useScanStore((s) => s.uploadProgress);
  const setUploadStatus = useScanStore((s) => s.setUploadStatus);
  const setUploadResult = useScanStore((s) => s.setUploadResult);
  const setSession = useScanStore((s) => s.setSession);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [countdown, setCountdown] = useState('');
  const [confirmedStudent, setConfirmedStudent] = useState(false);

  const isExpired = useMemo(
    () => !session || Date.now() >= session.expiresAt || session.status === 'expired',
    [session]
  );
  const isUploaded = session?.status === 'uploaded';
  const isRemoteUploadInProgress = session?.status === 'upload_in_progress';

  useEffect(() => {
    if (!sessionToken || !session) {
      router.replace('/');
    }
  }, [router, session, sessionToken]);

  useEffect(() => {
    if (!session) {
      return;
    }

    setCountdown(formatCountdown(session.expiresAt));

    const timer = window.setInterval(() => {
      const nextCountdown = formatCountdown(session.expiresAt);
      setCountdown(nextCountdown);

      if (Date.now() >= session.expiresAt) {
        setSession({ ...session, status: 'expired' });
        window.clearInterval(timer);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [session, setSession]);

  useEffect(() => {
    setConfirmedStudent(false);
    setSelectedFile(null);
    setErrorMsg('');
  }, [sessionToken]);

  useEffect(() => {
    if (!sessionToken) {
      return;
    }

    let isActive = true;

    const syncSession = async () => {
      try {
        const latestSession = await validateScanSession(sessionToken);

        if (!isActive) {
          return;
        }

        setSession(latestSession);
      } catch (error) {
        if (!isActive) {
          return;
        }

        if (error instanceof ScanSessionRequestError && error.session) {
          setSession(error.session);
          return;
        }

        console.warn('[upload/page] Could not refresh scan session:', error);
      }
    };

    syncSession();
    const timer = window.setInterval(syncSession, 15000);

    return () => {
      isActive = false;
      window.clearInterval(timer);
    };
  }, [sessionToken, setSession]);

  if (!sessionToken || !session) {
    return null;
  }

  const handleChooseFile = () => {
    if (uploadStatus === 'uploading' || isExpired || isUploaded || isRemoteUploadInProgress) {
      return;
    }

    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setErrorMsg('');

    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (!isPdfLikeFile(file)) {
      setErrorMsg('Please choose a PDF file.');
      setSelectedFile(null);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('The PDF is larger than 10 MB.');
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  };

  const handleSubmit = async () => {
    if (
      !selectedFile ||
      !sessionToken ||
      uploadStatus === 'uploading' ||
      isExpired ||
      isUploaded ||
      isRemoteUploadInProgress ||
      !confirmedStudent
    ) {
      return;
    }

    try {
      setErrorMsg('');
      setUploadStatus('uploading', 20);

      const response = await uploadPdfAnswerSheet(sessionToken, selectedFile);
      setUploadStatus('uploading', 80);

      if (response.session) {
        setSession(response.session);
      }

      setUploadResult(response.uploadId, response.receipt);
      setUploadStatus('success', 100);
      router.push('/success');
    } catch (error) {
      if (error instanceof ScanSessionRequestError && error.session) {
        setSession(error.session);

        if (error.session.status === 'uploaded') {
          setUploadResult(
            error.session.upload.receiptId || `upload-${Date.now()}`,
            buildReceiptFromSession(error.session)
          );
          setUploadStatus('success', 100);
          router.push('/success');
          return;
        }

        if (error.session.status === 'expired') {
          setUploadStatus('error', 0);
          setErrorMsg(
            'This upload window has expired. Please ask the teacher for a new QR code if your submission should still be accepted.'
          );
          return;
        }
      }

      setUploadStatus('error', 0);
      setErrorMsg(
        error instanceof Error
          ? error.message
          : 'We could not upload your answer-sheet PDF.'
      );
    }
  };

  const isUploading = uploadStatus === 'uploading';

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <div className="sticky top-0 z-20 bg-bg/95 backdrop-blur-sm border-b border-border">
        <div className="px-5 pt-safe-top py-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-accent" />
              <span className="font-mono text-xs tracking-widest text-accent uppercase">
                Upload Session
              </span>
            </div>
            <h1 className="font-display text-2xl font-extrabold text-text-primary leading-tight">
              Submit Answer Sheet PDF
            </h1>
            <p className="mt-2 text-sm text-text-secondary leading-relaxed max-w-[32rem]">
              Upload your final scanned PDF here. This page checks your upload
              session automatically so completed, expired, or duplicate uploads
              are shown clearly before you submit.
            </p>
          </div>
          <div
            className={`rounded-full px-3 py-1.5 text-xs font-mono border ${
              isUploaded
                ? 'border-success/30 text-success bg-success/10'
                : isExpired
                ? 'border-danger/30 text-danger bg-danger/10'
                : 'border-accent/20 text-accent bg-accent/5'
            }`}
          >
            {isUploaded ? 'Already submitted' : isExpired ? 'Session expired' : countdown}
          </div>
        </div>
      </div>

      <div className="flex-1 px-5 py-5 flex flex-col gap-5 pb-32">
        {isUploaded && (
          <section className="rounded-3xl border border-success/30 bg-success/10 p-5 shadow-sm">
            <p className="font-mono text-xs uppercase tracking-widest text-success">
              Submission complete
            </p>
            <h2 className="mt-2 text-xl font-display font-bold text-text-primary">
              This answer sheet has already been uploaded
            </h2>
            <p className="mt-2 text-sm text-text-secondary leading-relaxed">
              A PDF has already been submitted for this QR code. Your teacher can
              now view the stored file.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-bg border border-border p-4">
                <p className="text-xs text-text-muted uppercase tracking-wider">Uploaded at</p>
                <p className="mt-1 text-sm font-semibold text-text-primary">
                  {formatDateTime(session.upload.uploadedAt)}
                </p>
              </div>
              <div className="rounded-2xl bg-bg border border-border p-4">
                <p className="text-xs text-text-muted uppercase tracking-wider">Receipt</p>
                <p className="mt-1 text-sm font-semibold text-text-primary">
                  {session.upload.receiptId || 'Saved successfully'}
                </p>
              </div>
            </div>
          </section>
        )}

        {isExpired && !isUploaded && (
          <section className="rounded-3xl border border-danger/30 bg-danger/10 p-5 shadow-sm">
            <p className="font-mono text-xs uppercase tracking-widest text-danger">
              Upload window closed
            </p>
            <h2 className="mt-2 text-xl font-display font-bold text-text-primary">
              This QR session has expired
            </h2>
            <p className="mt-2 text-sm text-text-secondary leading-relaxed">
              The teacher-set answer sheet deadline has passed. A new upload session
              is required if the submission should still be accepted.
            </p>
          </section>
        )}

        <section className="rounded-3xl bg-surface border border-border p-5 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-text-muted">
                Student
              </p>
              <p className="mt-1 text-lg font-display font-bold text-text-primary">
                {session.student.name}
              </p>
              <p className="text-sm text-text-secondary">{session.student.email}</p>
              <p className="text-xs text-text-muted mt-1">
                ID: {session.student.studentId}
              </p>
            </div>
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-text-muted">
                Exam
              </p>
              <p className="mt-1 text-lg font-display font-bold text-text-primary">
                {session.exam.name}
              </p>
              <p className="text-sm text-text-secondary">
                {session.exam.courseName || 'Course not provided'}
              </p>
              <p className="text-xs text-text-muted mt-1">
                Attempt #{session.attempt.id} - Submitted {formatDateTime(session.attempt.submittedAt)}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl bg-surface border border-border p-5 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-widest text-text-muted">
            Student Confirmation
          </p>
          <h2 className="mt-2 text-xl font-display font-bold text-text-primary">
            Confirm these exam details
          </h2>
          <label className="mt-4 flex items-start gap-3 rounded-2xl border border-border bg-bg p-4">
            <input
              type="checkbox"
              checked={confirmedStudent}
              onChange={(event) => setConfirmedStudent(event.target.checked)}
              disabled={isExpired || isUploaded || isUploading}
              className="mt-1 h-4 w-4 accent-[var(--accent)]"
            />
            <span className="text-sm leading-relaxed text-text-secondary">
              I confirm that this PDF belongs to <strong className="text-text-primary">{session.student.name}</strong>
              {' '}({session.student.studentId}) for <strong className="text-text-primary">{session.exam.name}</strong>.
            </span>
          </label>
        </section>

        <section className="rounded-3xl bg-surface border border-border p-5 shadow-sm">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-text-muted">
            PDF Upload
          </p>
          <h2 className="mt-2 text-xl font-display font-bold text-text-primary">
            Choose your final PDF file
          </h2>
          <p className="mt-2 text-sm text-text-secondary leading-relaxed">
            Accepted type: PDF only. Maximum size: 10 MB. After a successful
            upload, this QR session is marked complete and cannot be reused.
          </p>
          </div>

          <div className="mt-5 rounded-2xl border border-dashed border-accent/30 bg-accent/5 p-5">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={handleFileChange}
            />

            <button
              type="button"
              onClick={handleChooseFile}
              disabled={isUploading || isExpired || isUploaded || isRemoteUploadInProgress}
              className="w-full rounded-2xl bg-accent text-bg py-4 px-5 font-display font-bold text-base disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isRemoteUploadInProgress
                ? 'Upload currently in progress'
                : isUploaded
                ? 'PDF already submitted'
                : selectedFile
                ? 'Choose a different PDF'
                : 'Choose PDF'}
            </button>

            <div className="mt-4 rounded-2xl bg-bg border border-border p-4">
              {selectedFile ? (
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-text-primary break-all">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-text-secondary">
                    {formatFileSize(selectedFile.size)} - {selectedFile.type || 'application/pdf'}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-text-secondary">No PDF selected yet.</p>
              )}
            </div>
          </div>

          {errorMsg && (
            <div className="mt-4 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              {errorMsg}
            </div>
          )}

          {isRemoteUploadInProgress && !isUploading && (
            <div className="mt-4 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-text-primary">
              This upload session is currently being processed. Wait a moment for the final status
              before trying again.
            </div>
          )}

          {isUploading && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-text-secondary font-mono mb-2">
                <span>Submitting PDF</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-2 rounded-full bg-border overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
        </section>

        <section className="rounded-3xl bg-surface border border-border p-5 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-widest text-text-muted">
            Session Rules
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-bg border border-border p-4">
              <p className="text-xs text-text-muted uppercase tracking-wider">
                Deadline
              </p>
              <p className="mt-1 text-sm font-semibold text-text-primary">
                {countdown}
              </p>
            </div>
            <div className="rounded-2xl bg-bg border border-border p-4">
              <p className="text-xs text-text-muted uppercase tracking-wider">
                        Status
                      </p>
                      <p className="mt-1 text-sm font-semibold text-text-primary">
                        {session.status.replace(/_/g, ' ')}
                      </p>
            </div>
            <div className="rounded-2xl bg-bg border border-border p-4">
              <p className="text-xs text-text-muted uppercase tracking-wider">
                File Type
              </p>
              <p className="mt-1 text-sm font-semibold text-text-primary">
                {session.acceptedFileTypes.join(', ')}
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className="fixed bottom-0 inset-x-0 z-20 bg-bg/95 backdrop-blur-sm border-t border-border px-5 pb-safe-bottom pb-6 pt-4">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={
            !selectedFile ||
            isUploading ||
            isExpired ||
            isUploaded ||
            isRemoteUploadInProgress ||
            !confirmedStudent
          }
          className="w-full rounded-2xl bg-accent text-bg py-4 px-5 font-display font-bold text-base disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-accent/20"
        >
          {isRemoteUploadInProgress
            ? 'Upload In Progress'
            : isUploaded
            ? 'Answer Sheet Already Submitted'
            : isUploading
            ? 'Uploading PDF...'
            : !confirmedStudent
            ? 'Confirm Student To Continue'
            : 'Submit Answer Sheet PDF'}
        </button>
      </div>
    </div>
  );
}
