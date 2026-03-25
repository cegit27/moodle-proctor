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
  NotRoomOwnerError
} from '../room.service';

// Mock Pool
const mockPool = {
  query: jest.fn()
} as unknown as Pool;

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
      (mockPool as any).query = jest.fn()
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
      (mockPool as any).query = jest.fn()
        .mockResolvedValueOnce({ rows: [] }); // Exam check fails

      await expect(roomService.createRoom({ examId: 999, teacherId: 1 }))
        .rejects.toThrow(ExamNotFoundError);
    });

    it('should throw NotEnrolledError when teacher not found', async () => {
      (mockPool as any).query = jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: 1, exam_name: 'CS101' }] }) // Exam exists
        .mockResolvedValueOnce({ rows: [] }); // Teacher check fails

      await expect(roomService.createRoom({ examId: 1, teacherId: 999 }))
        .rejects.toThrow(NotEnrolledError);
    });

    it('should throw CapacityExceededError when exam has too many students', async () => {
      (mockPool as any).query = jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: 1, exam_name: 'CS101' }] }) // Exam exists
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Teacher exists
        .mockResolvedValueOnce({ rows: [{ count: '20' }] }); // Capacity exceeded (20 > 15)

      await expect(roomService.createRoom({ examId: 1, teacherId: 1 }))
        .rejects.toThrow(CapacityExceededError);
    });

    it('should retry room code generation on collision', async () => {
      (mockPool as any).query = jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: 1, exam_name: 'CS101' }] }) // Exam exists
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Teacher exists
        .mockResolvedValueOnce({ rows: [{ count: '5' }] }); // Capacity OK

      // First code collides, second code succeeds
      (mockPool as any).query = jest.fn()
        .mockResolvedValueOnce({ rows: [{ count: '5' }] }) // Capacity check
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Code 1 exists (collision)
        .mockResolvedValueOnce({ rows: [] }) // Code 2 is unique
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
      (mockPool as any).query = jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: 1, exam_name: 'CS101' }] }) // Exam exists
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Teacher exists
        .mockResolvedValueOnce({ rows: [{ count: '5' }] }); // Capacity OK

      // All 3 codes collide
      (mockPool as any).query = jest.fn()
        .mockImplementation((query: string) => {
          if (query.includes('SELECT id FROM proctoring_rooms')) {
            return Promise.resolve({ rows: [{ id: 1 }] }); // Always collides
          }
          return Promise.resolve({ rows: [] });
        });

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

      (mockPool as any).query = jest.fn()
        .mockResolvedValueOnce({ rows: [mockRoom] });

      const result = await roomService.getRoomByCode('xY7kPq2M');

      expect(result.id).toBe(1);
      expect(result.exam_name).toBe('CS101 Midterm');
      expect(result.course_name).toBe('Computer Science 101');
    });

    it('should throw RoomNotFoundError when code does not exist', async () => {
      (mockPool as any).query = jest.fn()
        .mockResolvedValueOnce({ rows: [] });

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

      (mockPool as any).query = jest.fn()
        .mockResolvedValueOnce({ rows: mockRooms });

      const result = await roomService.getActiveRooms(1);

      expect(result).toHaveLength(2);
      expect(result[0].exam_name).toBe('CS101 Midterm');
      expect(result[1].exam_name).toBe('MATH201 Quiz');
    });

    it('should return empty array for teacher with no active rooms', async () => {
      (mockPool as any).query = jest.fn()
        .mockResolvedValueOnce({ rows: [] });

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

      (mockPool as any).query = jest.fn()
        .mockResolvedValueOnce({ rows: [mockRoom] }) // Get room
        .mockResolvedValueOnce({ rows: [mockActivatedRoom] }); // Update room

      const result = await roomService.activateRoom(1, 1);

      expect(result.status).toBe('activated');
      expect(result.activated_at).not.toBeNull();
    });

    it('should throw RoomNotFoundError when room does not exist', async () => {
      (mockPool as any).query = jest.fn()
        .mockResolvedValueOnce({ rows: [] }); // Room not found

      await expect(roomService.activateRoom(999, 1))
        .rejects.toThrow(RoomNotFoundError);
    });

    it('should throw NotRoomOwnerError when teacher is not owner', async () => {
      const mockRoom = {
        id: 1,
        teacher_id: 2, // Different teacher
        status: 'created'
      };

      (mockPool as any).query = jest.fn()
        .mockResolvedValueOnce({ rows: [mockRoom] });

      await expect(roomService.activateRoom(1, 1))
        .rejects.toThrow(NotRoomOwnerError);
    });

    it('should throw InvalidStateTransitionError when status is not created', async () => {
      const mockRoom = {
        id: 1,
        teacher_id: 1,
        status: 'activated' // Already activated
      };

      (mockPool as any).query = jest.fn()
        .mockResolvedValueOnce({ rows: [mockRoom] });

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

      (mockPool as any).query = jest.fn()
        .mockResolvedValueOnce({ rows: [mockRoom] }) // Get room
        .mockResolvedValueOnce({ rows: [mockClosedRoom] }); // Update room

      const result = await roomService.closeRoom(1, 1);

      expect(result.status).toBe('closed');
      expect(result.closed_at).not.toBeNull();
    });

    it('should throw RoomNotFoundError when room does not exist', async () => {
      (mockPool as any).query = jest.fn()
        .mockResolvedValueOnce({ rows: [] });

      await expect(roomService.closeRoom(999, 1))
        .rejects.toThrow(RoomNotFoundError);
    });

    it('should throw NotRoomOwnerError when teacher is not owner', async () => {
      const mockRoom = {
        id: 1,
        teacher_id: 2, // Different teacher
        status: 'activated'
      };

      (mockPool as any).query = jest.fn()
        .mockResolvedValueOnce({ rows: [mockRoom] });

      await expect(roomService.closeRoom(1, 1))
        .rejects.toThrow(NotRoomOwnerError);
    });

    it('should throw InvalidStateTransitionError when status is not activated', async () => {
      const mockRoom = {
        id: 1,
        teacher_id: 1,
        status: 'created' // Not activated yet
      };

      (mockPool as any).query = jest.fn()
        .mockResolvedValueOnce({ rows: [mockRoom] });

      await expect(roomService.closeRoom(1, 1))
        .rejects.toThrow(InvalidStateTransitionError);
    });
  });
});
