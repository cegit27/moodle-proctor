// ============================================================================
// Teacher Module - Schema & Types
// ============================================================================

// ============================================================================
// Request Types
// ============================================================================

export interface ListAttemptsQuery {
  examId?: number;
  status?: 'not_started' | 'in_progress' | 'submitted' | 'terminated';
  userId?: number;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'created_at' | 'started_at' | 'submitted_at' | 'violation_count';
  sortOrder?: 'ASC' | 'DESC';
}

export interface ListStudentsQuery {
  search?: string;
  examId?: number;
  limit?: number;
  offset?: number;
}

export interface ListReportsQuery {
  examId?: number;
  userId?: number;
  startDate?: string;
  endDate?: string;
  minViolations?: number;
  limit?: number;
  offset?: number;
}

export interface GetStatsQuery {
  timeRange?: 'hour' | 'day' | 'week' | 'month' | 'all';
  examId?: number;
}

export interface SendAlertRequest {
  attemptId: number;
  message: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface SendAlertResponse {
  success: boolean;
  alertId?: string;
  message?: string;
  error?: string;
}

// ============================================================================
// Response Types
// ============================================================================

export interface TeacherExam {
  id: number;
  moodleCourseId: number;
  moodleCourseModuleId: number;
  examName: string;
  courseName: string;
  durationMinutes: number;
  maxWarnings: number;
  createdAt: Date;
  // Aggregated stats
  totalAttempts?: number;
  activeAttempts?: number;
  completedAttempts?: number;
}

export interface TeacherExamResponse {
  success: true;
  data: TeacherExam;
}

export interface TeacherExamListResponse {
  success: true;
  data: {
    exams: TeacherExam[];
    total: number;
  };
}

export interface TeacherAttempt {
  id: number;
  examId: number;
  examName: string;
  courseName: string;
  userId: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  startedAt: Date | null;
  submittedAt: Date | null;
  submissionReason: string | null;
  violationCount: number;
  durationMinutes: number;
  maxWarnings: number;
  ipAddress: string;
}

export interface TeacherAttemptListResponse {
  success: true;
  data: {
    attempts: TeacherAttempt[];
    total: number;
    filters: ListAttemptsQuery;
  };
}

export interface TeacherAttemptDetails {
  attempt: TeacherAttempt;
  exam: TeacherExam;
  user: {
    id: number;
    username: string;
    email: string;
    firstName: string;
    lastName: string;
    profileImageUrl: string | null;
  };
  violations: {
    total: number;
    warnings: number;
    info: number;
  };
  proctoringSession?: {
    id: number;
    sessionStart: Date;
    sessionEnd: Date | null;
    framesProcessed: number;
    aiServiceConnected: boolean;
  };
}

export interface TeacherAttemptDetailsResponse {
  success: true;
  data: TeacherAttemptDetails;
}

export interface TeacherViolation {
  id: number;
  attemptId: number;
  violationType: string;
  severity: 'info' | 'warning';
  detail: string | null;
  occurredAt: Date;
  metadata: Record<string, unknown> | null;
}

export interface TeacherViolationListResponse {
  success: true;
  data: {
    violations: TeacherViolation[];
    total: number;
    summary: {
      byType: Record<string, number>;
      bySeverity: {
        info: number;
        warning: number;
      };
    };
  };
}

export interface TeacherStudent {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  profileImageUrl: string | null;
  lastLoginAt: Date | null;
  // Aggregated
  totalAttempts?: number;
  activeExams?: number;
}

export interface TeacherStudentListResponse {
  success: true;
  data: {
    students: TeacherStudent[];
    total: number;
  };
}

export interface TeacherReport {
  attemptId: number;
  examName: string;
  courseName: string;
  studentName: string;
  studentEmail: string;
  status: string;
  startedAt: Date | null;
  submittedAt: Date | null;
  submissionReason: string | null;
  violationCount: number;
  durationMinutes: number;
  ipAddress: string;
  violations: {
    total: number;
    byType: Record<string, number>;
  };
}

export interface TeacherReportListResponse {
  success: true;
  data: {
    reports: TeacherReport[];
    total: number;
  };
}

export interface TeacherStats {
  overview: {
    totalExams: number;
    totalAttempts: number;
    activeAttempts: number;
    completedAttempts: number;
    terminatedAttempts: number;
  };
  violations: {
    total: number;
    inLast24Hours: number;
    byType: Record<string, number>;
    bySeverity: {
      info: number;
      warning: number;
    };
  };
  students: {
    total: number;
    active: number;
  };
  exams: {
    upcoming: number;
    ongoing: number;
    completed: number;
  };
  timeRange: string;
  generatedAt: Date;
}

export interface TeacherStatsResponse {
  success: true;
  data: TeacherStats;
}
