import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser, createPlan, assignPlanToUser } from './helpers/db.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  return res.body.data.accessToken;
}

describe('AI model tier gating', () => {
  it('GET /api/ai/allowed-models trả model theo gói', async () => {
    const user = await createUser({ role: 'user', username: 'ai_tier_u' });
    const plan = await createPlan({ code: 'starter' });
    await db.query(`UPDATE plans SET ai_model = 'gemini-2.0-flash' WHERE id = $1`, [plan.id]);
    await assignPlanToUser(user.id, plan.id);

    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/ai/allowed-models')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.maxModel).toBe('gemini-2.0-flash');
    expect(res.body.data.models).toContain('gemini-2.0-flash');
    expect(res.body.data.models).not.toContain('gemini-2.5-pro');
  });
});
