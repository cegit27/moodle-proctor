/**
 * @file tests/integration/auth.integration.test.ts
 * @description Integration tests for Authentication API
 */

import request from 'supertest';
import { FastifyInstance } from 'fastify';

describe('Auth Integration Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Initialize Fastify app
    // app = await createApp();
    // await app.ready();
  });

  afterAll(async () => {
    // await app.close();
  });

  describe('POST /api/auth/login', () => {
    it('should login user and return JWT token', async () => {
      const response = await request(app.server)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'password123'
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('expiresAt');
    });

    it('should return 400 for missing credentials', async () => {
      const response = await request(app.server)
        .post('/api/auth/login')
        .send({
          username: 'testuser'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should return 401 for invalid credentials', async () => {
      const response = await request(app.server)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'wrongpassword'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should set JWT in cookie', async () => {
      const response = await request(app.server)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'password123'
        })
        .expect(200);

      expect(response.headers['set-cookie']).toBeDefined();
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh valid token', async () => {
      // First, login to get token
      const loginRes = await request(app.server)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'password123'
        });

      const { token } = loginRes.body;

      // Now refresh
      const response = await request(app.server)
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body.token).not.toBe(token); // New token
    });

    it('should reject expired token', async () => {
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE1MTYyMzkwMjJ9.invalid';

      const response = await request(app.server)
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout user successfully', async () => {
      const loginRes = await request(app.server)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'password123'
        });

      const { token } = loginRes.body;

      const response = await request(app.server)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });

    it('should require authentication for logout', async () => {
      const response = await request(app.server)
        .post('/api/auth/logout')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/auth/validate', () => {
    it('should validate user token', async () => {
      const loginRes = await request(app.server)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'password123'
        });

      const { token } = loginRes.body;

      const response = await request(app.server)
        .get('/api/auth/validate')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('valid', true);
      expect(response.body).toHaveProperty('user');
    });

    it('should reject invalid token', async () => {
      const response = await request(app.server)
        .get('/api/auth/validate')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/auth/moodle/sync', () => {
    it('should sync user from Moodle', async () => {
      const loginRes = await request(app.server)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'password123'
        });

      const { token } = loginRes.body;

      const response = await request(app.server)
        .post('/api/auth/moodle/sync')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('user');
    });
  });

  describe('Authentication flow', () => {
    it('should complete full authentication flow', async () => {
      // 1. Login
      const loginRes = await request(app.server)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'password123'
        })
        .expect(200);

      const { token, user } = loginRes.body;
      expect(token).toBeDefined();
      expect(user.id).toBeDefined();

      // 2. Validate token
      const validateRes = await request(app.server)
        .get('/api/auth/validate')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(validateRes.body.valid).toBe(true);
      expect(validateRes.body.user.id).toBe(user.id);

      // 3. Logout
      const logoutRes = await request(app.server)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(logoutRes.body.success).toBe(true);

      // 4. Verify token no longer works
      const postLogoutValidate = await request(app.server)
        .get('/api/auth/validate')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);

      expect(postLogoutValidate.body.error).toBeDefined();
    });
  });
});
