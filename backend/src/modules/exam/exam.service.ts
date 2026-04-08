// ============================================================================
// Exam Module - Service Layer
// Core business logic for exam lifecycle
// ============================================================================

import { Pool } from 'pg';
import path from 'path';
import type {
  ExamDetails,
  ExamAttempt,
  ExamDetailsResponse,
  ExamAttemptResponse,
  ExamSubmitResponse,
  QuestionsSummaryResponse,
  ExamRow,
  AttemptRow
} from './exam.schema';
import { createStudentService } from '../student/student.service';
import { getQuizByExamMapping } from '../moodle-quiz/moodle-quiz.service';

export class ExamService {
  constructor(private pg: Pool) {
    this.studentService = createStudentService(pg);
  }

  private studentService: ReturnType<typeof createStudentService>;

  /**
   * Get exam details with access information
   */
  async getExamDetails(examId: number, userId: number): Promise<ExamDetailsResponse> {
    // Get exam details
    const examResult = await this.pg.query<ExamRow>(
      `SELECT
        id, moodle_course_id, moodle_course_module_id, exam_name, course_name,
        description, instructions, duration_minutes, max_warnings, room_capacity,
        ai_proctoring_enabled, manual_proctoring_enabled, auto_submit_on_warning_limit,
        capture_snapshots, allow_student_rejoin, questions_json, question_paper_path
      FROM exams
      WHERE id = $1`,
      [examId]
    );

    if (examResult.rows.length === 0) {
      throw new Error('Exam not found');
    }

    const exam = this.mapExamRow(examResult.rows[0]);

    // Check user access
    const canStartCheck = await this.studentService.canStartExam(userId, examId);

    // Get attempt count
    const attemptCountResult = await this.pg.query<{ count: string }>(
      `SELECT COUNT(*) as count
      FROM exam_attempts
      WHERE user_id = $1 AND exam_id = $2`,
      [userId, examId]
    );

    const attemptsCount = parseInt(attemptCountResult.rows[0].count, 10);

    // Check for active attempt
    const activeAttemptResult = await this.pg.query<{ id: number }>(
      `SELECT id FROM exam_attempts
      WHERE user_id = $1 AND exam_id = $2 AND status = 'in_progress'
      LIMIT 1`,
      [userId, examId]
    );

    const hasActiveAttempt = activeAttemptResult.rows.length > 0;

    return {
      success: true,
      data: {
        exam,
        userAccess: {
          canStart: canStartCheck.allowed,
          reason: canStartCheck.reason,
          hasActiveAttempt,
          attemptsRemaining: Math.max(0, 3 - attemptsCount) // Max 3 attempts
        }
      }
    };
  }

