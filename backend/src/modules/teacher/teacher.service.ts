// ============================================================================
// Teacher Module - Service Layer
// Data retrieval for teacher dashboard
// ============================================================================

import { Pool } from 'pg';
import type {
  TeacherExam,
  TeacherExamListResponse,
  TeacherAttempt,
  TeacherAttemptListResponse,
  TeacherAttemptDetailsResponse,
  TeacherViolationListResponse,
  TeacherStudentListResponse,
  TeacherReportListResponse,
  TeacherStats,
  TeacherStatsResponse,
  ListAttemptsQuery,
  ListStudentsQuery,
  ListReportsQuery,
  GetStatsQuery,
  SendAlertResponse
} from './teacher.schema';

export class TeacherService {
  constructor(private pg: Pool) {}

  // ==========================================================================
  // Exams
  // ==========================================================================

  /**
   * List all exams with optional filters
   */
  async listExams(filters?: { examId?: number }): Promise<TeacherExamListResponse> {
    let query = `
      SELECT
        e.id,
        e.moodle_course_id as "moodleCourseId",
        e.moodle_course_module_id as "moodleCourseModuleId",
        e.exam_name as "examName",
        e.course_name as "courseName",
        e.duration_minutes as "durationMinutes",
        e.max_warnings as "maxWarnings",
        e.created_at as "createdAt",
        COUNT(DISTINCT ea.id) FILTER (WHERE ea.status = 'in_progress') as "activeAttempts",
        COUNT(DISTINCT ea.id) FILTER (WHERE ea.status = 'submitted') as "completedAttempts",
        COUNT(DISTINCT ea.id) as "totalAttempts"
      FROM exams e
      LEFT JOIN exam_attempts ea ON e.id = ea.exam_id
      GROUP BY e.id
      ORDER BY e.created_at DESC
    `;

    const params: any[] = [];

    if (filters?.examId) {
      query += ` WHERE e.id = $${params.length + 1}`;
      params.push(filters.examId);
    }

    const result = await this.pg.query(query, params);

    return {
      success: true,
      data: {
        exams: result.rows.map(this.mapExamRow),
        total: result.rows.length
      }
    };
  }

  /**
   * Get exam details
   */
  async getExam(examId: number): Promise<TeacherExamListResponse> {
    const result = await this.pg.query(
      `SELECT
        e.id,
        e.moodle_course_id as "moodleCourseId",
        e.moodle_course_module_id as "moodleCourseModuleId",
        e.exam_name as "examName",
        e.course_name as "courseName",
        e.duration_minutes as "durationMinutes",
        e.max_warnings as "maxWarnings",
        e.created_at as "createdAt",
        COUNT(DISTINCT ea.id) FILTER (WHERE ea.status = 'in_progress') as "activeAttempts",
        COUNT(DISTINCT ea.id) FILTER (WHERE ea.status = 'submitted') as "completedAttempts",
        COUNT(DISTINCT ea.id) as "totalAttempts"
      FROM exams e
      LEFT JOIN exam_attempts ea ON e.id = ea.exam_id
      WHERE e.id = $1
      GROUP BY e.id`,
      [examId]
    );

    if (result.rows.length === 0) {
      throw new Error('Exam not found');
    }

    return {
      success: true,
      data: {
        exams: [this.mapExamRow(result.rows[0])],
        total: 1
      }
    };
  }

  // ==========================================================================
  // Attempts
  // ==========================================================================

  /**
   * List attempts with filtering
   */
  async listAttempts(query: ListAttemptsQuery): Promise<TeacherAttemptListResponse> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramCount = 0;

    if (query.examId) {
      paramCount++;
      conditions.push(`ea.exam_id = $${paramCount}`);
      params.push(query.examId);
    }

    if (query.status) {
      paramCount++;
      conditions.push(`ea.status = $${paramCount}`);
      params.push(query.status);
    }

    if (query.userId) {
      paramCount++;
      conditions.push(`ea.user_id = $${paramCount}`);
      params.push(query.userId);
    }

    if (query.startDate) {
      paramCount++;
      conditions.push(`ea.created_at >= $${paramCount}`);
      params.push(query.startDate);
    }

