import { beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { createUser, truncateAll } from './helpers/db.js';

let app;
let user;
let token;
let chatbot;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  user = await createUser({ username: `studio-limits-${Date.now()}` });
  const login = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  token = login.body.data.accessToken;
  const { rows } = await db.query(
    `INSERT INTO custom_chatbots (id_user, name, widget_key)
     VALUES ($1, 'Bot quota', $2)
     RETURNING *`,
    [user.id, `quota_${Date.now()}`]
  );
  chatbot = rows[0];
});

describe('chatbot reply limit config', () => {
  it('persists owner config and returns it only on the owner list', async () => {
    const config = {
      version: 1,
      windows: {
        minute: { limit: 4, action: 'silent', message: '' },
        month: { limit: 500, action: 'notify', message: 'Bot đã hết lượt tháng này.' },
      },
    };

    const update = await request(app)
      .put(`/api/ai/chatbot/custom-chatbots/${chatbot.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reply_limit_config: config });

    expect(update.status).toBe(200);
    expect(update.body.data.reply_limit_config.windows.minute.limit).toBe(4);
    expect(update.body.data.reply_limit_config.windows.month.message).toBe('Bot đã hết lượt tháng này.');

    const list = await request(app)
      .get('/api/ai/chatbot/custom-chatbots')
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data[0].reply_limit_config.windows.month.limit).toBe(500);

    const publicResult = await request(app)
      .get(`/api/chatbot-public/chatbot/${chatbot.id}`);
    expect(JSON.stringify(publicResult.body)).not.toContain('reply_limit_config');
  });

  it('rejects an invalid limit before writing', async () => {
    const update = await request(app)
      .put(`/api/ai/chatbot/custom-chatbots/${chatbot.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        reply_limit_config: {
          windows: { hour: { limit: 0, action: 'notify', message: 'Hết lượt' } },
        },
      });

    expect(update.status).toBe(400);
    expect(update.body.code).toBe('CHATBOT_REPLY_LIMIT_INVALID');
  });
});

describe('chatbot studio message cursor', () => {
  it('loads the newest page first, then an older non-overlapping page', async () => {
    const { rows: conversations } = await db.query(
      `INSERT INTO chatbot_studio_conversations (id_user, id_chatbot, session_id, title)
       VALUES ($1, $2, $3, 'Lịch sử dài')
       RETURNING *`,
      [user.id, chatbot.id, `session_${Date.now()}`]
    );
    const conversation = conversations[0];

    for (let index = 1; index <= 7; index += 1) {
      await db.query(
        `INSERT INTO chatbot_studio_messages
           (id_conversation, role, content, created_at)
         VALUES ($1, 'user', $2, NOW() + ($3 * INTERVAL '1 second'))`,
        [conversation.id, `Tin ${index}`, index]
      );
    }

    const latest = await request(app)
      .get(`/api/ai/chatbot-studio/conversations/${conversation.id}/messages`)
      .query({ limit: 3 })
      .set('Authorization', `Bearer ${token}`);

    expect(latest.status).toBe(200);
    expect(latest.body.data.map((item) => item.content)).toEqual(['Tin 5', 'Tin 6', 'Tin 7']);
    expect(latest.body.pagination.hasMore).toBe(true);

    const older = await request(app)
      .get(`/api/ai/chatbot-studio/conversations/${conversation.id}/messages`)
      .query({ limit: 3, beforeId: latest.body.pagination.nextBeforeId })
      .set('Authorization', `Bearer ${token}`);

    expect(older.status).toBe(200);
    expect(older.body.data.map((item) => item.content)).toEqual(['Tin 2', 'Tin 3', 'Tin 4']);
    expect(older.body.pagination.hasMore).toBe(true);
    expect(older.body.data.some((item) => item.id === latest.body.data[0].id)).toBe(false);
  });
});
