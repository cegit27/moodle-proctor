import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ScannedPage {
  id: string;
  dataUrl: string;       // full-res JPEG data URL
  thumbnail: string;     // downscaled thumbnail for preview
  capturedAt: number;
}

interface ScanStore {
  // ── Session ───────────────────────────────────────────────────────────────
  sessionToken: string | null;
  studentId: string | null;
  uploadId: string | null;

  // ── Pages ─────────────────────────────────────────────────────────────────
  pages: ScannedPage[];

  // ── Upload ────────────────────────────────────────────────────────────────
  uploadStatus: 'idle' | 'uploading' | 'success' | 'error';
  uploadProgress: number;

  // ── Actions ───────────────────────────────────────────────────────────────
  setSession: (token: string, studentId?: string) => void;
  addPage: (dataUrl: string, thumbnail: string) => void;
  removePage: (id: string) => void;
  reorderPages: (pages: ScannedPage[]) => void;

  //  NEW ACTION
  replacePage: (id: string, dataUrl: string, thumbnail: string) => void;

  setUploadId: (id: string) => void;
  setUploadStatus: (status: ScanStore['uploadStatus'], progress?: number) => void;
  reset: () => void;
}

const initialState = {
  sessionToken: null,
  studentId: null,
  uploadId: null,
  pages: [],
  uploadStatus: 'idle' as const,
  uploadProgress: 0,
};

export const useScanStore = create<ScanStore>()(
  persist(
    (set) => ({
      ...initialState,

      setSession: (token, studentId) =>
        set({ sessionToken: token, studentId: studentId ?? null }),

      addPage: (dataUrl, thumbnail) =>
        set((s) => ({
          pages: [
            ...s.pages,
            {
              id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              dataUrl,
              thumbnail,
              capturedAt: Date.now(),
            },
          ],
        })),

      removePage: (id) =>
        set((s) => ({
          pages: s.pages.filter((p) => p.id !== id),
        })),

      reorderPages: (pages) => set({ pages }),

      //  Replace an existing page (used for Retake feature)
      replacePage: (id, dataUrl, thumbnail) =>
        set((s) => ({
          pages: s.pages.map((p) =>
            p.id === id
              ? {
                  ...p,
                  dataUrl,
                  thumbnail,
                  capturedAt: Date.now(),
                }
              : p
          ),
        })),

      setUploadId: (id) => set({ uploadId: id }),

      setUploadStatus: (uploadStatus, progress) =>
        set({
          uploadStatus,
          uploadProgress: progress ?? 0,
        }),

      reset: () => set(initialState),
    }),
    {
      name: 'proctor-scan-session',

      // Persist only session and pages
      partialize: (s) => ({
        sessionToken: s.sessionToken,
        studentId: s.studentId,
        pages: s.pages,
      }),
    }
  )
);