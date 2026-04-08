// ============================================================================
// Room Module - Service Layer
// Proctoring room lifecycle management
// ============================================================================

import { Pool } from 'pg';
import { randomBytes, createHmac, createHash } from 'crypto';
import config from '../../config';

/**
 * Sanitize user input to prevent XSS attacks
 * Strips HTML tags and dangerous characters
 */
function sanitizeInput(input: string): string {
  // Remove HTML tags
  return input
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers like onclick=
    .trim();
}

function createSyntheticStudentUsername(email: string): string {
  const sanitizedBase = email
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const hashSuffix = createHash('sha256').update(email).digest('hex').slice(0, 10);
  const base = sanitizedBase || 'student';

  return `room_${base.slice(0, 180)}_${hashSuffix}`;
}

function createSyntheticMoodleUserId(): number {
  const randomInt = randomBytes(4).readUInt32BE(0) % 2147483647;
  return -Math.max(1, randomInt);
}

/**
 * Generate HMAC signature for enrollment data
 * Prevents tampering with enrollment IDs in localStorage
 */
export function generateEnrollmentSignature(enrollmentId: number, roomId: number): string {
  const data = `${enrollmentId}:${roomId}`;
  return createHmac('sha256', config.jwt.secret)
    .update(data)
    .digest('hex');
}

/**
 * Validate HMAC signature for enrollment data
 */
export function validateEnrollmentSignature(
  enrollmentId: number,
  roomId: number,
  signature: string
): boolean {
  const expectedSignature = generateEnrollmentSignature(enrollmentId, roomId);
  return signature === expectedSignature;
}

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

export class DuplicateEnrollmentError extends Error {
  constructor(roomCode: string, email: string) {
    super(`Email ${email} is already enrolled in room ${roomCode}`);
    this.name = 'DuplicateEnrollmentError';
  }
}

export class RoomNotJoinableError extends Error {
  constructor(roomCode: string, status: Room['status']) {
    const messageByStatus: Record<Room['status'], string> = {
      created: 'This room is not live yet. Wait for the instructor to start the session.',
      activated: `Room ${roomCode} is joinable.`,
      closed: 'This room has already been closed by the instructor.'
    };

    super(messageByStatus[status] || 'This room is not accepting new joins right now.');
    this.name = 'RoomNotJoinableError';
  }
}

export class AttemptAlreadyCompletedError extends Error {
  constructor(roomCode: string, email: string) {
    super(
      `The exam for ${email} in room ${roomCode} has already been completed. Ask the instructor for a new room if you need another attempt.`
    );
    this.name = 'AttemptAlreadyCompletedError';
  }
}

export class RoomFullError extends Error {
  constructor(roomCode: string, current: number, capacity: number) {
    super(`Room ${roomCode} is full (${current}/${capacity} students)`);
    this.name = 'RoomFullError';
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
  capacity?: number;
}

export interface ActiveRoomSummary {
  id: number;
  exam_id: number;
  room_code: string;
  exam_name: string;
  course_name: string;
  student_count: number;
  capacity: number;
  duration_minutes: number;
  created_at: Date;
  activated_at: Date | null;
}

export interface RoomMonitoringStudentSummary {
  enrollmentId: number;
  roomId: number;
  attemptId: number | null;
  userId: number | null;
  studentName: string;
  studentEmail: string;
  status: 'not_started' | 'in_progress' | 'submitted' | 'terminated';
  startedAt: Date | null;
  submittedAt: Date | null;
  ipAddress: string | null;
  warningCount: number;
  totalViolationCount: number;
}

// ============================================================================
// ProctoringRoomService
// ============================================================================

export class ProctoringRoomService {
  constructor(private pg: Pool) {}

  private async findExistingOpenRoom(examId: number, teacherId: number): Promise<Room | null> {
    const result = await this.pg.query<Room>(
      `SELECT *
       FROM proctoring_rooms
       WHERE exam_id = $1
       AND teacher_id = $2
       AND status IN ('created', 'activated')
       ORDER BY
         CASE status
           WHEN 'activated' THEN 0
           ELSE 1
         END,
         created_at DESC
       LIMIT 1`,
      [examId, teacherId]
    );

    return result.rows[0] ?? null;
  }