  /**
   * Start a new exam attempt
   */
  async startExam(userId: number, examId: number, ipAddress?: string, userAgent?: string): Promise<ExamAttemptResponse> {
    // Verify user can start exam
    const canStartCheck = await this.studentService.canStartExam(userId, examId);

    if (!canStartCheck.allowed) {
      throw new Error(canStartCheck.reason || 'Cannot start exam');
    }

    // Get exam details
    const examResult = await this.pg.query<ExamRow>(
      `SELECT id, moodle_course_id, moodle_course_module_id, exam_name, course_name,
       description, instructions, duration_minutes, max_warnings, room_capacity,
       ai_proctoring_enabled, manual_proctoring_enabled, auto_submit_on_warning_limit,
       capture_snapshots, allow_student_rejoin, questions_json, question_paper_path
      FROM exams WHERE id = $1`,
      [examId]
    );

    if (examResult.rows.length === 0) {
      throw new Error('Exam not found');
    }

    const exam = this.mapExamRow(examResult.rows[0]);

    // Start transaction
    const client = await this.pg.connect();

    try {
      await client.query('BEGIN');

      // Create exam attempt
      const attemptResult = await client.query<AttemptRow>(
        `INSERT INTO exam_attempts
        (user_id, exam_id, status, started_at, violation_count, ip_address, user_agent)
        VALUES ($1, $2, 'in_progress', NOW(), 0, $3, $4)
        RETURNING *`,
        [userId, examId, ipAddress || null, userAgent || null]
      );

      const attempt = this.mapAttemptRow(attemptResult.rows[0]);

      // Log audit
      await this.logAudit(client, userId, 'exam_start', 'exam', examId, {
        attemptId: attempt.id
      });

      await client.query('COMMIT');

      return {
        success: true,
        data: {
          attempt,
          exam
        }
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async terminateActiveAttemptsForExam(
    userId: number,
    examId: number,
    submissionReason: string = 'superseded_by_new_room_session'
  ): Promise<number> {
    const result = await this.pg.query<{ id: number }>(
      `UPDATE exam_attempts
       SET status = 'terminated',
           submitted_at = NOW(),
           submission_reason = $3
       WHERE user_id = $1
       AND exam_id = $2
       AND status = 'in_progress'
       RETURNING id`,
      [userId, examId, submissionReason]
    );

    return result.rowCount || 0;
  }

  /**
   * Resume an existing exam attempt
   */
  async resumeExam(userId: number, attemptId: number): Promise<ExamAttemptResponse> {
    // Get attempt
    const attemptResult = await this.pg.query<AttemptRow>(
      `SELECT * FROM exam_attempts
      WHERE id = $1 AND user_id = $2`,
      [attemptId, userId]
    );

    if (attemptResult.rows.length === 0) {
      throw new Error('Attempt not found');
    }

    const attempt = this.mapAttemptRow(attemptResult.rows[0]);

    if (attempt.status !== 'in_progress') {
      throw new Error('Cannot resume exam - attempt is not in progress');
    }

    // Get exam details
    const examResult = await this.pg.query<ExamRow>(
      `SELECT * FROM exams WHERE id = $1`,
      [attempt.examId]
    );

    if (examResult.rows.length === 0) {
      throw new Error('Exam not found');
    }

    const exam = this.mapExamRow(examResult.rows[0]);

    return {
      success: true,
      data: {
        attempt,
        exam
      }
    };
  }

  /**
   * Submit exam answers
   */
  async submitExam(
    userId: number,
    attemptId: number,
    answers: Record<string, unknown>,
    submissionReason: string = 'manual_submit',
    ipAddress?: string
  ): Promise<ExamSubmitResponse> {
    // Get attempt
    const attemptResult = await this.pg.query<AttemptRow>(
      `SELECT * FROM exam_attempts
      WHERE id = $1 AND user_id = $2`,
      [attemptId, userId]
    );

    if (attemptResult.rows.length === 0) {
      throw new Error('Attempt not found');
    }

    const attempt = this.mapAttemptRow(attemptResult.rows[0]);

    if (attempt.status !== 'in_progress') {
      throw new Error('Cannot submit exam - attempt is not in progress');
    }

    const client = await this.pg.connect();

    try {
      await client.query('BEGIN');

      // Update attempt
      const updatedResult = await client.query<AttemptRow>(
        `UPDATE exam_attempts
        SET status = 'submitted',
            submitted_at = NOW(),
            submission_reason = $1,
            device_info = $2
        WHERE id = $3
        RETURNING *`,
        [submissionReason, JSON.stringify({ answers, ip: ipAddress }), attemptId]
      );

      const updatedAttempt = this.mapAttemptRow(updatedResult.rows[0]);

      // Log audit
      await this.logAudit(client, userId, 'exam_submit', 'attempt', attemptId, {
        submissionReason,
        violationCount: attempt.violationCount
      });

      await client.query('COMMIT');

      return {
        success: true,
        data: {
          attempt: updatedAttempt,
          submitted: true
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
   * Auto-submit exam due to warning limit
   */
  async autoSubmitExam(attemptId: number): Promise<void> {
    const client = await this.pg.connect();

    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE exam_attempts
        SET status = 'submitted',
            submitted_at = NOW(),
            submission_reason = 'warning_limit_reached'
        WHERE id = $1 AND status = 'in_progress'`,
        [attemptId]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get question summary for an exam
   */
  async getQuestionsSummary(examId: number, _userId: number): Promise<QuestionsSummaryResponse> {
    const examResult = await this.pg.query<ExamRow>(
      `SELECT id, moodle_course_id, moodle_course_module_id, exam_name, course_name,
       description, instructions, duration_minutes, max_warnings, room_capacity,
       ai_proctoring_enabled, manual_proctoring_enabled, auto_submit_on_warning_limit,
       capture_snapshots, allow_student_rejoin, questions_json, question_paper_path
       FROM exams WHERE id = $1`,
      [examId]
    );

    if (examResult.rows.length === 0) {
      throw new Error('Exam not found');
    }

    const exam = examResult.rows[0];
    const syncedQuiz = exam.moodle_course_id && exam.moodle_course_module_id
      ? await getQuizByExamMapping(
          this.pg,
          exam.moodle_course_id,
          exam.moodle_course_module_id
        ).catch(() => null)
      : null;

    if (syncedQuiz && syncedQuiz.questions.length > 0) {
      const questions = syncedQuiz.questions.map((question, index) => ({
        id: question.id,
        questionNumber: index + 1,
        text: this.toPlainText(question.questionText || question.name),
        type: question.qtype,
        marks: question.defaultMark || 1
      }));

      return {
        success: true,
        data: {
          examId: exam.id,
          examName: exam.exam_name,
          totalQuestions: questions.length,
          totalMarks: questions.reduce((sum, question) => sum + question.marks, 0),
          questions
        }
      };
    }

    const teacherQuestions = Array.isArray(exam.questions_json)
      ? exam.questions_json
      : [];

    if (teacherQuestions.length > 0) {
      const questions = teacherQuestions.map((question, index) => ({
        id: question.id || `${exam.id}-${index + 1}`,
        questionNumber: index + 1,
        text: this.toPlainText(question.prompt),
        type: question.type || 'short_answer',
        marks: Number(question.marks) || 0
      }));

      return {
        success: true,
        data: {
          examId: exam.id,
          examName: exam.exam_name,
          totalQuestions: questions.length,
          totalMarks: questions.reduce((sum, question) => sum + question.marks, 0),
          questions
        }
      };
    }

    const derivedQuestionPaperLabel = exam.question_paper_path
      ? this.toPlainText(path.basename(exam.question_paper_path).replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '))
      : '';

    return {
      success: true,
      data: {
        examId: exam.id,
        examName: exam.exam_name,
        totalQuestions: derivedQuestionPaperLabel ? 1 : 0,
        totalMarks: 0,
        questions: derivedQuestionPaperLabel
          ? [{
              id: exam.id,
              questionNumber: 1,
              text: `${derivedQuestionPaperLabel} (question paper PDF)`,
              type: 'document',
              marks: 0
            }]
          : []
      }
    };
  }

  /**
   * Map database row to ExamDetails
   */
  private mapExamRow(row: ExamRow): ExamDetails {
    return {
      id: row.id,
      moodleCourseId: row.moodle_course_id,
      moodleCourseModuleId: row.moodle_course_module_id,
      examName: row.exam_name,
      courseName: row.course_name,
      description: row.description ?? null,
      instructions: row.instructions ?? null,
      durationMinutes: row.duration_minutes,
      maxWarnings: row.max_warnings,
      roomCapacity: row.room_capacity ?? 15,
      enableAiProctoring: row.ai_proctoring_enabled ?? true,
      enableManualProctoring: row.manual_proctoring_enabled ?? true,
      autoSubmitOnWarningLimit: row.auto_submit_on_warning_limit ?? true,
      captureSnapshots: row.capture_snapshots ?? true,
      allowStudentRejoin: row.allow_student_rejoin ?? true,
      questions: Array.isArray(row.questions_json) ? row.questions_json : [],
      questionPaperPath: row.question_paper_path
    };
  }

  /**
   * Map database row to ExamAttempt
   */
  private mapAttemptRow(row: AttemptRow): ExamAttempt {
    return {
      id: row.id,
      examId: row.exam_id,
      userId: row.user_id,
      status: row.status as ExamAttempt['status'],
      startedAt: row.started_at,
      submittedAt: row.submitted_at,
      violationCount: row.violation_count,
      submissionReason: row.submission_reason
    };
  }

  private toPlainText(value: string): string {
    return value
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Log audit entry
   */
  private async logAudit(
    client: any,
    userId: number,
    action: string,
    resourceType: string,
    resourceId: number,
    details: Record<string, unknown>
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
      VALUES ($1, $2, $3, $4, $5)`,
      [userId, action, resourceType, resourceId, JSON.stringify(details)]
    );
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createExamService(pg: Pool): ExamService {
  return new ExamService(pg);
}
