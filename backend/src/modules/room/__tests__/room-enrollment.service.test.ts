import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Pool } from 'pg';
import {
  resolveRoomEnrollmentAttemptId
} from '../room-enrollment.service';

describe('resolveRoomEnrollmentAttemptId', () => {
  let mockQuery: jest.MockedFunction<any>;
  let mockPool: Pool;

  beforeEach(() => {
    mockQuery = jest.fn() as any;
    mockPool = {
      query: mockQuery
    } as unknown as Pool;
  });

  it('reuses the linked attempt when it is still in progress', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 41, status: 'in_progress' }]
    });

    const result = await resolveRoomEnrollmentAttemptId(mockPool, {
      enrollmentId: 5,
      linkedAttemptId: 41,
      userId: 8,
      examId: 11
    });

    expect(result).toBe(41);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('clears a stale submitted link when there is no active attempt', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 41, status: 'submitted' }]
      })
      .mockResolvedValueOnce({
        rows: []
      })
      .mockResolvedValueOnce({
        rows: []
      });

    const result = await resolveRoomEnrollmentAttemptId(mockPool, {
      enrollmentId: 5,
      linkedAttemptId: 41,
      userId: 8,
      examId: 11
    });

    expect(result).toBeNull();
    expect(mockQuery).toHaveBeenLastCalledWith(
      expect.stringContaining('SET attempt_id = NULL'),
      [5]
    );
  });

  it('relinks the enrollment to an active attempt when the old one is stale', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 41, status: 'submitted' }]
      })
      .mockResolvedValueOnce({
        rows: [{ id: 52 }]
      })
      .mockResolvedValueOnce({
        rows: []
      });

    const result = await resolveRoomEnrollmentAttemptId(mockPool, {
      enrollmentId: 5,
      linkedAttemptId: 41,
      userId: 8,
      examId: 11
    });

    expect(result).toBe(52);
    expect(mockQuery).toHaveBeenLastCalledWith(
      expect.stringContaining('SET attempt_id = $1'),
      [52, 5]
    );
  });
});
