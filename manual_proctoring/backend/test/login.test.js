const request = require('supertest');
const express = require('express');
const cors = require('cors');

// Import the app from server.js
// Assuming server.js exports the app
const app = require('../server');

describe('POST /api/login', () => {
  it('should return success for valid credentials', async () => {
    const response = await request(app)
      .post('/api/login')
      .send({ email: 'asif@gmail.com', password: '1234' })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.token).toBe('dummy_token_123');
  });

  it('should return error for invalid credentials', async () => {
    const response = await request(app)
      .post('/api/login')
      .send({ email: 'wrong@email.com', password: 'wrong' })
      .expect(401);

    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe('Invalid credentials');
  });
});