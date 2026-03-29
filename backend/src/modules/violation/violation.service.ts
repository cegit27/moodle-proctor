import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import logger from '../../config/logger';
import type {
  ReportViolationRequest,
  ViolationReportResponse,
  GetViolationsResponse,
  ViolationCountCheckResponse
} from './violation.schema';
import type { User } from '../../types';

export enum ViolationSeverity {
  INFO = 'info',
  WARNING = 'warning',
}

export class ViolationService {
  constructor(private pg: Pool) {}

  async recordViolation(
    violation: ReportViolationRequest,
    userId: number,
    signatureService: any
  ): Promise<ViolationReportResponse> {
    const client = await this.pg.connect();

    try {
      await client.query('BEGIN');

      // Verify attempt belongs to user
      const attemptCheck = await client.query(
        'SELECT id, exam_id, violation_count, status FROM exam_attempts WHERE id = $1 AND user_id = $2',
        [violation.attemptId, userId]
      );

      if (attemptCheck.rows.length === 0) {
        throw new Error('Attempt not found');
      }

      const attempt = attemptCheck.rows[0];
      if (attempt.status !== 'in_progress') {
        throw new Error('Cannot record violation for non-active attempt');
      }

      // Verify signature
      const isValid = signatureService.verifyIntegrityHash(violation, violation.integrityHash || '');
      if (!isValid) {
        throw new Error('Invalid violation integrity hash');
      }

      // Insert violation
      const violationResult = await client.query(
        `INSERT INTO violations (
          attempt_id, violation_type, severity, detail, occurred_at,
          frame_snapshot_path, metadata, integrity_hash, ai_signature, 
          client_ip, session_id
        ) VALUES ($1, $2, $3, $4, to_timestamp($5/1000), $6, $7, $8, $9, $10, $11)
        RETURNING id`,
        [
          violation.attemptId,
          violation.violationType,
          violation.severity || 'warning',
          violation.detail || null,
          violation.timestamp || Date.now(),
          violation.frameSnapshot || null,
          violation.metadata || null,
          violation.integrityHash || null,
          violation.aiSignature || null,
          violation.clientIp || null,
          violation.sessionId || null
        ]
      );

      const violationId = violationResult.rows[0].id;

      // Increment violation count
      await client.query(
        'UPDATE exam_attempts SET violation_count = violation_count + 1 WHERE id = $1',
        [violation.attemptId]
      );

      // Check if warning threshold reached (default 15)
      const updatedAttempt = await client.query(
        'SELECT violation_count, exam_id FROM exam_attempts WHERE id = $1',
        [violation.attemptId]
      );

      const newCount = updatedAttempt.rows[0].violation_count;
      const examId = updatedAttempt.rows[0].exam_id;

      let shouldAutoSubmit = false;
      const maxWarningsResult = await client.query(
        'SELECT max_warnings FROM exams WHERE id = $1',
        [examId]
      );

      const maxWarnings = maxWarningsResult.rows[0]?.max_warnings || 15;

      if (newCount >= maxWarnings) {
        logger.warn(`Auto-submit triggered for attempt ${violation.attemptId}: ${newCount}/${maxWarnings} violations`);
        
        // Auto-submit the exam
        await client.query(
          `UPDATE exam_attempts 
           SET status = 'submitted', 
               submitted_at = NOW(),
               submission_reason = 'warning_limit_reached'
           WHERE id = $1`,
          [violation.attemptId]
        );

        shouldAutoSubmit = true;
      }

      await client.query('COMMIT');

      logger.info(`Violation recorded: attempt=${violation.attemptId}, type=${violation.violationType}, count=${newCount}/${maxWarnings}`);

      return {
        success: true,
        data: {
          violationId,
          newViolationCount: newCount,
          maxWarnings,
          thresholdReached: newCount >= maxWarnings,
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

  async getViolations(attemptId: number, userId: number): Promise<GetViolationsResponse> {
    const result = await this.pg.query(
      `SELECT v.*, u.username 
       FROM violations v 
       JOIN exam_attempts ea ON v.attempt_id = ea.id
       JOIN users u ON ea.user_id = u.id
       WHERE ea.id = $1 AND ea.user_id = $2
       ORDER BY v.occurred_at DESC`,
      [attemptId, userId]
    );

    return {
      success: true,
      data: {
        violations: result.rows,
        count: result.rowCount || 0
      }
    };
  }

  async checkViolationCount(attemptId: number): Promise<ViolationCountCheckResponse> {
    const result = await this.pg.query(
      `SELECT ea.violation_count, e.max_warnings
       FROM exam_attempts ea
       JOIN exams e ON ea.exam_id = e.id
       WHERE ea.id = $1`,
      [attemptId]
    );

    if (result.rows.length === 0) {
      throw new Error('Attempt not found');
    }

    const { violation_count, max_warnings } = result.rows[0];
    return {
      success: true,
      data: {
        count: violation_count,
        maxWarnings: max_warnings || 15,
        thresholdReached: violation_count >= (max_warnings || 15)
      }
    };
  }
}

export function createViolationService(pg: Pool) {
  return new ViolationService(pg);
}

