// Violation Module - Schema & Types

export interface ReportViolationRequest {
  attemptId: number;
  violationType: string;
  severity?: 'info' | 'warning';
  detail?: string;
  timestamp?: number;
  frameSnapshot?: string; // base64 JPEG
  metadata?: Record<string, any>;
  integrityHash?: string;
  aiSignature?: string;
  clientIp?: string;
  sessionId?: string;
}

export interface ViolationReportResponse {
  success: true;
  data: {
    violationId: number;
    newViolationCount: number;
    maxWarnings: number;
    thresholdReached: boolean;
    shouldAutoSubmit: boolean;
  };
}

export interface GetViolationsResponse {
  success: true;
  data: {
    violations: any[]; // DB rows
    count: number;
  };
}

export interface ViolationCountCheckResponse {
  success: true;
  data: {
    count: number;
    maxWarnings: number;
    thresholdReached: boolean;
  };
}

// Extend global types
declare global {
  type ViolationSeverity = 'info' | 'warning';
}

