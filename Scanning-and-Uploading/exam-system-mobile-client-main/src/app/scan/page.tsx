'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useScanStore } from '@/store/scanStore';
import DocumentScanner from '@/components/DocumentScanner';

export default function ScanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const sessionToken = useScanStore((s) => s.sessionToken);
  const studentId = useScanStore((s) => s.studentId);
  const pages = useScanStore((s) => s.pages);

  const addPage = useScanStore((s) => s.addPage);
  const replacePage = useScanStore((s) => s.replacePage);

  const retakeId = searchParams.get('retake');

  // Guard: redirect if no session
  useEffect(() => {
    if (!sessionToken) {
      router.replace('/');
    }
  }, [sessionToken, router]);

  if (!sessionToken) return null;

  const handleCapture = (dataUrl: string, thumbnail: string) => {
    if (retakeId) {
      replacePage(retakeId, dataUrl, thumbnail);
      router.push('/review');
    } else {
      addPage(dataUrl, thumbnail);
    }
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