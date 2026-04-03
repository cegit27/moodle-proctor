/**
 * @file tests/unit/exam.service.test.ts
 * @description Unit tests for Exam Service
 */

import { ExamService } from '../../backend/src/modules/exam/exam.service';
import { Pool } from 'pg';

// Mock pg Pool
jest.mock('pg');

describe('ExamService', () => {
  let examService: ExamService;
  let mockPool: jest.Mocked<Pool>;
  let mockClient: any;

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
      connect: jest.fn()
    } as any;

    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };

    (mockPool.connect as jest.Mock).mockResolvedValue(mockClient);

    examService = new ExamService(mockPool);
    jest.clearAllMocks();
  });

  describe('getExamDetails()', () => {
    it('should return exam details for valid exam ID', async () => {
      const examId = 1;
      const userId = 1;

      const mockExamRow = {
        id: 1,
        moodle_course_id: 1001,
        moodle_course_module_id: 2001,
        exam_name: 'Midterm Exam',
        course_name: 'Advanced Mathematics',
        duration_minutes: 120,
        max_warnings: 3,
        question_paper_path: '/papers/exam1.pdf'
      };

      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockExamRow] }) // Exam query
        .mockResolvedValueOnce({ rows: [{ allowed: true, reason: null }] }) // Access check
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // Attempt count
        .mockResolvedValueOnce({ rows: [] }); // Active attempt check

      const result = await examService.getExamDetails(examId, userId);

      expect(result).toHaveProperty('success', true);
      expect(result.data).toHaveProperty('exam');
      expect(result.data.exam).toHaveProperty('id', 1);
      expect(result.data.exam).toHaveProperty('examName', 'Midterm Exam');
    });

    it('should throw error when exam not found', async () => {
      const examId = 999;
      const userId = 1;

      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

      await expect(examService.getExamDetails(examId, userId))
        .rejects
        .toThrow('Exam not found');
    });

    it('should return user access information', async () => {
      const examId = 1;
      const userId = 1;

      const mockExamRow = {
        id: 1,
        moodle_course_id: 1001,
        moodle_course_module_id: 2001,
        exam_name: 'Midterm Exam',
        course_name: 'Advanced Mathematics',
        duration_minutes: 120,
        max_warnings: 3,
        question_paper_path: '/papers/exam1.pdf'
      };

      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockExamRow] })
        .mockResolvedValueOnce({ rows: [{ allowed: true, reason: null }] })
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await examService.getExamDetails(examId, userId);

      expect(result.data.userAccess).toHaveProperty('canStart');
      expect(result.data.userAccess).toHaveProperty('hasActiveAttempt', false);
      expect(result.data.userAccess).toHaveProperty('attemptsRemaining', 1);
    });
  });

  describe('startExam()', () => {
    it('should start exam successfully for eligible student', async () => {
      const userId = 1;
      const examId = 1;

      const mockExamRow = {
        id: 1,
        moodle_course_id: 1001,
        moodle_course_module_id: 2001,
        exam_name: 'Midterm Exam',
        course_name: 'Advanced Mathematics',
        duration_minutes: 120,
        max_warnings: 3,
        question_paper_path: '/papers/exam1.pdf'
      };

      const mockAttemptRow = {
        id: 100,
        user_id: userId,
        exam_id: examId,
        status: 'in_progress',
        started_at: new Date(),
        submitted_at: null,
        violation_count: 0,
        ip_address: '192.168.1.1',
        user_agent: 'Mozilla/5.0'
      };

      // Mock canStartExam
      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ allowed: true, reason: null }] });

      // Mock getExamDetails
      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockExamRow] });

      // Mock transaction
      mockClient.query
        .mockResolvedValueOnce({ command: 'BEGIN' })
        .mockResolvedValueOnce({ rows: [mockAttemptRow] })
        .mockResolvedValueOnce({ command: 'INSERT' })
        .mockResolvedValueOnce({ command: 'COMMIT' });

      const result = await examService.startExam(userId, examId, '192.168.1.1', 'Mozilla/5.0');

      expect(result).toHaveProperty('success', true);
      expect(result.data).toHaveProperty('attempt');
      expect(result.data.attempt).toHaveProperty('id', 100);
      expect(result.data.attempt).toHaveProperty('status', 'in_progress');
    });

    it('should reject exam start when student not eligible', async () => {
      const userId = 1;
      const examId = 1;

      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ allowed: false, reason: 'Student not enrolled' }] });

      await expect(examService.startExam(userId, examId))
        .rejects
        .toThrow('Student not enrolled');
    });

    it('should rollback transaction on error', async () => {
      const userId = 1;
      const examId = 1;

      const mockExamRow = {
        id: 1,
        moodle_course_id: 1001,
        moodle_course_module_id: 2001,
        exam_name: 'Midterm Exam',
        course_name: 'Advanced Mathematics',
        duration_minutes: 120,
        max_warnings: 3,
        question_paper_path: '/papers/exam1.pdf'
      };

      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ allowed: true, reason: null }] })
        .mockResolvedValueOnce({ rows: [mockExamRow] });

      mockClient.query
        .mockResolvedValueOnce({ command: 'BEGIN' })
        .mockRejectedValueOnce(new Error('Database error'))
        .mockResolvedValueOnce({ command: 'ROLLBACK' });

      await expect(examService.startExam(userId, examId))
        .rejects
        .toThrow('Database error');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('submitExam()', () => {
    it('should successfully submit exam attempt', async () => {
      const userId = 1;
      const attemptId = 100;

      const mockAttempt = {
        id: 100,
        user_id: userId,
        exam_id: 1,
        status: 'submitted',
        submitted_at: new Date()
      };

      mockClient.query
        .mockResolvedValueOnce({ command: 'BEGIN' })
        .mockResolvedValueOnce({ rows: [mockAttempt] })
        .mockResolvedValueOnce({ command: 'INSERT' })
        .mockResolvedValueOnce({ command: 'COMMIT' });

      const result = await examService.submitExam(userId, attemptId);

      expect(result).toHaveProperty('success', true);
      expect(result.data.attempt).toHaveProperty('status', 'submitted');
    });

    it('should reject submission of non-existent attempt', async () => {
      const userId = 1;
      const attemptId = 999;

      mockClient.query
        .mockResolvedValueOnce({ command: 'BEGIN' })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ command: 'ROLLBACK' });

      await expect(examService.submitExam(userId, attemptId))
        .rejects
        .toThrow();
    });
  });

  describe('resumeExam()', () => {
    it('should resume existing exam attempt', async () => {
      const userId = 1;
      const attemptId = 100;

      const mockAttempt = {
        id: 100,
        user_id: userId,
        exam_id: 1,
        status: 'in_progress',
        started_at: new Date(),
        submitted_at: null
      };

      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockAttempt] });

      const result = await examService.resumeExam(userId, attemptId);

      expect(result.data.attempt).toHaveProperty('id', 100);
      expect(result.data.attempt).toHaveProperty('status', 'in_progress');
    });

    it('should throw error for invalid attempt', async () => {
      const userId = 1;
      const attemptId = 999;

      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] });

      await expect(examService.resumeExam(userId, attemptId))
        .rejects
        .toThrow();
    });
  });

  describe('getQuestionsSummary()', () => {
    it('should return questions summary for exam', async () => {
      const examId = 1;

      const mockQuestions = [
        { id: 1, question_number: 1, total_marks: 5 },
        { id: 2, question_number: 2, total_marks: 5 }
      ];

      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: mockQuestions });

      const result = await examService.getQuestionsSummary(examId);

      expect(result).toHaveProperty('success', true);
      expect(result.data.questions).toHaveLength(2);
      expect(result.data.totalQuestions).toBe(2);
      expect(result.data.totalMarks).toBe(10);
    });
  });

  describe('validateExamAccess()', () => {
    it('should validate student can access exam', async () => {
      const userId = 1;
      const examId = 1;

      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const result = await examService.validateExamAccess(userId, examId);

      expect(result).toBe(true);
    });

    it('should reject access when student not enrolled', async () => {
      const userId = 1;
      const examId = 1;

      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await examService.validateExamAccess(userId, examId);

      expect(result).toBe(false);
    });
  });

  describe('checkAttemptLimit()', () => {
    it('should return remaining attempts', async () => {
      const userId = 1;
      const examId = 1;
      const maxAttempts = 3;

      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const result = await examService.checkAttemptLimit(userId, examId, maxAttempts);

      expect(result).toHaveProperty('allowed', true);
      expect(result).toHaveProperty('remaining', 2);
    });

    it('should reject when attempt limit reached', async () => {
      const userId = 1;
      const examId = 1;
      const maxAttempts = 3;

      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ count: '3' }] });

      const result = await examService.checkAttemptLimit(userId, examId, maxAttempts);

      expect(result).toHaveProperty('allowed', false);
      expect(result).toHaveProperty('remaining', 0);
    });
  });
});
