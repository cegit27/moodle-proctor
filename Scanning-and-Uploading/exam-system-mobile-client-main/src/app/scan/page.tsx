'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useScanStore } from '@/store/scanStore';
import DocumentScanner from '@/components/DocumentScanner';

export default function ScanPage() {
  const router = useRouter();
  const sessionToken = useScanStore((s) => s.sessionToken);
  const studentId = useScanStore((s) => s.studentId);
  const pages = useScanStore((s) => s.pages);
  const addPage = useScanStore((s) => s.addPage);

  // Guard: redirect if no session
  useEffect(() => {
  const params = new URLSearchParams(window.location.search)
  const isFromElectron = params.get('source') === 'electron' && params.get('token') === 'exam-complete'

  if (!sessionToken && !isFromElectron) {
    router.replace('/')
  }
}, [sessionToken, router])

  if (!sessionToken) return null;

  const handleCapture = (dataUrl: string, thumbnail: string) => {
    addPage(dataUrl, thumbnail);
  };

  const handleDone = () => {
    if (pages.length === 0) return;
    router.push('/review');
  };

  return (
    <DocumentScanner
      pageCount={pages.length}
      onCapture={handleCapture}
      onDone={handleDone}
    />
  );
}
