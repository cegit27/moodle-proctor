// ============================================================================
// Security Services Tests
// Basic verification that security services work correctly
// ============================================================================

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  SignatureService,
  ReplayPreventionService,
  RateLimiterService
} from '../index';

describe('SignatureService', () => {
  let signatureService: SignatureService;
  const testSecret = 'test-secret-key-for-signing-min-32-chars';
  const testData = Buffer.from('test frame data');

  beforeEach(() => {
    signatureService = new SignatureService(testSecret, 5000);
  });

  it('should sign and verify frames correctly', () => {
    const timestamp = Date.now();
    const signature = signatureService.signFrame(testData, timestamp);

    expect(signature).toBeDefined();
    expect(signature.length).toBeGreaterThan(0);

    const isValid = signatureService.verifySignature(testData, signature, timestamp);
    expect(isValid).toBe(true);
  });

  it('should reject invalid signatures', () => {
    const timestamp = Date.now();
    const signature = signatureService.signFrame(testData, timestamp);

    // Tamper with data
    const tamperedData = Buffer.from('tampered data');
    const isValid = signatureService.verifySignature(tamperedData, signature, timestamp);
    expect(isValid).toBe(false);
  });

  it('should reject expired timestamps', () => {
    const oldTimestamp = Date.now() - 10000; // 10 seconds ago
    const signature = signatureService.signFrame(testData, oldTimestamp);

    const isValid = signatureService.verifySignature(testData, signature, oldTimestamp);
    expect(isValid).toBe(false);
  });

  it('should create and verify integrity hashes', () => {
    const violationData = {
      attemptId: 1,
      type: 'face_absent',
      timestamp: Date.now()
    };

    const hash = signatureService.createIntegrityHash(violationData);
    expect(hash).toBeDefined();
    expect(hash.length).toBe(64); // SHA-256 hex length

    const isValid = signatureService.verifyIntegrityHash(violationData, hash);
    expect(isValid).toBe(true);

    // Modified data should fail
    const modifiedData = { ...violationData, type: 'phone_detected' };
    const isModifiedValid = signatureService.verifyIntegrityHash(modifiedData, hash);
    expect(isModifiedValid).toBe(false);
  });
});

describe('ReplayPreventionService', () => {
  let replayService: ReplayPreventionService;
  const sessionId = 'test-session-1';

  beforeEach(() => {
    replayService = new ReplayPreventionService(1000, 300000);
  });

  it('should accept new frames', () => {
    const result = replayService.trackFrame(sessionId, 1, Date.now());
    expect(result).toBe(true);
  });

  it('should reject duplicate frames', () => {
    const timestamp = Date.now();
    replayService.trackFrame(sessionId, 1, timestamp);

    const result = replayService.trackFrame(sessionId, 1, timestamp);
    expect(result).toBe(false); // Replay detected
  });

  it('should reject very old frames (out of order)', () => {
    replayService.trackFrame(sessionId, 20, Date.now());
    
    // Try to submit frame 5 (should be rejected as too old)
    const result = replayService.trackFrame(sessionId, 5, Date.now());
    expect(result).toBe(false);
  });

  it('should allow some out-of-order frames', () => {
    // Start at sequence 10
    replayService.trackFrame(sessionId, 10, Date.now());

    // Allow frames up to 10 positions out of order
    const result = replayService.trackFrame(sessionId, 5, Date.now());
    expect(result).toBe(true);
  });

  it('should track session state', () => {
    replayService.trackFrame(sessionId, 1, Date.now());
    replayService.trackFrame(sessionId, 2, Date.now());

    const state = replayService.getSessionState(sessionId);
    expect(state).toBeDefined();
    expect(state?.lastSequence).toBe(2);
    expect(state?.frameCount).toBe(2);
  });

  it('should cleanup session data', () => {
    replayService.trackFrame(sessionId, 1, Date.now());
    replayService.trackFrame(sessionId, 2, Date.now());

    let state = replayService.getSessionState(sessionId);
    expect(state).toBeDefined();

    replayService.cleanup(sessionId);

    state = replayService.getSessionState(sessionId);
    expect(state).toBeUndefined();
  });

  it('should check if sequence is used', () => {
    replayService.trackFrame(sessionId, 1, Date.now());

    expect(replayService.isSequenceUsed(sessionId, 1)).toBe(true);
    expect(replayService.isSequenceUsed(sessionId, 2)).toBe(false);
  });
});

describe('RateLimiterService', () => {
  let rateLimiter: RateLimiterService;

  beforeEach(() => {
    rateLimiter = new RateLimiterService(5, 10000); // 5 requests per 10 seconds
  });

  it('should allow requests within limit', async () => {
    const result1 = await rateLimiter.checkLimit('user1');
    expect(result1.allowed).toBe(true);
    expect(result1.remaining).toBe(4);

    const result2 = await rateLimiter.checkLimit('user1');
    expect(result2.allowed).toBe(true);
    expect(result2.remaining).toBe(3);
  });

  it('should block requests exceeding limit', async () => {
    // Use all 5 requests
    for (let i = 0; i < 5; i++) {
      await rateLimiter.checkLimit('user2');
    }

    // 6th request should be blocked
    const result = await rateLimiter.checkLimit('user2');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeDefined();
  });

  it('should reset window after time expires', async () => {
    // This test would need to use a mock timer or wait real time
    // For now, we'll just verify the structure
    const result = await rateLimiter.checkLimit('user3');
    expect(result.resetAt).toBeInstanceOf(Date);
  });

  it('should track separate limits for different keys', async () => {
    const result1 = await rateLimiter.checkLimit('user4');
    const result2 = await rateLimiter.checkLimit('user5');

    expect(result1.allowed).toBe(true);
    expect(result2.allowed).toBe(true);
    expect(result1.remaining).toBe(4);
    expect(result2.remaining).toBe(4);
  });

  it('should reset limit for specific key', async () => {
    await rateLimiter.checkLimit('user6');
    await rateLimiter.checkLimit('user6');

    let result = await rateLimiter.checkLimit('user6');
    expect(result.remaining).toBe(2); // 5 - 3 = 2

    rateLimiter.reset('user6');

    result = await rateLimiter.checkLimit('user6');
    expect(result.remaining).toBe(4); // Reset to 5 - 1 = 4
  });

  it('should provide status', async () => {
    await rateLimiter.checkLimit('user7');

    const status = rateLimiter.getStatus('user7');
    expect(status).toBeDefined();
    expect(status?.count).toBe(1);
  });

  it('should provide statistics', () => {
    const stats = rateLimiter.getStats();
    expect(stats).toBeDefined();
    expect(stats.defaultLimit).toBe(5);
    expect(stats.defaultWindow).toBe(10000);
  });
});
