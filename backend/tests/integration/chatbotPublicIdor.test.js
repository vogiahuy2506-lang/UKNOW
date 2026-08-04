/**
 * Phase 1 — public chatbot IDOR surface closed.
 *
 * Orphan /widget/conversations* and /custom-chatbot/:id/documents must not
 * remain reachable without auth/session scoping.
 */
import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';

let app;

beforeAll(() => {
  app = createApp();
});

describe('chatbot-public IDOR Phase 1', () => {
  it('returns 404 for removed orphan widget conversation routes', async () => {
    await expect(
      request(app).post('/api/chatbot-public/widget/conversations').send({ widgetKey: 'x' })
    ).resolves.toMatchObject({ status: 404 });

    await expect(
      request(app).get('/api/chatbot-public/widget/conversations/1/messages')
    ).resolves.toMatchObject({ status: 404 });

    await expect(
      request(app)
        .post('/api/chatbot-public/widget/conversations/1/messages')
        .send({ conversationId: 1, content: 'hi' })
    ).resolves.toMatchObject({ status: 404 });
  });

  it('returns 404 for public documents endpoint (removed)', async () => {
    const res = await request(app).get('/api/chatbot-public/custom-chatbot/1/documents');
    expect(res.status).toBe(404);
  });
});
