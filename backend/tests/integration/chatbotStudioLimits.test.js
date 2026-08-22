import { beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { createUser, truncateAll } from './helpers/db.js';

let app;
let user;
let token;
let chatbot;

async function loginAs(targetUser) {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ username: targetUser.username, password: targetUser.plainPassword });
  return login.body.data.accessToken;
}

async function addChatbotMembership(ownerId, employeeId, permissions = { chatbots_manage: true }) {
  await db.query(
    `INSERT INTO user_members (owner_id, employee_id, permissions, status, created_at, updated_at)
     VALUES ($1, $2, $3::jsonb, 'active', NOW(), NOW())`,
    [ownerId, employeeId, JSON.stringify(permissions)]
  );
}

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  user = await createUser({ username: `studio-limits-${Date.now()}` });
  token = await loginAs(user);
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

describe('employee Chatbot Studio workspace scope', () => {
  it('reads and creates in owner workspace, rejects another workspace, and audits the actor', async () => {
    const employee = await createUser({ username: `studio-employee-${Date.now()}` });
    const anotherOwner = await createUser({ username: `studio-other-${Date.now()}` });
    await addChatbotMembership(user.id, employee.id);
    const employeeToken = await loginAs(employee);
    const contextHeaders = {
      Authorization: `Bearer ${employeeToken}`,
      'X-Owner-Context': String(user.id),
    };

    const { rows: otherRows } = await db.query(
      `INSERT INTO custom_chatbots (id_user, name, widget_key)
       VALUES ($1, 'Other workspace bot', $2)
       RETURNING id`,
      [anotherOwner.id, `other_${Date.now()}`]
    );

    const list = await request(app)
      .get('/api/ai/chatbot/custom-chatbots')
      .set(contextHeaders);
    expect(list.status).toBe(200);
    expect(list.body.data.map((item) => Number(item.id))).toContain(Number(chatbot.id));
    expect(list.body.data.map((item) => Number(item.id))).not.toContain(Number(otherRows[0].id));

    const crossWorkspace = await request(app)
      .get(`/api/ai/chatbot/custom-chatbots/${otherRows[0].id}`)
      .set(contextHeaders);
    expect(crossWorkspace.status).toBe(404);

    const created = await request(app)
      .post('/api/ai/chatbot/custom-chatbots')
      .set(contextHeaders)
      .send({ name: 'Employee-created bot' });
    expect(created.status).toBe(201);

    const { rows: storedRows } = await db.query(
      `SELECT id_user FROM custom_chatbots WHERE id = $1`,
      [created.body.data.id]
    );
    expect(Number(storedRows[0].id_user)).toBe(Number(user.id));

    const { rows: auditRows } = await db.query(
      `SELECT id_user, owner_id, action
       FROM audit_logs
       WHERE entity_type = 'chatbot' AND entity_id = $1
       ORDER BY id DESC LIMIT 1`,
      [created.body.data.id]
    );
    expect(auditRows[0]).toMatchObject({
      action: 'CHATBOT_CREATED',
    });
    expect(Number(auditRows[0].id_user)).toBe(Number(employee.id));
    expect(Number(auditRows[0].owner_id)).toBe(Number(user.id));
  });

  it('rejects cross-workspace sub-assistant links for KB, settings, and widgets', async () => {
    const employee = await createUser({ username: `studio-link-employee-${Date.now()}` });
    const anotherOwner = await createUser({ username: `studio-link-other-${Date.now()}` });
    await addChatbotMembership(user.id, employee.id);
    const employeeToken = await loginAs(employee);
    const contextHeaders = {
      Authorization: `Bearer ${employeeToken}`,
      'X-Owner-Context': String(user.id),
    };
    const { rows: assistants } = await db.query(
      `INSERT INTO sub_assistants (id_user, name)
       VALUES ($1, 'Other assistant')
       RETURNING id`,
      [anotherOwner.id]
    );
    const foreignAssistantId = assistants[0].id;

    const kb = await request(app)
      .post('/api/ai/chatbot/kb')
      .set(contextHeaders)
      .send({ name: 'Invalid KB', id_sub_assistant: foreignAssistantId });
    const settings = await request(app)
      .put('/api/ai/chatbot/chatbot/settings/web')
      .set(contextHeaders)
      .send({ id_sub_assistant: foreignAssistantId, is_enabled: true });
    const widget = await request(app)
      .post('/api/ai/chatbot/widgets')
      .set(contextHeaders)
      .send({ id_sub_assistant: foreignAssistantId, display_name: 'Invalid widget' });

    expect(kb.status).toBe(404);
    expect(settings.status).toBe(404);
    expect(widget.status).toBe(404);

    const { rows: linkedRows } = await db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM knowledge_bases WHERE id_user = $1) AS kb_count,
         (SELECT COUNT(*)::int FROM web_widget_configs WHERE id_user = $1) AS widget_count`,
      [user.id]
    );
    expect(linkedRows[0]).toEqual({ kb_count: 0, widget_count: 0 });
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
