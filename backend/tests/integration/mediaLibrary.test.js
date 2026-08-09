/**
 * Integration: media library isolation + signed URLs.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const { createApp } = await import('../../../src/app.js');
const {
  truncateAll,
  createUser,
} = await import('../helpers/db.js');
const db = (await import('../../../src/config/database.js')).default;

let app;

function authHeader(user) {
  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role || 'user' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return { Authorization: `Bearer ${token}` };
}

async function insertAttachment(userId, { source = 'chatbot_web', key, name = 'a.pdf' }) {
  await db.query(
    `INSERT INTO chat_attachments
       (id_user, source, storage_key, display_name, mime_type, size_bytes, expires_at)
     VALUES ($1, $2, $3, $4, 'application/pdf', 100, NOW() + INTERVAL '90 days')`,
    [userId, source, key, name]
  );
}

describe('media library API', () => {
  beforeAll(async () => {
    app = createApp();
  });

  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    // pool closed by jest teardown
  });

  it('each owner only sees their workspace files; url is signed from key', async () => {
    const alice = await createUser({ email: 'alice-media@test.local' });
    const bob = await createUser({ email: 'bob-media@test.local' });

    await insertAttachment(alice.id, { key: `uploads/${alice.id}/chat/1_a.pdf`, name: 'alice.pdf' });
    await insertAttachment(bob.id, { key: `uploads/${bob.id}/chat/1_b.pdf`, name: 'bob.pdf' });

    const aliceRes = await request(app)
      .get('/api/media-library')
      .set(authHeader(alice))
      .expect(200);

    expect(aliceRes.body.success).toBe(true);
    expect(aliceRes.body.data).toHaveLength(1);
    expect(aliceRes.body.data[0].displayName).toBe('alice.pdf');
    expect(aliceRes.body.data[0].url).toMatch(/\/file\//);
    expect(aliceRes.body.data[0].url).not.toMatch(/javascript:/i);
    expect(aliceRes.body.data[0].storageKey).toContain(`/chat/`);

    const bobRes = await request(app)
      .get('/api/media-library')
      .set(authHeader(bob))
      .expect(200);

    expect(bobRes.body.data).toHaveLength(1);
    expect(bobRes.body.data[0].displayName).toBe('bob.pdf');
  });

  it('filters by source and paginates', async () => {
    const user = await createUser({ email: 'page-media@test.local' });
    for (let i = 0; i < 3; i += 1) {
      await insertAttachment(user.id, {
        source: 'chatbot_studio',
        key: `uploads/${user.id}/chat/${i}_s.pdf`,
        name: `studio-${i}.pdf`,
      });
    }
    await insertAttachment(user.id, {
      source: 'ai_assistant',
      key: `uploads/${user.id}/chat/ai.pdf`,
      name: 'ai.pdf',
    });

    const filtered = await request(app)
      .get('/api/media-library')
      .query({ source: 'chatbot_studio', limit: 2, page: 1 })
      .set(authHeader(user))
      .expect(200);

    expect(filtered.body.data).toHaveLength(2);
    expect(filtered.body.pagination.total).toBe(3);
    expect(filtered.body.data.every((x) => x.source === 'chatbot_studio')).toBe(true);
  });
});
