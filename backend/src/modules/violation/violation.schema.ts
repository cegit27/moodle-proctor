// ============================================================================
// Violation Module - Schema & Types
// ============================================================================

// ============================================================================
// Request Types
// ============================================================================

export interface ReportViolationRequest {
  attemptId?: number;
  roomId?: number;
  violationType?: string;
  type?: string;
  severity?: 'info' | 'warning';
  detail?: string;
  metadata?: Record<string, unknown>;
  frameSnapshot?: string; // Base64 encoded image
  integrityHash?: string;
  aiSignature?: string;
  clientIp?: string;
  sessionId?: string;
  timestamp?: number; // Unix timestamp in milliseconds
}

// ============================================================================
// Response Types
// ============================================================================

export interface Violation {
  id: number;
  attemptId: number;
  violationType: string;
  severity: 'info' | 'warning';
  detail: string | null;
  occurredAt: Date;
  frameSnapshotPath: string | null;
  metadata: Record<string, unknown> | null;
  integrityHash: string;
  aiSignature: string | null;
  clientIp: string | null;
  sessionId: string | null;
}

export interface ViolationResponse {
  success: true;
  data: {
    violation: Violation;
    violationCount: number;
    shouldAutoSubmit: boolean;
  };
}

export interface ViolationsListResponse {
  success: true;
  data: {
    violations: Violation[];
    totalCount: number;
    warningCount: number;
    infoCount: number;
  };
}

export interface ViolationCheckResponse {
  success: true;
  data: {
    count: number;
    threshold: number;
    shouldAutoSubmit: boolean;
  };
}

// ============================================================================
// Database Row Types
// ============================================================================

export interface ViolationRow {
  id: number;
  attempt_id: number;
  violation_type: string;
  severity: string;
  detail: string;
  occurred_at: Date;
  frame_snapshot_path: string;
  metadata: Record<string, unknown>;
  integrity_hash: string;
  ai_signature: string;
  client_ip: string;
  session_id: string;
}
