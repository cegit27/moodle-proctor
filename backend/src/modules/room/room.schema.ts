// ============================================================================
// Room Module - Type Definitions
// ============================================================================

// ============================================================================
// Request Types
// ============================================================================

export interface CreateRoomRequest {
  examId: number;
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
    roomCode: string;
    examName: string;
    studentCount: number;
    durationMinutes: number;
    createdAt: string;
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
  };
  error?: string;
}
