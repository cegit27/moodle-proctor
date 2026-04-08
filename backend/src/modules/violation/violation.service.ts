// ============================================================================
// Violation Module - Service Layer
// Handle violation recording and auto-submit logic
// ============================================================================

import { Pool } from 'pg';
import { createExamService } from '../exam/exam.service';
import { SignatureService } from '../security/signature.service';
import type {
  Violation,
  ViolationResponse,
  ViolationsListResponse,
  ViolationCheckResponse,
  ViolationRow,
  ReportViolationRequest
} from './violation.schema';

export class ViolationService {
  constructor(private pg: Pool) {
    this.examService = createExamService(pg);
  }

  private examService: ReturnType<typeof createExamService>;

  /**
   * Record a new violation
   */
  async recordViolation(
    request: ReportViolationRequest,
    userId: number,
    signatureService?: SignatureService
  ): Promise<ViolationResponse> {
    const {
      attemptId,
      roomId,
      violationType,
      severity = 'warning',
      detail,
      metadata = {},
      // frameSnapshot, // Would be saved to storage
      integrityHash,
      aiSignature,
      clientIp,
      sessionId,
      timestamp
    } = request;

    if (!attemptId || !violationType) {
      throw new Error('Attempt not found');
    }

    // Verify attempt belongs to user
    const attemptResult = await this.pg.query<{ id: number; user_id: number; status: string }>(
      'SELECT id, user_id, status FROM exam_attempts WHERE id = $1',
      [attemptId]
    );

    if (attemptResult.rows.length === 0) {
      throw new Error('Attempt not found');
    }

    const attempt = attemptResult.rows[0];

    if (attempt.user_id !== userId) {
      throw new Error('Access denied');
    }

    if (attempt.status !== 'in_progress') {
      throw new Error('Cannot record violation for inactive attempt');
    }

    // Generate integrity hash if not provided
    const finalIntegrityHash = integrityHash ||
      (signatureService ? signatureService.createIntegrityHash({
        attemptId,
        violationType,
        severity,
        timestamp: timestamp || Date.now()
      }) : '');

    // Calculate occurred_at from timestamp or use now
    const occurredAt = timestamp ? new Date(timestamp) : new Date();

    // Insert violation
    const client = await this.pg.connect();

    try {
      await client.query('BEGIN');

      const result = await client.query<ViolationRow>(
        `INSERT INTO violations
        (attempt_id, room_id, violation_type, severity, detail, occurred_at,
         frame_snapshot_path, metadata, integrity_hash, ai_signature, client_ip, session_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          attemptId,
          roomId || null,
          violationType,
          severity,
          detail || null,
          occurredAt,
          null, // frame_snapshot_path (would store uploaded image path)
          JSON.stringify(metadata),
          finalIntegrityHash,
          aiSignature || null,
          clientIp || null,
          sessionId || null
        ]
      );

      const violation = this.mapViolationRow(result.rows[0]);

      // Keep the persisted counter aligned with warning severity only.
      await client.query(
        `UPDATE exam_attempts
         SET violation_count = (
           SELECT COUNT(*)
           FROM violations
           WHERE attempt_id = $1
           AND severity = 'warning'
         )
         WHERE id = $1`,
        [attemptId]
      );

      // Get updated violation count
      const countResult = await client.query<{ count: string; max_warnings: number; auto_submit_on_warning_limit: boolean }>(
        `SELECT
           ea.violation_count::text as count,
           e.max_warnings,
           e.auto_submit_on_warning_limit
         FROM exam_attempts ea
         JOIN exams e ON ea.exam_id = e.id
         WHERE ea.id = $1`,
        [attemptId]
      );

      const { count, max_warnings, auto_submit_on_warning_limit } = countResult.rows[0];
      const violationCount = parseInt(count, 10);
      const threshold = max_warnings;
      const shouldAutoSubmit = Boolean(auto_submit_on_warning_limit) && violationCount >= threshold;

      await client.query('COMMIT');

      // Auto-submit if threshold reached
      if (shouldAutoSubmit) {
        await this.examService.autoSubmitExam(attemptId);
      }

      return {
        success: true,
        data: {
          violation,
          violationCount,
          shouldAutoSubmit
        }
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get violations for an attempt
   */
  async getViolations(attemptId: number, userId: number): Promise<ViolationsListResponse> {
    // Verify access
    const attemptResult = await this.pg.query<{ id: number; user_id: number }>(
      'SELECT id, user_id FROM exam_attempts WHERE id = $1',
      [attemptId]
    );

    if (attemptResult.rows.length === 0) {
      throw new Error('Attempt not found');
    }

    const attempt = attemptResult.rows[0];

    // Check if user owns this attempt or is a teacher
    // @ts-ignore - we'd check user role here
    if (attempt.user_id !== userId) {
      // For now, just check ownership. In production, check if user is teacher
      throw new Error('Access denied');
    }

    const result = await this.pg.query<ViolationRow>(
      `SELECT * FROM violations
      WHERE attempt_id = $1
      ORDER BY occurred_at DESC`,
      [attemptId]
    );

    const violations = result.rows.map(this.mapViolationRow);

    const warningCount = violations.filter(v => v.severity === 'warning').length;
    const infoCount = violations.filter(v => v.severity === 'info').length;

    return {
      success: true,
      data: {
        violations,
        totalCount: violations.length,
        warningCount,
        infoCount
      }
    };
  }

  /**
   * Check violation count for an attempt
   */
  async checkViolationCount(attemptId: number): Promise<ViolationCheckResponse> {
    const result = await this.pg.query<{ count: string; max_warnings: number; auto_submit_on_warning_limit: boolean }>(
      `SELECT ea.violation_count::text as count, e.max_warnings, e.auto_submit_on_warning_limit
      FROM exam_attempts ea
      JOIN exams e ON ea.exam_id = e.id
      WHERE ea.id = $1`,
      [attemptId]
    );

    if (result.rows.length === 0) {
      return {
        success: true,
        data: {
          count: 0,
          threshold: 15, // Default
          shouldAutoSubmit: false
        }
      };
    }

    const { count, max_warnings, auto_submit_on_warning_limit } = result.rows[0];
    const violationCount = parseInt(count, 10);

    return {
      success: true,
      data: {
        count: violationCount,
        threshold: max_warnings,
        shouldAutoSubmit: Boolean(auto_submit_on_warning_limit) && violationCount >= max_warnings
      }
    };
  }

  /**
   * Map database row to Violation
   */
  private mapViolationRow(row: ViolationRow): Violation {
    return {
      id: row.id,
      attemptId: row.attempt_id,
      violationType: row.violation_type,
      severity: row.severity as 'info' | 'warning',
      detail: row.detail,
      occurredAt: row.occurred_at,
      frameSnapshotPath: row.frame_snapshot_path,
      metadata: row.metadata,
      integrityHash: row.integrity_hash,
      aiSignature: row.ai_signature,
      clientIp: row.client_ip,
      sessionId: row.session_id
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createViolationService(pg: Pool): ViolationService {
  return new ViolationService(pg);
}
