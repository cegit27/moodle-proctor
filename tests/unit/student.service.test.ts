/**
 * @file tests/unit/student.service.test.ts
 * @description Unit tests for Student Service
 */

import { StudentService } from '../../backend/src/modules/student/student.service';
import { Pool } from 'pg';

jest.mock('pg');

describe('StudentService', () => {
  let studentService: StudentService;
  let mockPool: jest.Mocked<Pool>;

  beforeEach(() => {
    mockPool = {
      query: jest.fn()
    } as any;

    studentService = new StudentService(mockPool);
    jest.clearAllMocks();
  });

  describe('getStudentProfile()', () => {
    it('should return full student profile with attempts', async () => {
      const userId = 1;

      const mockProfileRow = {
        id: 1,
        moodle_user_id: 101,
        username: 'student1',
        email: 'student1@example.com',
        first_name: 'John',
        last_name: 'Doe',
        role: 'student',
        profile_image_url: 'http://example.com/pic.jpg',
        created_at: new Date(),
        last_login_at: new Date()
      };

      const mockActiveAttempt = {
        id: 100,
        exam_id: 1,
        exam_name: 'Midterm',
        course_name: 'Math 101',
        status: 'in_progress',
        started_at: new Date(),
        submitted_at: null,
        violation_count: 2,
        duration_minutes: 120,
        max_warnings: 3
      };

      const mockRecentAttempts = [
        {
          id: 99,
          exam_id: 1,
          exam_name: 'Quiz 1',
          course_name: 'Math 101',
          status: 'submitted',
          started_at: new Date(),
          submitted_at: new Date(),
          violation_count: 0,
          duration_minutes: 30,
          max_warnings: 3
        }
      ];

      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockProfileRow] })
        .mockResolvedValueOnce({ rows: [mockActiveAttempt] })
        .mockResolvedValueOnce({ rows: mockRecentAttempts });

      const result = await studentService.getStudentProfile(userId);

      expect(result).toHaveProperty('success', true);
      expect(result.data).toHaveProperty('student');
      expect(result.data).toHaveProperty('activeAttempt');
      expect(result.data).toHaveProperty('recentAttempts');
      expect(result.data.activeAttempt?.status).toBe('in_progress');
    });

    it('should return null active attempt when none in progress', async () => {
      const userId = 1;

      const mockProfileRow = {
        id: 1,
        moodle_user_id: 101,
        username: 'student1',
        email: 'student1@example.com',
        first_name: 'John',
        last_name: 'Doe',
        role: 'student',
        profile_image_url: 'http://example.com/pic.jpg',
        created_at: new Date(),
        last_login_at: new Date()
      };

      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockProfileRow] })
        .mockResolvedValueOnce({ rows: [] }) // No active attempt
        .mockResolvedValueOnce({ rows: [] }); // No recent attempts

      const result = await studentService.getStudentProfile(userId);

      expect(result.data.activeAttempt).toBeNull();
      expect(result.data.recentAttempts).toHaveLength(0);
    });

    it('should throw error when student not found', async () => {
      const userId = 999;

      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

      await expect(studentService.getStudentProfile(userId))
        .rejects
        .toThrow('Student not found');
    });
  });

  describe('validateSession()', () => {
    it('should validate proctoring session successfully', async () => {
      const sessionId = 'session-123';
      const attemptId = 100;
      const userId = 1;

      const mockAttempt = { id: 100 };
      const mockSession = {
        id: 'session-123',
        attempt_id: 100,
        session_start: new Date(),
        frames_processed: 1500,
        ai_service_connected: true
      };

      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockAttempt] })
        .mockResolvedValueOnce({ rows: [mockSession] });

      const result = await studentService.validateSession(sessionId, attemptId, userId);

      expect(result).toHaveProperty('success', true);
      expect(result.data.valid).toBe(true);
      expect(result.data.session).toHaveProperty('id', 'session-123');
    });

    it('should return invalid when attempt not found', async () => {
      const sessionId = 'session-123';
      const attemptId = 999;
      const userId = 1;

      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] });

      const result = await studentService.validateSession(sessionId, attemptId, userId);

      expect(result.data.valid).toBe(false);
      expect(result.data.session).toBeNull();
    });

    it('should return null session when not found but attempt valid', async () => {
      const sessionId = 'session-123';
      const attemptId = 100;
      const userId = 1;

      const mockAttempt = { id: 100 };

      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockAttempt] })
        .mockResolvedValueOnce({ rows: [] }); // No session

      const result = await studentService.validateSession(sessionId, attemptId, userId);

      expect(result.data.valid).toBe(true);
      expect(result.data.session).toBeNull();
    });
  });

  describe('canStartExam()', () => {
    it('should allow exam start for eligible student', async () => {
      const userId = 1;
      const examId = 1;

      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // Enrollment check
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }); // No active attempt

      const result = await studentService.canStartExam(userId, examId);

      expect(result).toHaveProperty('allowed', true);
    });

    it('should reject when student not enrolled', async () => {
      const userId = 1;
      const examId = 1;

      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await studentService.canStartExam(userId, examId);

      expect(result).toHaveProperty('allowed', false);
      expect(result).toHaveProperty('reason', 'Not enrolled in this course');
    });

    it('should reject when exam already in progress', async () => {
      const userId = 1;
      const examId = 1;

      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const result = await studentService.canStartExam(userId, examId);

      expect(result).toHaveProperty('allowed', false);
      expect(result).toHaveProperty('reason', 'Exam already in progress');
    });
  });

  describe('recordSubmission()', () => {
    it('should record exam submission successfully', async () => {
      const userId = 1;
      const attemptId = 100;
      const answers = [{ questionId: 1, answer: 'A' }];

      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ id: 100 }] });

      const result = await studentService.recordSubmission(userId, attemptId, answers);

      expect(result).toHaveProperty('success', true);
    });
  });

  describe('getAttemptHistory()', () => {
    it('should return all attempts for student', async () => {
      const userId = 1;

      const mockAttempts = [
        { id: 100, exam_name: 'Midterm', status: 'submitted', submitted_at: new Date() },
        { id: 99, exam_name: 'Quiz 1', status: 'submitted', submitted_at: new Date() }
      ];

      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: mockAttempts });

      const result = await studentService.getAttemptHistory(userId);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('id', 100);
    });
  });

  describe('getAttemptDetails()', () => {
    it('should return detailed attempt information', async () => {
      const userId = 1;
      const attemptId = 100;

      const mockAttempt = {
        id: 100,
        user_id: 1,
        exam_id: 1,
        exam_name: 'Midterm',
        status: 'submitted',
        started_at: new Date(),
        submitted_at: new Date(),
        violation_count: 2,
        duration_minutes: 120
      };

      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockAttempt] });

      const result = await studentService.getAttemptDetails(userId, attemptId);

      expect(result).toHaveProperty('id', 100);
      expect(result).toHaveProperty('violationCount', 2);
    });

    it('should throw error for invalid attempt', async () => {
      const userId = 1;
      const attemptId = 999;

      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] });

      await expect(studentService.getAttemptDetails(userId, attemptId))
        .rejects
        .toThrow();
    });
  });

  describe('updateLastActivity()', () => {
    it('should update student last activity timestamp', async () => {
      const userId = 1;
      const attemptId = 100;

      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ id: 100 }] });

      const result = await studentService.updateLastActivity(userId, attemptId);

      expect(result).toBe(true);
    });
  });
});