    if (query.endDate) {
      paramCount++;
      conditions.push(`ea.created_at <= $${paramCount}`);
      params.push(query.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Default sort
    const sortBy = query.sortBy || 'created_at';
    const sortOrder = query.sortOrder || 'DESC';
    const limit = Math.min(query.limit || 50, 100); // Max 100
    const offset = query.offset || 0;

    // Get attempts with count
    const dataQuery = `
      SELECT
        ea.id,
        ea.exam_id as "examId",
        ea.user_id as "userId",
        ea.status,
        ea.started_at as "startedAt",
        ea.submitted_at as "submittedAt",
        ea.submission_reason as "submissionReason",
        ea.violation_count as "violationCount",
        ea.ip_address as "ipAddress",
        e.exam_name as "examName",
        e.course_name as "courseName",
        e.duration_minutes as "durationMinutes",
        e.max_warnings as "maxWarnings",
        u.username,
        u.email,
        u.first_name as "firstName",
        u.last_name as "lastName"
      FROM exam_attempts ea
      JOIN exams e ON ea.exam_id = e.id
      JOIN users u ON ea.user_id = u.id
      ${whereClause}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    params.push(limit, offset);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as count
      FROM exam_attempts ea
      ${whereClause}
    `;

    const [dataResult, countResult] = await Promise.all([
      this.pg.query(dataQuery, params.slice(0, paramCount + 2)),
      this.pg.query(countQuery, params.slice(0, paramCount))
    ]);

    return {
      success: true,
      data: {
        attempts: dataResult.rows.map(this.mapAttemptRow),
        total: parseInt(countResult.rows[0].count, 10),
        filters: query
      }
    };
  }

  /**
   * Get attempt details with violations and session info
   */
  async getAttemptDetails(attemptId: number): Promise<TeacherAttemptDetailsResponse> {
    // Get attempt with user and exam info
    const attemptResult = await this.pg.query(
      `SELECT
        ea.id,
        ea.exam_id as "examId",
        ea.user_id as "userId",
        ea.status,
        ea.started_at as "startedAt",
        ea.submitted_at as "submittedAt",
        ea.submission_reason as "submissionReason",
        ea.violation_count as "violationCount",
        ea.ip_address as "ipAddress",
        e.exam_name as "examName",
        e.course_name as "courseName",
        e.duration_minutes as "durationMinutes",
        e.max_warnings as "maxWarnings",
        u.username,
        u.email,
        u.first_name as "firstName",
        u.last_name as "lastName",
        u.profile_image_url as "profileImageUrl"
      FROM exam_attempts ea
      JOIN exams e ON ea.exam_id = e.id
      JOIN users u ON ea.user_id = u.id
      WHERE ea.id = $1`,
      [attemptId]
    );

    if (attemptResult.rows.length === 0) {
      throw new Error('Attempt not found');
    }

    const attempt = this.mapAttemptRow(attemptResult.rows[0]);

    // Get exam details
    const exam = this.mapExamRow({
      ...attemptResult.rows[0],
      moodle_course_id: attemptResult.rows[0].moodleCourseId || 0,
      moodle_course_module_id: attemptResult.rows[0].moodleCourseModuleId || 0
    });

    // Get user details
    const user = {
      id: attemptResult.rows[0].userId,
      username: attemptResult.rows[0].username,
      email: attemptResult.rows[0].email,
      firstName: attemptResult.rows[0].firstName,
      lastName: attemptResult.rows[0].lastName,
      profileImageUrl: attemptResult.rows[0].profileImageUrl
    };

    // Get violation summary
    const violationResult = await this.pg.query(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE severity = 'warning') as warnings,
        COUNT(*) FILTER (WHERE severity = 'info') as info
      FROM violations
      WHERE attempt_id = $1`,
      [attemptId]
    );

    const violations = {
      total: parseInt(violationResult.rows[0].total, 10),
      warnings: parseInt(violationResult.rows[0].warnings, 10),
      info: parseInt(violationResult.rows[0].info, 10)
    };

    // Get proctoring session info
    const sessionResult = await this.pg.query(
      `SELECT
        id,
        session_start as "sessionStart",
        session_end as "sessionEnd",
        frames_processed as "framesProcessed",
        ai_service_connected as "aiServiceConnected"
      FROM proctoring_sessions
      WHERE attempt_id = $1
      ORDER BY session_start DESC
      LIMIT 1`,
      [attemptId]
    );

    const proctoringSession = sessionResult.rows.length > 0 ? sessionResult.rows[0] : undefined;

    return {
      success: true,
      data: {
        attempt,
        exam,
        user,
        violations,
        proctoringSession
      }
    };
  }

  // ==========================================================================
  // Violations
  // ==========================================================================

  /**
   * Get violations for an attempt
   */
  async getAttemptViolations(attemptId: number): Promise<TeacherViolationListResponse> {
    const violationsResult = await this.pg.query(
      `SELECT
        id,
        attempt_id as "attemptId",
        violation_type as "violationType",
        severity,
        detail,
        occurred_at as "occurredAt",
        metadata
      FROM violations
      WHERE attempt_id = $1
      ORDER BY occurred_at DESC`,
      [attemptId]
    );

    const violations = violationsResult.rows.map(row => ({
      id: row.id,
      attemptId: row.attemptId,
      violationType: row.violationType,
      severity: row.severity,
      detail: row.detail,
      occurredAt: row.occurredAt,
      metadata: row.metadata
    }));

    // Calculate summary
    const summary = {
      byType: {} as Record<string, number>,
      bySeverity: {
        info: 0,
        warning: 0
      }
    };

    for (const v of violations) {
      summary.byType[v.violationType] = (summary.byType[v.violationType] || 0) + 1;
      if (v.severity === 'info' || v.severity === 'warning') {
        summary.bySeverity[v.severity as 'info' | 'warning']++;
      }
    }

    return {
      success: true,
      data: {
        violations,
        total: violations.length,
        summary
      }
    };
  }

  // ==========================================================================
  // Students
  // ==========================================================================

  /**
   * List students
   */
  async listStudents(query: ListStudentsQuery): Promise<TeacherStudentListResponse> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramCount = 0;

    if (query.search) {
      paramCount++;
      conditions.push(`(
        u.username ILIKE $${paramCount} OR
        u.email ILIKE $${paramCount} OR
        u.first_name ILIKE $${paramCount} OR
        u.last_name ILIKE $${paramCount}
      )`);
      params.push(`%${query.search}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const limit = Math.min(query.limit || 50, 100);
    const offset = query.offset || 0;

    const dataQuery = `
      SELECT
        u.id,
        u.username,
        u.email,
        u.first_name as "firstName",
        u.last_name as "lastName",
        u.role,
        u.profile_image_url as "profileImageUrl",
        u.last_login_at as "lastLoginAt"
      FROM users u
      ${whereClause}
      ORDER BY u.username ASC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    params.push(limit, offset);

    const countQuery = `
      SELECT COUNT(*) as count FROM users u
      ${whereClause}
    `;

    const [dataResult, countResult] = await Promise.all([
      this.pg.query(dataQuery, params.slice(0, paramCount + 2)),
      this.pg.query(countQuery, params.slice(0, paramCount))
    ]);

    return {
      success: true,
      data: {
        students: dataResult.rows.map(row => ({
          id: row.id,
          username: row.username,
          email: row.email,
          firstName: row.first_name,
          lastName: row.last_name,
          role: row.role,
          profileImageUrl: row.profile_image_url,
          lastLoginAt: row.last_login_at
        })),
        total: parseInt(countResult.rows[0].count, 10)
      }
    };
  }

  // ==========================================================================
  // Reports
  // ==========================================================================

  /**
   * Generate reports
   */
  async listReports(query: ListReportsQuery): Promise<TeacherReportListResponse> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramCount = 0;

    if (query.examId) {
      paramCount++;
      conditions.push(`ea.exam_id = $${paramCount}`);
      params.push(query.examId);
    }

    if (query.userId) {
      paramCount++;
      conditions.push(`ea.user_id = $${paramCount}`);
      params.push(query.userId);
    }

    if (query.startDate) {
      paramCount++;
      conditions.push(`ea.created_at >= $${paramCount}`);
      params.push(query.startDate);
    }

    if (query.endDate) {
      paramCount++;
      conditions.push(`ea.created_at <= $${paramCount}`);
      params.push(query.endDate);
    }

    if (query.minViolations) {
      paramCount++;
      conditions.push(`ea.violation_count >= $${paramCount}`);
      params.push(query.minViolations);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const limit = Math.min(query.limit || 100, 500);
    const offset = query.offset || 0;

    const dataQuery = `
      SELECT
        ea.id as "attemptId",
        e.exam_name as "examName",
        e.course_name as "courseName",
        u.first_name || ' ' || u.last_name as "studentName",
        u.email as "studentEmail",
        ea.status,
        ea.started_at as "startedAt",
        ea.submitted_at as "submittedAt",
        ea.submission_reason as "submissionReason",
        ea.violation_count as "violationCount",
        e.duration_minutes as "durationMinutes",
        ea.ip_address as "ipAddress"
      FROM exam_attempts ea
      JOIN exams e ON ea.exam_id = e.id
      JOIN users u ON ea.user_id = u.id
      ${whereClause}
      ORDER BY ea.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    params.push(limit, offset);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as count
      FROM exam_attempts ea
      ${whereClause}
    `;

    const [dataResult, countResult] = await Promise.all([
      this.pg.query(dataQuery, params.slice(0, paramCount + 2)),
      this.pg.query(countQuery, params.slice(0, paramCount))
    ]);

    const reports = dataResult.rows.map(row => ({
      attemptId: row.attemptId,
      examName: row.examName,
      courseName: row.courseName,
      studentName: row.studentName,
      studentEmail: row.studentEmail,
      status: row.status,
      startedAt: row.startedAt,
      submittedAt: row.submittedAt,
      submissionReason: row.submissionReason,
      violationCount: row.violationCount,
      durationMinutes: row.durationMinutes,
      ipAddress: row.ipAddress,
      violations: {
        total: 0,
        byType: {}
      }
    }));

    return {
      success: true,
      data: {
        reports,
        total: parseInt(countResult.rows[0].count, 10)
      }
    };
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Get dashboard statistics
   */
  async getStats(query: GetStatsQuery): Promise<TeacherStatsResponse> {
    const timeRange = query.timeRange || 'all';
    let timeFilter = '';

    if (timeRange === 'hour') {
      timeFilter = "AND ea.created_at >= NOW() - INTERVAL '1 hour'";
    } else if (timeRange === 'day') {
      timeFilter = "AND ea.created_at >= NOW() - INTERVAL '1 day'";
    } else if (timeRange === 'week') {
      timeFilter = "AND ea.created_at >= NOW() - INTERVAL '1 week'";
    } else if (timeRange === 'month') {
      timeFilter = "AND ea.created_at >= NOW() - INTERVAL '1 month'";
    }

    const examFilter = query.examId ? `AND ea.exam_id = ${query.examId}` : '';

    // Get overview stats
    const overviewResult = await this.pg.query(`
      SELECT
        COUNT(DISTINCT e.id) as "totalExams",
        COUNT(ea.id) as "totalAttempts",
        COUNT(ea.id) FILTER (WHERE ea.status = 'in_progress') as "activeAttempts",
        COUNT(ea.id) FILTER (WHERE ea.status = 'submitted') as "completedAttempts",
        COUNT(ea.id) FILTER (WHERE ea.status = 'terminated') as "terminatedAttempts"
      FROM exams e
      LEFT JOIN exam_attempts ea ON e.id = ea.exam_id ${timeFilter} ${examFilter}
    `);

    // Get violation stats
    const violationsResult = await this.pg.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE v.occurred_at >= NOW() - INTERVAL '24 hours') as "inLast24Hours",
        json_object_agg(v.violation_type, COUNT(*)) as "byType",
        COUNT(*) FILTER (WHERE v.severity = 'warning') as warnings,
        COUNT(*) FILTER (WHERE v.severity = 'info') as info
      FROM violations v
      JOIN exam_attempts ea ON v.attempt_id = ea.id
      WHERE TRUE ${timeFilter} ${examFilter}
    `);

    // Get student stats
    const studentsResult = await this.pg.query(`
      SELECT
        COUNT(DISTINCT u.id) as "total",
        COUNT(DISTINCT u.id) FILTER (WHERE ea.status = 'in_progress') as "active"
      FROM users u
      LEFT JOIN exam_attempts ea ON u.id = ea.user_id
      WHERE u.role = 'student' ${timeFilter} ${examFilter}
    `);

    // Get exam status stats
    const examsResult = await this.pg.query(`
      SELECT
        COUNT(*) FILTER (WHERE ea.status = 'in_progress') as "ongoing",
        COUNT(*) FILTER (WHERE ea.status = 'submitted') as "completed"
      FROM exam_attempts ea
      WHERE TRUE ${timeFilter} ${examFilter}
    `);

    const stats: TeacherStats = {
      overview: overviewResult.rows[0] || {
        totalExams: 0,
        totalAttempts: 0,
        activeAttempts: 0,
        completedAttempts: 0,
        terminatedAttempts: 0
      },
      violations: {
        total: parseInt(violationsResult.rows[0]?.total || '0', 10),
        inLast24Hours: parseInt(violationsResult.rows[0]?.inLast24Hours || '0', 10),
        byType: violationsResult.rows[0]?.byType || {},
        bySeverity: {
          warning: parseInt(violationsResult.rows[0]?.warnings || '0', 10),
          info: parseInt(violationsResult.rows[0]?.info || '0', 10)
        }
      },
      students: studentsResult.rows[0] || {
        total: 0,
        active: 0
      },
      exams: {
        upcoming: 0, // Would need exam scheduling data
        ongoing: parseInt(examsResult.rows[0]?.ongoing || '0', 10),
        completed: parseInt(examsResult.rows[0]?.completed || '0', 10)
      },
      timeRange,
      generatedAt: new Date()
    };

    return {
      success: true,
      data: stats
    };
  }

