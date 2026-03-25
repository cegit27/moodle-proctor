// ============================================================================
// Room Module - Service Layer
// Proctoring room lifecycle management
// ============================================================================

import { Pool } from 'pg';

// ============================================================================
// Structured Error Types (Issue #8)
// ============================================================================

export class RoomNotFoundError extends Error {
  constructor(roomCode: string) {
    super(`Room not found: ${roomCode}`);
    this.name = 'RoomNotFoundError';
  }
}

export class ExamNotFoundError extends Error {
  constructor(examId: number) {
    super(`Exam not found: ${examId}`);
    this.name = 'ExamNotFoundError';
  }
}

export class NotEnrolledError extends Error {
  constructor(teacherId: number, examId: number) {
    super(`Teacher ${teacherId} is not enrolled in exam ${examId}`);
    this.name = 'NotEnrolledError';
  }
}

export class RoomCollisionError extends Error {
  constructor() {
    super('Failed to generate unique room code after 3 attempts');
    this.name = 'RoomCollisionError';
  }
}

export class CapacityExceededError extends Error {
  constructor(enrolled: number, capacity: number) {
    super(`Exam has ${enrolled} students enrolled, exceeds room capacity of ${capacity}`);
    this.name = 'CapacityExceededError';
  }
}

export class InvalidStateTransitionError extends Error {
  constructor(currentStatus: string, targetStatus: string) {
    super(`Invalid state transition: ${currentStatus} → ${targetStatus}`);
    this.name = 'InvalidStateTransitionError';
  }
}

export class NotRoomOwnerError extends Error {
  constructor(roomId: number, teacherId: number) {
    super(`Teacher ${teacherId} is not the owner of room ${roomId}`);
    this.name = 'NotRoomOwnerError';
  }
}

// ============================================================================
// Type Definitions
// ============================================================================

export interface Room {
  id: number;
  exam_id: number;
  teacher_id: number;
  room_code: string;
  status: 'created' | 'activated' | 'closed';
  capacity: number;
  created_at: Date;
  activated_at: Date | null;
  closed_at: Date | null;
}

export interface RoomWithExamDetails extends Room {
  exam_name: string;
  course_name: string;
}

export interface CreateRoomParams {
  examId: number;
  teacherId: number;
}

export interface ActiveRoomSummary {
  id: number;
  room_code: string;
  exam_name: string;
  student_count: number;
  duration_minutes: number;
  created_at: Date;
}

// ============================================================================
// ProctoringRoomService
// ============================================================================

export class ProctoringRoomService {
  constructor(private pg: Pool) {}

  /**
   * Generate a random 8-character base62 room code
   * Base62: 0-9, a-z, A-Z (62 characters)
   * 8 chars = 62^8 = 218 trillion combinations
   */
  private generateRoomCode(): string {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Create a new proctoring room for an exam
   * Validates: exam exists, teacher enrolled, capacity not exceeded
   * Generates: unique room code (retries 3x on collision)
   */
  async createRoom(params: CreateRoomParams): Promise<Room> {
    const { examId, teacherId } = params;

    // 1. Validate exam exists
    const examResult = await this.pg.query(
      'SELECT id, exam_name FROM exams WHERE id = $1',
      [examId]
    );

    if (examResult.rows.length === 0) {
      throw new ExamNotFoundError(examId);
    }

    // 2. Check teacher enrollment (Moodle course membership)
    // For now, we assume teacher has access if they exist in users table
    // In production, this would call MoodleService to verify enrollment
    const teacherResult = await this.pg.query(
      'SELECT id FROM users WHERE id = $1 AND role = $2',
      [teacherId, 'teacher']
    );

    if (teacherResult.rows.length === 0) {
      throw new NotEnrolledError(teacherId, examId);
    }

    // 3. Check capacity (count enrolled students for this exam)
    const capacityResult = await this.pg.query<{ count: string }>(
      `SELECT COUNT(DISTINCT ea.user_id) as count
       FROM exam_attempts ea
       WHERE ea.exam_id = $1
       AND ea.status IN ('in_progress', 'submitted')`,
      [examId]
    );

    const enrolledCount = parseInt(capacityResult.rows[0].count, 10);
    const capacity = 15; // Default capacity from design

    if (enrolledCount >= capacity) {
      throw new CapacityExceededError(enrolledCount, capacity);
    }

    // 4. Generate unique room code (retry 3x on collision)
    let roomCode: string;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      roomCode = this.generateRoomCode();

      // Check if code already exists
      const existingResult = await this.pg.query(
        'SELECT id FROM proctoring_rooms WHERE room_code = $1',
        [roomCode]
      );

      if (existingResult.rows.length === 0) {
        // Code is unique, use it
        break;
      }

      attempts++;
    }

    if (attempts >= maxAttempts) {
      throw new RoomCollisionError();
    }

    // 5. Insert room
    const insertResult = await this.pg.query<Room>(
      `INSERT INTO proctoring_rooms (exam_id, teacher_id, room_code, status, capacity)
       VALUES ($1, $2, $3, 'created', $4)
       RETURNING *`,
      [examId, teacherId, roomCode, capacity]
    );

    return insertResult.rows[0];
  }

