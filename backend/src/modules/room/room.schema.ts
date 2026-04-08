// ============================================================================
// Room Module - Type Definitions
// ============================================================================

// ============================================================================
// Request Types
// ============================================================================

export interface CreateRoomRequest {
  examId: number;
  capacity?: number;
}

export interface JoinRoomRequest {
  roomCode: string;
  attemptId: number;
}

export interface StudentJoinRequest {
  studentName: string;
  studentEmail: string;
}

export interface CloseRoomRequest {
  roomId: number;
}

// ============================================================================
// Response Types
// ============================================================================

export interface CreateRoomResponse {
  success: boolean;
  data?: {
    roomId: number;
    roomCode: string;
    inviteLink: string;
    examName: string;
    courseName: string;
  };
  error?: string;
}

export interface JoinRoomResponse {
  success: boolean;
  data?: {
    roomId: number;
    examName: string;
    courseName: string;
    status: string;
  };
  error?: string;
}

export interface ActiveRoomsResponse {
  success: boolean;
  data?: Array<{
    id: number;
    examId: number;
    roomCode: string;
    examName: string;
    courseName: string;
    studentCount: number;
    durationMinutes: number;
    createdAt: string;
    activatedAt: string | null;
  }>;
  error?: string;
}

export interface CloseRoomResponse {
  success: boolean;
  data?: {
    roomId: number;
    status: string;
  };
  error?: string;
}

export interface StudentJoinResponse {
  success: boolean;
  data?: {
    enrollmentId: number;
    roomId: number;
    roomCode: string;
    examName: string;
    courseName: string;
    status: string;
    enrollmentSignature: string;
  };
  error?: string;
}

export interface DeleteRoomResponse {
  success: boolean;
  data?: {
    roomId: number;
    deleted: boolean;
  };
  error?: string;
}

export interface RoomMonitoringStudent {
  enrollmentId: number;
  roomId: number;
  attemptId: number | null;
  userId: number | null;
  studentName: string;
  studentEmail: string;
  status: 'not_started' | 'in_progress' | 'submitted' | 'terminated';
  startedAt: string | null;
  submittedAt: string | null;
  ipAddress: string | null;
  warningCount: number;
  totalViolationCount: number;
}

export interface RoomMonitoringStudentsResponse {
  success: boolean;
  data?: RoomMonitoringStudent[];
  error?: string;
}
