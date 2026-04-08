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
  search?: string;
  includeHidden?: boolean;
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

export interface TeacherExamQuestion {
  id: string;
  prompt: string;
  type: string;
  marks: number;
  options: string[];
  answer: string | null;
}

export interface TeacherExamQuestionPaperUpload {
  fileName: string;
  mimeType: string;
  contentBase64: string;
}

export interface UpsertTeacherExamRequest {
  moodleCourseId?: number | null;
  moodleCourseModuleId?: number | null;
  examName: string;
  courseName: string;
  description?: string | null;
  instructions?: string | null;
  durationMinutes: number;
  maxWarnings: number;
  roomCapacity: number;
  enableAiProctoring: boolean;
  enableManualProctoring: boolean;
  autoSubmitOnWarningLimit: boolean;
  captureSnapshots: boolean;
  allowStudentRejoin: boolean;
  answerSheetUploadWindowMinutes: number;
  scheduledStartAt?: string | null;
  scheduledEndAt?: string | null;
  questions: TeacherExamQuestion[];
  questionPaper?: TeacherExamQuestionPaperUpload | null;
  removeQuestionPaper?: boolean;
}

// ============================================================================
// Response Types
// ============================================================================

export interface TeacherExam {
  id: number;
  moodleCourseId: number | null;
  moodleCourseModuleId: number | null;
  examName: string;
  courseName: string;
  description: string | null;
  instructions: string | null;
  durationMinutes: number;
  maxWarnings: number;
  roomCapacity: number;
  enableAiProctoring: boolean;
  enableManualProctoring: boolean;
  autoSubmitOnWarningLimit: boolean;
  captureSnapshots: boolean;
  allowStudentRejoin: boolean;
  answerSheetUploadWindowMinutes: number;
  questionPaperPath: string | null;
  scheduledStartAt: Date | null;
  scheduledEndAt: Date | null;
  questions: TeacherExamQuestion[];
  createdByTeacherId: number | null;
  createdAt: Date;
  updatedAt: Date;
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
  hiddenAt: Date | null;
  isHidden: boolean;
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
