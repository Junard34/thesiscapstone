import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from './app.js';
import { db } from './database.js';

describe('complaint API', () => {
  it('deletes a complaint by id', async () => {
    const citizen = await db.get('SELECT id FROM users WHERE email = ?', ['citizen@example.com']);

    const createResponse = await request(app)
      .post('/api/complaints')
      .send({
        citizenId: citizen.id,
        title: 'Delete test complaint',
        description: 'This complaint should be removable.',
        channel: 'Online form',
      });

    expect(createResponse.status).toBe(201);

    const deleteResponse = await request(app)
      .delete(`/api/complaints/${createResponse.body.complaint.id}`);

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.message).toMatch(/deleted/i);

    const complaints = await db.get('SELECT * FROM complaints WHERE id = ?', [createResponse.body.complaint.id]);
    expect(complaints).toBeUndefined();
  });
});
