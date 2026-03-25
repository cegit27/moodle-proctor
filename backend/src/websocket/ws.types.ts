// ============================================================================
// WebSocket Module - Type Definitions
// Message types for bidirectional communication
// ============================================================================

// ============================================================================
// Message Types from Client -> Backend -> AI Service
// ============================================================================

export interface FrameMessage {
  type: 'frame';
  frameId: number;
  sequence: number;
  timestamp: number;
  frame: string; // Base64 encoded image
  signature?: string;
  attemptId: number;
  sessionId: string;
}

export interface ControlMessage {
  type: 'start' | 'stop' | 'ping';
  attemptId: number;
  sessionId: string;
  timestamp: number;
}

export type ClientMessage = FrameMessage | ControlMessage;

// ============================================================================
// Message Types from AI Service -> Backend -> Client
// ============================================================================

export interface ViolationMessage {
  type: 'violation';
  frame: number;
  violations: string[];
  advisories: string[];
  flag: boolean;
  message: string;
  details: Record<string, unknown>;
  timestamp: number;
}

export interface StatusMessage {
  type: 'status';
  status: 'processing' | 'error' | 'ready';
  message?: string;
  fps?: number;
  timestamp: number;
}

export interface ErrorMessage {
  type: 'error';
  error: string;
  message: string;
  timestamp: number;
}

export type AIMessage = ViolationMessage | StatusMessage | ErrorMessage;

// ============================================================================
// WebSocket Connection State
// ============================================================================

export interface WSConnection {
  socket: WebSocket;
  userId: number;
  attemptId: number;
  sessionId: string;
  isConnected: boolean;
  lastFrameSequence: number;
  framesProcessed: number;
  startTime: number;
  ipAddress: string;
  userAgent: string;
}

export interface AIConnection {
  socket: WebSocket;
  isConnected: boolean;
  lastHeartbeat: number;
  reconnectAttempts: number;
}

// ============================================================================
// WebSocket Server Types
// ============================================================================

export interface ProctoringSession {
  attemptId: number;
  sessionId: string;
  userId: number;
  examId: number;
  roomId: number; // Issue #3: Cache roomId in memory to prevent N+1 queries on violations
  status: 'starting' | 'active' | 'stopping' | 'stopped';
  clientConnection: WSConnection | null;
  aiConnection: AIConnection | null;
  startTime: number;
  lastActivity: number;
}

export interface ProctoringSessionData {
  attemptId: number;
  userId: number;
  examId: number;
  sessionId: string;
  ipAddress: string;
  userAgent: string;
}
