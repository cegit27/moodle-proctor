import { NextResponse } from 'next/server';

const BACKEND_API_URL =
  process.env.BACKEND_API_URL || 'http://localhost:5000';

function isPdfLikeFile(file: File): boolean {
  return (
    file.type === 'application/pdf' ||
    String(file.name || '').toLowerCase().endsWith('.pdf')
  );
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const token = String(formData.get('token') || '').trim();
    const file = formData.get('file');

    if (!token) {
      return NextResponse.json(
        { error: 'Missing scan session token' },
        { status: 400 }
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'PDF file is required' },
        { status: 400 }
      );
    }

    if (!isPdfLikeFile(file)) {
      return NextResponse.json(
        { error: 'Only PDF uploads are supported' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const fileBase64 = Buffer.from(arrayBuffer).toString('base64');

    const response = await fetch(
      `${BACKEND_API_URL}/api/scan/sessions/${encodeURIComponent(token)}/pdf`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || 'application/pdf',
          fileBase64,
        }),
      }
    );

    const payload = await response.json().catch(() => ({}));

    return NextResponse.json(
      {
        uploadId:
          payload.receipt?.id ||
          payload.data?.upload?.receiptId ||
          `upload-${Date.now()}`,
        receipt: payload.receipt || null,
        session: payload.data || null,
        success: payload.success ?? response.ok,
        error: payload.error,
      },
      {
        status: response.status,
      }
    );
  } catch (error) {
    console.error('[api/pdf-upload] Failed to upload PDF:', error);
    return NextResponse.json(
      { error: 'Could not upload the answer sheet PDF' },
      { status: 500 }
    );
  }
}