  // ==========================================================================
  // Alerts
  // ==========================================================================

  /**
   * Send alert to a student
   */
  async sendAlert(attemptId: number, message: string, severity: 'info' | 'warning' | 'critical', teacherId: number): Promise<SendAlertResponse> {
    // Validate attempt exists and is in progress
    const attemptResult = await this.pg.query(
      `SELECT ea.id, ea.status, ea.user_id, u.first_name, u.last_name
       FROM exam_attempts ea
       JOIN users u ON ea.user_id = u.id
       WHERE ea.id = $1`,
      [attemptId]
    );

    if (attemptResult.rows.length === 0) {
      return {
        success: false,
        error: 'Attempt not found'
      };
    }

    const attempt = attemptResult.rows[0];

    if (attempt.status !== 'in_progress') {
      return {
        success: false,
        error: 'Attempt is not currently in progress'
      };
    }

    // Get teacher info
    const teacherResult = await this.pg.query(
      `SELECT first_name, last_name FROM users WHERE id = $1`,
      [teacherId]
    );

    if (teacherResult.rows.length === 0) {
      return {
        success: false,
        error: 'Teacher not found'
      };
    }

    const teacher = teacherResult.rows[0];
    const teacherName = `${teacher.first_name} ${teacher.last_name}`.trim();

    // Generate alert ID
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Log alert in database (optional - for audit trail)
    try {
      await this.pg.query(
        `INSERT INTO teacher_alerts (id, attempt_id, teacher_id, message, severity, sent_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [alertId, attemptId, teacherId, message, severity]
      );
    } catch (err) {
      // If table doesn't exist, continue without logging
      const dbError = err as Error
      console.warn('Could not log alert to database:', dbError.message);
    }

    // Send via WebSocket handler (will be injected)
    // This will be called from the route handler where we have access to the WS handler
    return {
      success: true,
      alertId,
      message: `Alert sent successfully by ${teacherName}`
    };
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private mapExamRow(row: any): TeacherExam {
    return {
      id: row.id,
      moodleCourseId: row.moodleCourseId,
      moodleCourseModuleId: row.moodleCourseModuleId,
      examName: row.examName,
      courseName: row.courseName,
      durationMinutes: parseInt(row.durationMinutes, 10),
      maxWarnings: parseInt(row.maxWarnings, 10),
      createdAt: row.createdAt,
      totalAttempts: parseInt(row.totalAttempts || '0', 10),
      activeAttempts: parseInt(row.activeAttempts || '0', 10),
      completedAttempts: parseInt(row.completedAttempts || '0', 10)
    };
  }

  private mapAttemptRow(row: any): TeacherAttempt {
    return {
      id: row.id,
      examId: row.examId,
      examName: row.examName,
      courseName: row.courseName,
      userId: row.userId,
      username: row.username,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      status: row.status,
      startedAt: row.startedAt,
      submittedAt: row.submittedAt,
      submissionReason: row.submissionReason,
      violationCount: row.violationCount,
      durationMinutes: row.durationMinutes,
      maxWarnings: row.maxWarnings,
      ipAddress: row.ipAddress
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createTeacherService(pg: Pool): TeacherService {
  return new TeacherService(pg);
}
