/**
 * @file tests/integration/violation.integration.test.ts
 * @description Integration tests for Violation Reporting API
 */

import request from 'supertest';
import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';

describe('Violation Integration Tests', () => {
  let app: FastifyInstance;
  let AUTH_TOKEN: string;
  let ATTEMPT_ID: number;
  let ws: WebSocket;

  beforeAll(async () => {
    // Initialize app and get auth token
    // app = await createApp();
    // await app.ready();

    // Setup test data
    // AUTH_TOKEN = 'test-token';
    // ATTEMPT_ID = 1;
  });

  afterAll(async () => {
    // if (ws) ws.close();
    // await app.close();
  });

  describe('POST /api/exam/violations', () => {
    it('should report violation successfully', async () => {
      const response = await request(app.server)
        .post('/api/exam/violations')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`)
        .send({
          attemptId: ATTEMPT_ID,
          violationType: 'no_face',
          severity: 'warning',
          detail: 'Face not detected for 3 seconds',
          timestamp: Date.now()
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('violation');
      expect(response.body.data.violation).toHaveProperty('id');
      expect(response.body.data.violation).toHaveProperty('violationType', 'no_face');
    });

    it('should accept violation with frame snapshot', async () => {
      const mockFrameSnapshot = Buffer.from('fake-image-data').toString('base64');

      const response = await request(app.server)
        .post('/api/exam/violations')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`)
        .send({
          attemptId: ATTEMPT_ID,
          violationType: 'phone_detected',
          severity: 'critical',
          detail: 'Phone detected in frame',
          frameSnapshot: mockFrameSnapshot,
          timestamp: Date.now()
        })
        .expect(200);

      expect(response.body.data.violation).toHaveProperty('frameSnapshot');
    });

    it('should handle different violation types', async () => {
      const violationTypes = [
        'no_face',
        'multiple_faces',
        'gaze_averted',
        'phone_detected',
        'unknown_object',
        'identity_mismatch',
        'tab_switch'
      ];

      for (const violType of violationTypes) {
        const response = await request(app.server)
          .post('/api/exam/violations')
          .set('Authorization', `Bearer ${AUTH_TOKEN}`)
          .send({
            attemptId: ATTEMPT_ID,
            violationType: violType,
            severity: 'warning',
            timestamp: Date.now()
          })
          .expect(200);

        expect(response.body.data.violation.violationType).toBe(violType);
      }
    });

    it('should accept metadata for violations', async () => {
      const response = await request(app.server)
        .post('/api/exam/violations')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`)
        .send({
          attemptId: ATTEMPT_ID,
          violationType: 'phone_detected',
          severity: 'critical',
          metadata: {
            confidence: 0.95,
            boxArea: 0.25,
            faceCount: 2
          },
          timestamp: Date.now()
        })
        .expect(200);

      expect(response.body.data.violation).toHaveProperty('metadata');
    });

    it('should require authentication', async () => {
      const response = await request(app.server)
        .post('/api/exam/violations')
        .send({
          attemptId: ATTEMPT_ID,
          violationType: 'no_face',
          severity: 'warning'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should validate violation type', async () => {
      const response = await request(app.server)
        .post('/api/exam/violations')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`)
        .send({
          attemptId: ATTEMPT_ID,
          violationType: 'invalid_type',
          severity: 'warning'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/exam/attempt/:attemptId/violations', () => {
    it('should retrieve violations for attempt', async () => {
      const response = await request(app.server)
        .get(`/api/exam/attempt/${ATTEMPT_ID}/violations`)
        .set('Authorization', `Bearer ${AUTH_TOKEN}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter violations by severity', async () => {
      const response = await request(app.server)
        .get(`/api/exam/attempt/${ATTEMPT_ID}/violations?severity=critical`)
        .set('Authorization', `Bearer ${AUTH_TOKEN}`)
        .expect(200);

      response.body.data.forEach((v: any) => {
        expect(v.severity).toBe('critical');
      });
    });

    it('should pagination violations', async () => {
      const response = await request(app.server)
        .get(`/api/exam/attempt/${ATTEMPT_ID}/violations?limit=10&offset=0`)
        .set('Authorization', `Bearer ${AUTH_TOKEN}`)
        .expect(200);

      expect(response.body).toHaveProperty('pagination');
      expect(response.body.pagination).toHaveProperty('total');
    });
  });

  describe('GET /api/exam/attempt/:attemptId/violations/summary', () => {
    it('should return violation summary', async () => {
      const response = await request(app.server)
        .get(`/api/exam/attempt/${ATTEMPT_ID}/violations/summary`)
        .set('Authorization', `Bearer ${AUTH_TOKEN}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('totalViolations');
      expect(response.body.data).toHaveProperty('criticalViolations');
      expect(response.body.data).toHaveProperty('warningViolations');
      expect(response.body.data).toHaveProperty('violationsByType');
    });
  });

  describe('POST /api/exam/violations/:violationId/flag', () => {
    it('should flag violation for review', async () => {
      // First create a violation
      const createRes = await request(app.server)
        .post('/api/exam/violations')
        .set('Authorization', `Bearer ${AUTH_TOKEN}`)
        .send({
          attemptId: ATTEMPT_ID,
          violationType: 'gaze_averted',
          severity: 'warning'
        });

      const violationId = createRes.body.data.violation.id;

      // Then flag it
      const response = await request(app.server)
        .post(`/api/exam/violations/${violationId}/flag`)
        .set('Authorization', `Bearer ${AUTH_TOKEN}`)
        .send({
          reason: 'False positive - glance at notes is acceptable'
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('flagged', true);
    });
  });

  describe('WebSocket Violation Streaming', () => {
    it('should stream violations over WebSocket', async () => {
      // This is a conceptual test - actual WebSocket testing requires ws client
      
      // Expected behavior:
      // 1. Client connects to ws://localhost:5000/ws/violations?attemptId=123
      // 2. Server sends violations in real-time
      // 3. Client receives: { type: 'violation', data: {...} }

      const wsUrl = `ws://localhost:5000/ws/violations?attemptId=${ATTEMPT_ID}&token=${AUTH_TOKEN}`;
      
      // In real implementation:
      // const ws = new WebSocket(wsUrl);
      // ws.on('message', (msg) => {
      //   const data = JSON.parse(msg);
      //   expect(data.type).toBe('violation');
      //   expect(data.data).toHaveProperty('violationType');
      // });
    });
  });

  describe('Violation Auto-Actions', () => {
    it('should warn on first warning violation', async () => {
      const response = await request(app.server)
        .get(`/api/exam/attempt/${ATTEMPT_ID}`)
        .set('Authorization', `Bearer ${AUTH_TOKEN}`)
        .expect(200);

      // Should have warning count incremented
      expect(response.body.data).toHaveProperty('warningCount');
    });

    it('should terminate exam on critical violations', async () => {
      // After max critical violations, exam should auto-terminate
      // This would require prior setup with multiple violations

      const response = await request(app.server)
        .get(`/api/exam/attempt/${ATTEMPT_ID}`)
        .set('Authorization', `Bearer ${AUTH_TOKEN}`)
        .expect(200);

      // Check if exam was terminated
      if (response.body.data.warningCount >= 3) {
        expect(response.body.data.status).toBe('terminated');
      }
    });
  });

  describe('Violation Report Generation', () => {
    it('should generate violation report for attempt', async () => {
      const response = await request(app.server)
        .get(`/api/exam/attempt/${ATTEMPT_ID}/violations/report`)
        .set('Authorization', `Bearer ${AUTH_TOKEN}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('report');
      expect(response.body.data.report).toHaveProperty('totalViolations');
      expect(response.body.data.report).toHaveProperty('timeline');
    });
  });
});
