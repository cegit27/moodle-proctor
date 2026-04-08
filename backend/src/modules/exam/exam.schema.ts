// ============================================================================
// Exam Module - Schema & Types
// ============================================================================

// ============================================================================
// Request Types
// ============================================================================

export interface ExamStartRequest {
  examId: number;
}

export interface ExamSubmitRequest {
  attemptId: number;
  answers: Record<string, unknown>;
  submissionReason?: 'manual_submit' | 'warning_limit_reached' | 'time_expired';
}

export interface ExamResumeRequest {
  attemptId: number;
}

// ============================================================================
// Response Types
// ============================================================================

export interface ExamDetails {
  id: number;
  moodleCourseId: number | null;
  moodleCourseModuleId: number | null;
  examName: string;
  courseName: string;
  description?: string | null;
  instructions?: string | null;
  durationMinutes: number;
  maxWarnings: number;
  roomCapacity?: number;
  enableAiProctoring?: boolean;
  enableManualProctoring?: boolean;
  autoSubmitOnWarningLimit?: boolean;
  captureSnapshots?: boolean;
  allowStudentRejoin?: boolean;
  questions?: Array<{
    id: string;
    prompt: string;
    type: string;
    marks: number;
    options: string[];
    answer: string | null;
  }>;
  questionPaperPath: string | null;
}

export interface ExamDetailsResponse {
  success: true;
  data: {
    exam: ExamDetails;
    userAccess: {
      canStart: boolean;
      reason?: string;
      hasActiveAttempt: boolean;
      attemptsRemaining: number;
    };
  };
}

export interface ExamAttempt {
  id: number;
  examId: number;
  userId: number;
  status: 'not_started' | 'in_progress' | 'submitted' | 'terminated';
  startedAt: Date | null;
  submittedAt: Date | null;
  violationCount: number;
  submissionReason: string | null;
}

export interface ExamAttemptResponse {
  success: true;
  data: {
    attempt: ExamAttempt;
    exam: ExamDetails;
  };
}

export interface ExamSubmitResponse {
  success: true;
  data: {
    attempt: ExamAttempt;
    submitted: boolean;
  };
}

export interface QuestionSummary {
  id: number | string;
  questionNumber: number;
  text: string;
  type: string;
  marks: number;
}

export interface QuestionsSummaryResponse {
  success: true;
  data: {
    examId: number;
    examName: string;
    totalQuestions: number;
    totalMarks: number;
    questions: QuestionSummary[];
  };
}

// ============================================================================
// Database Row Types
// ============================================================================

export interface ExamRow {
  id: number;
  moodle_course_id: number | null;
  moodle_course_module_id: number | null;
  exam_name: string;
  course_name: string;
  description?: string | null;
  instructions?: string | null;
  duration_minutes: number;
  max_warnings: number;
  room_capacity?: number;
  ai_proctoring_enabled?: boolean;
  manual_proctoring_enabled?: boolean;
  auto_submit_on_warning_limit?: boolean;
  capture_snapshots?: boolean;
  allow_student_rejoin?: boolean;
  questions_json?: Array<{
    id: string;
    prompt: string;
    type: string;
    marks: number;
    options: string[];
    answer: string | null;
  }> | null;
  question_paper_path: string;
}

export interface AttemptRow {
  id: number;
  exam_id: number;
  user_id: number;
  moodle_attempt_id: number;
  status: string;
  started_at: Date;
  submitted_at: Date;
  submission_reason: string;
  violation_count: number;
  ip_address: string;
  user_agent: string;
  device_info: Record<string, unknown>;
}
