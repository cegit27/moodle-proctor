const request = require('supertest');
const app = require('../server');

describe('GET /exam', () => {
  it('should return exam data', async () => {
    const response = await request(app)
      .get('/exam')
      .expect(200);

    expect(response.body).toEqual({
      timer: 10,
      questionPaper: "question-paper.pdf"
    });
  });
});