import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Pool } from 'pg';
import { ViolationService } from '../violation.service';

describe('ViolationService', () => {
  let service: ViolationService;
  let mockPool: Pool;
  let mockQuery: jest.MockedFunction<any>;
  let mockClientQuery: jest.MockedFunction<any>;
  let mockRelease: jest.MockedFunction<any>;

  beforeEach(() => {
    mockQuery = jest.fn() as any;
    mockClientQuery = jest.fn() as any;
    mockRelease = jest.fn() as any;

    mockPool = {
      query: mockQuery,
      connect: (jest.fn(async () => ({
        query: mockClientQuery,
        release: mockRelease
      })) as unknown) as Pool['connect']
    } as unknown as Pool;

    service = new ViolationService(mockPool);
    (service as any).examService = {
      autoSubmitExam: jest.fn()
    };
  });

  it('recomputes violation_count from warning-only violations', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 12, user_id: 7, status: 'in_progress' }]
    });

    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 99,
            attempt_id: 12,
            violation_type: 'window_blur',
            severity: 'info',
            detail: 'Focus left the exam window for the first time.',
            occurred_at: new Date('2026-04-01T00:00:00.000Z'),
            frame_snapshot_path: null,
            metadata: null,
            integrity_hash: 'hash',
            ai_signature: null,
            client_ip: null,
            session_id: null
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ count: '2', max_warnings: 15 }]
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.recordViolation(
      {
        attemptId: 12,
        violationType: 'window_blur',
        severity: 'info',
        detail: 'Focus left the exam window for the first time.'
      },
      7
    );

    expect(result.success).toBe(true);
    expect(result.data.violationCount).toBe(2);
    expect(result.data.shouldAutoSubmit).toBe(false);
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining("AND severity = 'warning'"),
      [12]
    );
    expect((service as any).examService.autoSubmitExam).not.toHaveBeenCalled();
    expect(mockRelease).toHaveBeenCalled();
  });

  it('reads the persisted warning counter in checkViolationCount', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ count: '4', max_warnings: 15 }]
    });

    const result = await service.checkViolationCount(12);

    expect(result).toEqual({
      success: true,
      data: {
        count: 4,
        threshold: 15,
        shouldAutoSubmit: false
      }
    });
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('ea.violation_count::text as count'),
      [12]
    );
  });
});