  /**
   * Generate a random 8-character uppercase invite code
   * Uses digits plus uppercase letters to keep the code easy to type and read
   * Uses cryptographically secure random bytes
   */
  private generateRoomCode(): string {
    const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    // Generate 8 random bytes and convert to a human-friendly uppercase code
    const bytes = randomBytes(8);
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(bytes[i] % chars.length);
    }
    return code;
  }

  /**
   * Create a new proctoring room for an exam
   * Validates: exam exists, teacher enrolled, capacity not exceeded
   * Generates: unique room code (retries 3x on collision)
   */
  async createRoom(params: CreateRoomParams): Promise<Room> {
    const { examId, teacherId, capacity: requestedCapacity } = params;

    // 1. Validate exam exists
    const examResult = await this.pg.query(
      'SELECT id, exam_name, room_capacity FROM exams WHERE id = $1',
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

    // Reuse an existing open room for the same teacher/exam instead of failing on
    // the database uniqueness guard. This keeps "Create room" idempotent in the UI.
    const existingOpenRoom = await this.findExistingOpenRoom(examId, teacherId);
    if (existingOpenRoom) {
      return existingOpenRoom;
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
    const examCapacity = Number(examResult.rows[0].room_capacity) || 15;
    const capacity = Math.max(1, Math.min(requestedCapacity || examCapacity, 100));

    if (enrolledCount >= capacity) {
      throw new CapacityExceededError(enrolledCount, capacity);
    }

    // 4. Generate unique room code (retry 3x on collision)
    let roomCode: string = '';
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      roomCode = this.generateRoomCode();

      // Check if code already exists
      const existingResult = await this.pg.query(
        'SELECT id FROM proctoring_rooms WHERE UPPER(room_code) = UPPER($1)',
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
    try {
      const insertResult = await this.pg.query<Room>(
        `INSERT INTO proctoring_rooms (exam_id, teacher_id, room_code, status, capacity)
         VALUES ($1, $2, $3, 'created', $4)
         RETURNING *`,
        [examId, teacherId, roomCode, capacity]
      );

      return insertResult.rows[0];
    } catch (error: any) {
      if (error.code === '23505') {
        const racedRoom = await this.findExistingOpenRoom(examId, teacherId);
        if (racedRoom) {
          return racedRoom;
        }
      }

      throw error;
    }
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
       WHERE UPPER(pr.room_code) = UPPER($1)`,
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
         pr.exam_id,
         pr.room_code,
         e.exam_name,
         e.course_name,
         e.duration_minutes,
         pr.capacity,
         pr.created_at,
         pr.activated_at,
         COUNT(DISTINCT prs.id) as student_count
       FROM proctoring_rooms pr
       JOIN exams e ON pr.exam_id = e.id
       LEFT JOIN proctoring_room_students prs ON prs.room_id = pr.id
       WHERE pr.teacher_id = $1
       AND pr.status = 'activated'
       GROUP BY pr.id, e.exam_name, e.course_name, e.duration_minutes, pr.created_at, pr.activated_at
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
    if (room.status === 'activated') {
      return room;
    }

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

  async deleteRoom(roomId: number, teacherId: number): Promise<void> {
    const roomResult = await this.pg.query<Room>(
      'SELECT * FROM proctoring_rooms WHERE id = $1',
      [roomId]
    );

    if (roomResult.rows.length === 0) {
      throw new RoomNotFoundError(roomId.toString());
    }

    const room = roomResult.rows[0];

    if (room.teacher_id !== teacherId) {
      throw new NotRoomOwnerError(roomId, teacherId);
    }

    await this.pg.query('DELETE FROM proctoring_rooms WHERE id = $1', [roomId]);
  }

  async getMonitoringStudents(
    roomId: number,
    teacherId: number
  ): Promise<RoomMonitoringStudentSummary[]> {
    const roomResult = await this.pg.query<Room>(
      'SELECT * FROM proctoring_rooms WHERE id = $1',
      [roomId]
    );

    if (roomResult.rows.length === 0) {
      throw new RoomNotFoundError(roomId.toString());
    }

    const room = roomResult.rows[0];

    if (room.teacher_id !== teacherId) {
      throw new NotRoomOwnerError(roomId, teacherId);
    }

    const result = await this.pg.query<RoomMonitoringStudentSummary>(
      `SELECT
         prs.id as "enrollmentId",
         prs.room_id as "roomId",
         prs.attempt_id as "attemptId",
         u.id as "userId",
         prs.student_name as "studentName",
         prs.student_email as "studentEmail",
         COALESCE(ea.status, 'not_started') as status,
         ea.started_at as "startedAt",
         ea.submitted_at as "submittedAt",
         ea.ip_address as "ipAddress",
         COALESCE(vc.warning_count, ea.violation_count, 0) as "warningCount",
         COALESCE(vc.total_count, 0) as "totalViolationCount"
       FROM proctoring_room_students prs
       LEFT JOIN users u ON LOWER(u.email) = LOWER(prs.student_email)
       LEFT JOIN exam_attempts ea ON ea.id = prs.attempt_id
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*) FILTER (WHERE v.severity = 'warning')::int as warning_count,
           COUNT(*)::int as total_count
         FROM violations v
         WHERE v.attempt_id = prs.attempt_id
         AND (v.room_id = prs.room_id OR v.room_id IS NULL)
       ) vc ON TRUE
       WHERE prs.room_id = $1
       ORDER BY
         COALESCE(vc.warning_count, ea.violation_count, 0) DESC,
         COALESCE(ea.started_at, prs.joined_at) DESC,
         prs.student_name ASC`,
      [roomId]
    );

    return result.rows;
  }

  /**
   * Get or create user by email (for student self-enrollment)
   * Returns user record that can be used for exam attempts
   *
   * Phase 1.2: Student enrollment helper
   * Uses UPSERT to handle race condition atomically
   */
  async getOrCreateUserByEmail(email: string, name: string): Promise<{ id: number }> {
    // Sanitize inputs to prevent XSS
    const sanitizedEmail = sanitizeInput(email.toLowerCase().trim());
    const sanitizedName = sanitizeInput(name.trim());
    const existingUserResult = await this.pg.query<{ id: number }>(
      'SELECT id FROM users WHERE email = $1',
      [sanitizedEmail]
    );

    if (existingUserResult.rows.length > 0) {
      return { id: existingUserResult.rows[0].id };
    }

    const username = createSyntheticStudentUsername(sanitizedEmail);

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const result = await this.pg.query<{ id: number }>(
          `INSERT INTO users (moodle_user_id, username, email, first_name, last_name, role)
           VALUES ($1, $2, $3, $4, $5, 'student')
           RETURNING id`,
          [createSyntheticMoodleUserId(), username, sanitizedEmail, sanitizedName, '']
        );

        if (result.rows.length > 0) {
          return { id: result.rows[0].id };
        }
      } catch (error: any) {
        if (error.code === '23505') {
          const raceConditionResult = await this.pg.query<{ id: number }>(
            'SELECT id FROM users WHERE email = $1',
            [sanitizedEmail]
          );

          if (raceConditionResult.rows.length > 0) {
            return { id: raceConditionResult.rows[0].id };
          }

          continue;
        }

        throw error;
      }
    }

    throw new Error(`Failed to create or retrieve user for email: ${sanitizedEmail}`);
  }

  /**
   * Get current student count for a room
   * Used for capacity enforcement before enrollment
   *
   * Phase 1.4: Room capacity checking
   */
  async getStudentCount(roomId: number): Promise<number> {
    const result = await this.pg.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM proctoring_room_students WHERE room_id = $1',
      [roomId]
    );

    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Enroll a student in a room
   * Validates: room exists, not full, not already enrolled
   * Creates: enrollment record in proctoring_room_students
   *
   * Uses atomic INSERT with capacity check to prevent race conditions
   *
   * Phase 1.4: Student enrollment logic
   */
  async enrollStudent(params: {
    roomId: number;
    userId: number;
    studentName: string;
    studentEmail: string;
  }): Promise<{ id: number; alreadyEnrolled?: boolean }> {
    const { roomId, studentName, studentEmail } = params;

    // Sanitize inputs to prevent XSS
    const sanitizedName = sanitizeInput(studentName.trim());
    const sanitizedEmail = sanitizeInput(studentEmail.toLowerCase().trim());

    // 1. Get room details (for error messages)
    const roomResult = await this.pg.query<Room>(
      'SELECT * FROM proctoring_rooms WHERE id = $1',
      [roomId]
    );

    if (roomResult.rows.length === 0) {
      throw new RoomNotFoundError(roomId.toString());
    }

    const room = roomResult.rows[0];

    if (room.status !== 'activated') {
      throw new RoomNotJoinableError(room.room_code, room.status);
    }

    // If the student already joined this room, return the existing enrollment so reconnects work.
    const existingEnrollmentResult = await this.pg.query<{
      id: number;
      attemptId: number | null;
      attemptStatus: string | null;
    }>(
      `SELECT
         prs.id,
         prs.attempt_id as "attemptId",
         ea.status as "attemptStatus"
       FROM proctoring_room_students prs
       LEFT JOIN exam_attempts ea ON ea.id = prs.attempt_id
       WHERE prs.room_id = $1
       AND LOWER(prs.student_email) = LOWER($2)
       LIMIT 1`,
      [roomId, sanitizedEmail]
    );

    if (existingEnrollmentResult.rows.length > 0) {
      const existingEnrollment = existingEnrollmentResult.rows[0];

      if (
        existingEnrollment.attemptId &&
        ['submitted', 'terminated'].includes(existingEnrollment.attemptStatus || '')
      ) {
        throw new AttemptAlreadyCompletedError(room.room_code, sanitizedEmail);
      }

      return {
        id: existingEnrollment.id,
        alreadyEnrolled: true
      };
    }

    // 2. Atomic INSERT with capacity check (prevents TOCTOU race condition)
    // The subquery ensures capacity is checked at insert time, not before
    try {
      const insertResult = await this.pg.query(
        `INSERT INTO proctoring_room_students (room_id, student_name, student_email)
         SELECT $1, $2, $3
         WHERE (SELECT COUNT(*) FROM proctoring_room_students WHERE room_id = $1) < (
           SELECT capacity FROM proctoring_rooms WHERE id = $1
         )
         RETURNING id`,
        [roomId, sanitizedName, sanitizedEmail]
      );

      // If no rows returned, capacity was exceeded
      if (insertResult.rows.length === 0) {
        const currentCount = await this.getStudentCount(roomId);
        throw new RoomFullError(room.room_code, currentCount, room.capacity);
      }

      return { id: insertResult.rows[0].id };
    } catch (error: any) {
      if (error.code === '23505') {
        const duplicateEnrollmentResult = await this.pg.query<{ id: number }>(
          `SELECT id
           FROM proctoring_room_students
           WHERE room_id = $1
           AND LOWER(student_email) = LOWER($2)
           LIMIT 1`,
          [roomId, sanitizedEmail]
        );

        if (duplicateEnrollmentResult.rows.length > 0) {
          return {
            id: duplicateEnrollmentResult.rows[0].id,
            alreadyEnrolled: true
          };
        }

        throw new DuplicateEnrollmentError(room.room_code, sanitizedEmail);
      }

      // Re-throw RoomFullError and other errors
      throw error;
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createProctoringRoomService(pg: Pool): ProctoringRoomService {
  return new ProctoringRoomService(pg);
}