  /**
   * Get room by code (for student joins)
   * Includes exam details for validation
   */
  async getRoomByCode(roomCode: string): Promise<RoomWithExamDetails> {
    const result = await this.pg.query<RoomWithExamDetails>(
      `SELECT
         pr.*,
         e.exam_name,
         e.course_name
       FROM proctoring_rooms pr
       JOIN exams e ON pr.exam_id = e.id
       WHERE pr.room_code = $1`,
      [roomCode]
    );

    if (result.rows.length === 0) {
      throw new RoomNotFoundError(roomCode);
    }

    return result.rows[0];
  }

  /**
   * Get active rooms for a teacher (for room selector)
   * Only returns rooms with status = 'activated'
   * Includes student count and duration
   */
  async getActiveRooms(teacherId: number): Promise<ActiveRoomSummary[]> {
    const result = await this.pg.query<ActiveRoomSummary>(
      `SELECT
         pr.id,
         pr.room_code,
         e.exam_name,
         e.duration_minutes,
         pr.created_at,
         COUNT(DISTINCT ps.attempt_id) as student_count
       FROM proctoring_rooms pr
       JOIN exams e ON pr.exam_id = e.id
       LEFT JOIN proctoring_sessions ps ON ps.attempt_id IN (
         SELECT ea.id FROM exam_attempts ea WHERE ea.exam_id = pr.exam_id
       )
       WHERE pr.teacher_id = $1
       AND pr.status = 'activated'
       GROUP BY pr.id, e.exam_name, e.duration_minutes, pr.created_at
       ORDER BY pr.created_at DESC`,
      [teacherId]
    );

    return result.rows;
  }

  /**
   * Activate a room (transition: created → activated)
   * Called when teacher navigates to room dashboard
   */
  async activateRoom(roomId: number, teacherId: number): Promise<Room> {
    // 1. Get current room state
    const roomResult = await this.pg.query<Room>(
      'SELECT * FROM proctoring_rooms WHERE id = $1',
      [roomId]
    );

    if (roomResult.rows.length === 0) {
      throw new RoomNotFoundError(roomId.toString());
    }

    const room = roomResult.rows[0];

    // 2. Validate ownership
    if (room.teacher_id !== teacherId) {
      throw new NotRoomOwnerError(roomId, teacherId);
    }

    // 3. Validate state transition
    if (room.status !== 'created') {
      throw new InvalidStateTransitionError(room.status, 'activated');
    }

    // 4. Update room
    const updateResult = await this.pg.query<Room>(
      `UPDATE proctoring_rooms
       SET status = 'activated',
           activated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [roomId]
    );

    return updateResult.rows[0];
  }

  /**
   * Close a room (transition: activated → closed)
   * Called when exam ends or teacher closes room
   */
  async closeRoom(roomId: number, teacherId: number): Promise<Room> {
    // 1. Get current room state
    const roomResult = await this.pg.query<Room>(
      'SELECT * FROM proctoring_rooms WHERE id = $1',
      [roomId]
    );

    if (roomResult.rows.length === 0) {
      throw new RoomNotFoundError(roomId.toString());
    }

    const room = roomResult.rows[0];

    // 2. Validate ownership
    if (room.teacher_id !== teacherId) {
      throw new NotRoomOwnerError(roomId, teacherId);
    }

    // 3. Validate state transition
    if (room.status !== 'activated') {
      throw new InvalidStateTransitionError(room.status, 'closed');
    }

    // 4. Update room
    const updateResult = await this.pg.query<Room>(
      `UPDATE proctoring_rooms
       SET status = 'closed',
           closed_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [roomId]
    );

    return updateResult.rows[0];
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createProctoringRoomService(pg: Pool): ProctoringRoomService {
  return new ProctoringRoomService(pg);
}
