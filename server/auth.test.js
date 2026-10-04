import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from './app.js';

describe('auth API', () => {
  it('rejects invalid login credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'citizen@example.com', password: 'wrong' });

    expect(response.status).toBe(401);
  });
});
