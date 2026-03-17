const request = require('supertest');
const app = require('../server');

describe('GET /exam', () => {
  it('should return exam data when authenticated', async () => {
    const login = await request(app)
      .post('/api/login')
      .send({ email: 'asif@gmail.com', password: '1234' })
      .expect(200);

    const token = login.body.token;

    const response = await request(app)
      .get('/exam')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({
      timer: 10,
      questionPaper: 'question-paper.pdf'
    });
  });
});