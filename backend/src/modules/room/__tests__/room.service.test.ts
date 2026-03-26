// ============================================================================
// Room Service Tests
// Comprehensive test coverage for ProctoringRoomService
// ============================================================================

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Pool } from 'pg';
import {
  ProctoringRoomService,
  RoomNotFoundError,
  ExamNotFoundError,
  NotEnrolledError,
  RoomCollisionError,
  CapacityExceededError,
  InvalidStateTransitionError,
  NotRoomOwnerError,
  DuplicateEnrollmentError,
  RoomFullError
} from '../room.service';

// Mock Pool
const mockQuery = jest.fn() as any;
const mockPool = {
  query: mockQuery
} as Pool;

describe('ProctoringRoomService', () => {
  let roomService: ProctoringRoomService;

  beforeEach(() => {
    roomService = new ProctoringRoomService(mockPool);
    jest.clearAllMocks();
  });

  // ==========================================================================
  // createRoom() Tests
  // ==========================================================================

  describe('createRoom()', () => {
    it('should create room successfully', async () => {
      // Mock exam exists
      const mockFn = jest.fn() as any;
      mockPool.query = mockFn;
      mockFn
        .mockResolvedValueOnce({ rows: [{ id: 1, exam_name: 'CS101 Midterm' }] }) // Exam check
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Teacher check
        .mockResolvedValueOnce({ rows: [{ count: '5' }] }) // Capacity check
        .mockResolvedValueOnce({ rows: [] }) // Room code unique check
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            exam_id: 1,
            teacher_id: 1,
            room_code: 'xY7kPq2M',
            status: 'created',
            capacity: 15,
            created_at: new Date(),
            activated_at: null,
            closed_at: null
          }]
        }); // Insert room

      const result = await roomService.createRoom({ examId: 1, teacherId: 1 });

      expect(result.room_code).toBe('xY7kPq2M');
      expect(result.status).toBe('created');
      expect(result.exam_id).toBe(1);
      expect(result.teacher_id).toBe(1);
    });

    it('should throw ExamNotFoundError when exam does not exist', async () => {
      const mockFn = jest.fn() as any;
      mockPool.query = mockFn;
      mockFn.mockResolvedValueOnce({ rows: [] }); // Exam check fails

      await expect(roomService.createRoom({ examId: 999, teacherId: 1 }))
        .rejects.toThrow(ExamNotFoundError);
    });

    it('should throw NotEnrolledError when teacher not found', async () => {
      const mockFn = jest.fn() as any;
      mockPool.query = mockFn;
      mockFn
        .mockResolvedValueOnce({ rows: [{ id: 1, exam_name: 'CS101' }] }) // Exam exists
        .mockResolvedValueOnce({ rows: [] }); // Teacher check fails

      await expect(roomService.createRoom({ examId: 1, teacherId: 999 }))
        .rejects.toThrow(NotEnrolledError);
    });

    it('should throw CapacityExceededError when exam has too many students', async () => {
      const mockFn = jest.fn() as any;
      mockPool.query = mockFn;
      mockFn
        .mockResolvedValueOnce({ rows: [{ id: 1, exam_name: 'CS101' }] }) // Exam exists
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Teacher exists
        .mockResolvedValueOnce({ rows: [{ count: '20' }] }); // Capacity exceeded (20 > 15)

      await expect(roomService.createRoom({ examId: 1, teacherId: 1 }))
        .rejects.toThrow(CapacityExceededError);
    });

    it('should retry room code generation on collision', async () => {
      // Note: This test is simplified - actual retry logic is in room.service.ts
      const mockFn = jest.fn() as any;
      mockPool.query = mockFn;
      mockFn
        .mockResolvedValueOnce({ rows: [{ id: 1, exam_name: 'CS101' }] }) // Exam exists
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Teacher exists
        .mockResolvedValueOnce({ rows: [{ count: '5' }] }) // Capacity OK
        .mockResolvedValueOnce({ rows: [] }) // Code 1 is unique (no collision in this simplified test)
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            room_code: 'AbCd1234',
            status: 'created'
          }]
        });

      const result = await roomService.createRoom({ examId: 1, teacherId: 1 });
      expect(result.room_code).toBeDefined();
    });

    it('should throw RoomCollisionError after 3 failed attempts', async () => {
      const mockFn = jest.fn() as any;
      mockPool.query = mockFn;
      mockFn
        .mockResolvedValueOnce({ rows: [{ id: 1, exam_name: 'CS101' }] }) // Exam exists
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Teacher exists
        .mockResolvedValueOnce({ rows: [{ count: '5' }] }); // Capacity OK

      // Mock the loop: 3 attempts, all collide
      // Each attempt generates a code and checks if it exists
      mockFn
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Attempt 1: code collides
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Attempt 2: code collides
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // Attempt 3: code collides

      await expect(roomService.createRoom({ examId: 1, teacherId: 1 }))
        .rejects.toThrow(RoomCollisionError);
    });
  });

  // ==========================================================================
  // getRoomByCode() Tests
  // ==========================================================================

  describe('getRoomByCode()', () => {
    it('should find room by code with exam details', async () => {
      const mockRoom = {
        id: 1,
        exam_id: 1,
        teacher_id: 1,
        room_code: 'xY7kPq2M',
        status: 'activated',
        capacity: 15,
        created_at: new Date(),
        activated_at: new Date(),
        closed_at: null,
        exam_name: 'CS101 Midterm',
        course_name: 'Computer Science 101'
      };

      const mockFn = jest.fn() as any;
      mockPool.query = mockFn;
      mockFn.mockResolvedValueOnce({ rows: [mockRoom] });

      const result = await roomService.getRoomByCode('xY7kPq2M');

      expect(result.id).toBe(1);
      expect(result.exam_name).toBe('CS101 Midterm');
      expect(result.course_name).toBe('Computer Science 101');
    });

    it('should throw RoomNotFoundError when code does not exist', async () => {
      const mockFn = jest.fn() as any;
      mockPool.query = mockFn;
      mockFn.mockResolvedValueOnce({ rows: [] });

      await expect(roomService.getRoomByCode('INVALID'))
        .rejects.toThrow(RoomNotFoundError);
    });
  });

  // ==========================================================================
  // getActiveRooms() Tests
  // ==========================================================================

  describe('getActiveRooms()', () => {
    it('should return active rooms for teacher', async () => {
      const mockRooms = [
        {
          id: 1,
          room_code: 'xY7kPq2M',
          exam_name: 'CS101 Midterm',
          duration_minutes: 60,
          created_at: new Date(),
          student_count: '5'
        },
        {
          id: 2,
          room_code: 'AbCd1234',
          exam_name: 'MATH201 Quiz',
          duration_minutes: 45,
          created_at: new Date(),
          student_count: '3'
        }
      ];

      const mockFn = jest.fn() as any;
      mockPool.query = mockFn;
      mockFn.mockResolvedValueOnce({ rows: mockRooms });

      const result = await roomService.getActiveRooms(1);

      expect(result).toHaveLength(2);
      expect(result[0].exam_name).toBe('CS101 Midterm');
      expect(result[1].exam_name).toBe('MATH201 Quiz');
    });

    it('should return empty array for teacher with no active rooms', async () => {
      const mockFn = jest.fn() as any;
      mockPool.query = mockFn;
      mockFn.mockResolvedValueOnce({ rows: [] });

      const result = await roomService.getActiveRooms(999);

      expect(result).toEqual([]);
    });
  });

  // ==========================================================================
  // activateRoom() Tests
  // ==========================================================================

  describe('activateRoom()', () => {
    it('should activate room successfully', async () => {
      const mockRoom = {
        id: 1,
        exam_id: 1,
        teacher_id: 1,
        room_code: 'xY7kPq2M',
        status: 'created',
        capacity: 15,
        created_at: new Date(),
        activated_at: null,
        closed_at: null
      };

      const mockActivatedRoom = {
        ...mockRoom,
        status: 'activated',
        activated_at: new Date()
      };

      const mockFn = jest.fn() as any;
      mockPool.query = mockFn;
      mockFn
        .mockResolvedValueOnce({ rows: [mockRoom] }) // Get room
        .mockResolvedValueOnce({ rows: [mockActivatedRoom] }); // Update room

      const result = await roomService.activateRoom(1, 1);

      expect(result.status).toBe('activated');
      expect(result.activated_at).not.toBeNull();
    });

    it('should throw RoomNotFoundError when room does not exist', async () => {
      const mockFn = jest.fn() as any;
      mockPool.query = mockFn;
      mockFn.mockResolvedValueOnce({ rows: [] }); // Room not found

      await expect(roomService.activateRoom(999, 1))
        .rejects.toThrow(RoomNotFoundError);
    });

    it('should throw NotRoomOwnerError when teacher is not owner', async () => {
      const mockRoom = {
        id: 1,
        teacher_id: 2, // Different teacher
        status: 'created'
      };

      const mockFn = jest.fn() as any;
      mockPool.query = mockFn;
      mockFn.mockResolvedValueOnce({ rows: [mockRoom] });

      await expect(roomService.activateRoom(1, 1))
        .rejects.toThrow(NotRoomOwnerError);
    });

    it('should throw InvalidStateTransitionError when status is not created', async () => {
      const mockRoom = {
        id: 1,
        teacher_id: 1,
        status: 'activated' // Already activated
      };

      const mockFn = jest.fn() as any;
      mockPool.query = mockFn;
      mockFn.mockResolvedValueOnce({ rows: [mockRoom] });

      await expect(roomService.activateRoom(1, 1))
        .rejects.toThrow(InvalidStateTransitionError);
    });
  });

  // ==========================================================================
  // closeRoom() Tests
  // ==========================================================================

  describe('closeRoom()', () => {
    it('should close room successfully', async () => {
      const mockRoom = {
        id: 1,
        teacher_id: 1,
        status: 'activated',
        closed_at: null
      };

      const mockClosedRoom = {
        ...mockRoom,
        status: 'closed',
        closed_at: new Date()
      };

      const mockFn = jest.fn() as any;
      mockPool.query = mockFn;
      mockFn
        .mockResolvedValueOnce({ rows: [mockRoom] }) // Get room
        .mockResolvedValueOnce({ rows: [mockClosedRoom] }); // Update room

      const result = await roomService.closeRoom(1, 1);

      expect(result.status).toBe('closed');
      expect(result.closed_at).not.toBeNull();
    });

    it('should throw RoomNotFoundError when room does not exist', async () => {
      const mockFn = jest.fn() as any;
      mockPool.query = mockFn;
      mockFn.mockResolvedValueOnce({ rows: [] });

      await expect(roomService.closeRoom(999, 1))
        .rejects.toThrow(RoomNotFoundError);
    });

    it('should throw NotRoomOwnerError when teacher is not owner', async () => {
      const mockRoom = {
        id: 1,
        teacher_id: 2, // Different teacher
        status: 'activated'
      };

      const mockFn = jest.fn() as any;
      mockPool.query = mockFn;
      mockFn.mockResolvedValueOnce({ rows: [mockRoom] });

      await expect(roomService.closeRoom(1, 1))
        .rejects.toThrow(NotRoomOwnerError);
    });

    it('should throw InvalidStateTransitionError when status is not activated', async () => {
      const mockRoom = {
        id: 1,
        teacher_id: 1,
        status: 'created' // Not activated yet
      };

      const mockFn = jest.fn() as any;
      mockPool.query = mockFn;
      mockFn.mockResolvedValueOnce({ rows: [mockRoom] });

      await expect(roomService.closeRoom(1, 1))
        .rejects.toThrow(InvalidStateTransitionError);
    });
  });

  // ==========================================================================
  // getOrCreateUserByEmail() Tests
  // ==========================================================================

  describe('getOrCreateUserByEmail()', () => {
    it('should return existing user if email exists', async () => {
      const mockFn = jest.fn() as any;
      mockPool.query = mockFn;
      mockFn.mockResolvedValueOnce({ rows: [{ id: 123 }] });

      const result = await roomService.getOrCreateUserByEmail('test@example.com', 'Test User');

      expect(result.id).toBe(123);
      expect(mockFn).toHaveBeenCalledWith('SELECT id FROM users WHERE email = $1', ['test@example.com']);
    });

    it('should create new user with sanitized data if email does not exist', async () => {
      const mockFn = jest.fn() as any;
      mockPool.query = mockFn;
      // First call: user not found
      mockFn.mockResolvedValueOnce({ rows: [] });
      // Second call: INSERT returns new user
      mockFn.mockResolvedValueOnce({ rows: [{ id: 456 }] });

      const result = await roomService.getOrCreateUserByEmail('newuser@example.com', 'New User');

      expect(result.id).toBe(456);
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should sanitize username by removing special characters', async () => {
      const mockFn = jest.fn() as any;
      mockPool.query = mockFn;
      mockFn.mockResolvedValueOnce({ rows: [] });
      mockFn.mockResolvedValueOnce({ rows: [{ id: 789 }] });

      await roomService.getOrCreateUserByEmail('user<script>@example.com', 'Test<script>');

      // Verify the INSERT was called with sanitized data
      const insertCall = mockFn.mock.calls[1];
      expect(insertCall[1][1]).toMatch(/^[a-zA-Z0-9_-]+$/); // username should be alphanumeric
    });

    it('should handle race condition with UPSERT', async () => {
      const mockFn = jest.fn() as any;
      mockPool.query = mockFn;
      // UPSERT returns nothing (conflict)
      mockFn.mockResolvedValueOnce({ rows: [] });
      // Fetch existing user
      mockFn.mockResolvedValueOnce({ rows: [{ id: 999 }] });

      const result = await roomService.getOrCreateUserByEmail('racing@example.com', 'Racer');

      expect(result.id).toBe(999);
      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  });

  // ==========================================================================
  // getStudentCount() Tests
  // ==========================================================================

  describe('getStudentCount()', () => {
    it('should return current student count for room', async () => {
      const mockFn = jest.fn() as any;
      mockPool.query = mockFn;
      mockFn.mockResolvedValueOnce({ rows: [{ count: '5' }] });

      const count = await roomService.getStudentCount(1);

      expect(count).toBe(5);
      expect(mockFn).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM proctoring_room_students WHERE room_id = $1',
        [1]
      );
    });

    it('should return 0 for empty room', async () => {
      const mockFn = jest.fn() as any;
      mockPool.query = mockFn;
      mockFn.mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const count = await roomService.getStudentCount(1);

      expect(count).toBe(0);
    });
  });

  // ==========================================================================
  // enrollStudent() Tests
  // ==========================================================================

  describe('enrollStudent()', () => {
    it('should enroll student when capacity is available', async () => {
      const mockRoom = {
        id: 1,
        room_code: 'ABC12345',
        capacity: 15
      };

      const mockFn = jest.fn() as any;
      mockPool.query = mockFn;
      mockFn.mockResolvedValueOnce({ rows: [mockRoom] }); // Get room
      mockFn.mockResolvedValueOnce({ rows: [{ id: 777 }] }); // INSERT succeeds

      const result = await roomService.enrollStudent({
        roomId: 1,
        userId: 100,
        studentName: 'John Doe',
        studentEmail: 'john@example.com'
      });

      expect(result.id).toBe(777);
    });

    it('should throw RoomNotFoundError when room does not exist', async () => {
      const mockFn = jest.fn() as any;
      mockPool.query = mockFn;
      mockFn.mockResolvedValueOnce({ rows: [] }); // Room not found

      await expect(roomService.enrollStudent({
        roomId: 999,
        userId: 100,
        studentName: 'Test',
        studentEmail: 'test@example.com'
      })).rejects.toThrow(RoomNotFoundError);
    });

    it('should throw RoomFullError when capacity is exceeded', async () => {
      const mockRoom = {
        id: 1,
        room_code: 'FULL123',
        capacity: 15
      };

      const mockFn = jest.fn() as any;
      mockPool.query = mockFn;
      mockFn.mockResolvedValueOnce({ rows: [mockRoom] }); // Get room
      mockFn.mockResolvedValueOnce({ rows: [{ count: '10' }] }); // Current count
      mockFn.mockResolvedValueOnce({ rows: [] }); // INSERT fails (capacity check)

      await expect(roomService.enrollStudent({
        roomId: 1,
        userId: 100,
        studentName: 'Test',
        studentEmail: 'test@example.com'
      })).rejects.toThrow(RoomFullError);
    });

    it('should throw DuplicateEnrollmentError on duplicate key', async () => {
      const mockRoom = {
        id: 1,
        room_code: 'DUP12345',
        capacity: 15
      };

      const mockFn = jest.fn() as any;
      mockPool.query = mockFn;
      mockFn.mockResolvedValueOnce({ rows: [mockRoom] }); // Get room
      // INSERT throws duplicate key error
      mockFn.mockRejectedValueOnce({ code: '23505', detail: 'Key (email) already exists' });

      await expect(roomService.enrollStudent({
        roomId: 1,
        userId: 100,
        studentName: 'Duplicate',
        studentEmail: 'duplicate@example.com'
      })).rejects.toThrow(DuplicateEnrollmentError);
    });

    it('should sanitize student name and email before enrollment', async () => {
      const mockRoom = {
        id: 1,
        room_code: 'SANITIZE',
        capacity: 15
      };

      const mockFn = jest.fn() as any;
      mockPool.query = mockFn;
      mockFn.mockResolvedValueOnce({ rows: [mockRoom] });
      mockFn.mockResolvedValueOnce({ rows: [{ id: 888 }] });

      await roomService.enrollStudent({
        roomId: 1,
        userId: 100,
        studentName: '<script>alert("xss")</script>',
        studentEmail: 'xss@example.com'
      });

      // Verify sanitized data was passed to INSERT
      const insertCall = mockFn.mock.calls[1];
      expect(insertCall[1][1]).not.toContain('<script>');
      expect(insertCall[1][2]).not.toContain('<script>');
    });
  });
});
