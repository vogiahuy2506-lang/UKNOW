import { beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { createUser, truncateAll } from './helpers/db.js';
import chatbotActiveHoursService from '../../src/services/chatbot/chatbotActiveHours.service.js';

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

beforeAll(() => {
  app = createApp();
});

afterAll(async () => {
  await db.end();
});

beforeEach(async () => {
  await truncateAll();
  await chatbotActiveHoursService.clearAllForTest();
  user = await createUser({ username: `active-hours-${Date.now()}` });
  token = await loginAs(user);
  const { rows } = await db.query(
    `INSERT INTO custom_chatbots (id_user, name, widget_key)
     VALUES ($1, 'Bot test active hours', $2)
     RETURNING *`,
    [user.id, `ah_${Date.now()}`]
  );
  chatbot = rows[0];
});

describe('chatbot active hours integration', () => {
  describe('API update and validation', () => {
    it('saves valid active_hours configuration', async () => {
      const config = {
        start: '18:00',
        end: '05:00',
        outsideAction: 'message',
        outsideMessage: 'Hiện ngoài giờ hỗ trợ',
      };

      const res = await request(app)
        .put(`/api/ai/chatbot/custom-chatbots/${chatbot.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ active_hours: config });

      expect(res.status).toBe(200);
      expect(res.body.data.active_hours).toEqual({
        start: '18:00',
        end: '05:00',
        outsideAction: 'message',
        outsideMessage: 'Hiện ngoài giờ hỗ trợ',
      });

      // Kiểm tra trong DB
      const { rows } = await db.query(
        'SELECT active_hours FROM custom_chatbots WHERE id = $1',
        [chatbot.id]
      );
      expect(rows[0].active_hours).toEqual(config);
    });

    it('rejects invalid active_hours where start equals end', async () => {
      const res = await request(app)
        .put(`/api/ai/chatbot/custom-chatbots/${chatbot.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          active_hours: {
            start: '08:00',
            end: '08:00',
            outsideAction: 'silent',
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects invalid outsideAction message with empty text', async () => {
      const res = await request(app)
        .put(`/api/ai/chatbot/custom-chatbots/${chatbot.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          active_hours: {
            start: '08:00',
            end: '17:00',
            outsideAction: 'message',
            outsideMessage: '   ',
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('clears active_hours back to 24/7 when sent null', async () => {
      // Đặt trước 1 config
      await db.query(
        `UPDATE custom_chatbots SET active_hours = $1 WHERE id = $2`,
        [JSON.stringify({ start: '08:00', end: '17:00' }), chatbot.id]
      );

      const res = await request(app)
        .put(`/api/ai/chatbot/custom-chatbots/${chatbot.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ active_hours: null });

      expect(res.status).toBe(200);
      expect(res.body.data.active_hours).toBeNull();

      const { rows } = await db.query(
        'SELECT active_hours FROM custom_chatbots WHERE id = $1',
        [chatbot.id]
      );
      expect(rows[0].active_hours).toBeNull();
    });

    it('preserves active_hours when cloning chatbot', async () => {
      const recipient = await createUser({ username: `recipient-${Date.now()}` });
      const config = {
        start: '18:00',
        end: '05:00',
        outsideAction: 'message',
        outsideMessage: 'Ngoài giờ hỗ trợ',
      };
      await db.query(
        `UPDATE custom_chatbots SET active_hours = $1 WHERE id = $2`,
        [JSON.stringify(config), chatbot.id]
      );

      const res = await request(app)
        .post(`/api/ai/chatbot/custom-chatbots/${chatbot.id}/share`)
        .set('Authorization', `Bearer ${token}`)
        .send({ recipientEmail: recipient.email });

      expect(res.status).toBe(200);
      expect(res.body.data.clonedChatbot).toBeDefined();

      const { rows } = await db.query(
        'SELECT active_hours FROM custom_chatbots WHERE id = $1',
        [res.body.data.clonedChatbot.id]
      );
      expect(rows[0].active_hours).toEqual(config);
    });
  });

  describe('Chat widget outside active hours enforcement', () => {
    it('returns static outside message and does not call AI when chat is outside hours', async () => {
      const now = new Date();
      const vnMs = now.getTime() + 7 * 3600 * 1000;
      const vnHours = new Date(vnMs).getUTCHours();
      const startH = (vnHours + 2) % 24;
      const endH = (vnHours + 4) % 24;
      const pad = (n) => String(n).padStart(2, '0');

      const config = {
        start: `${pad(startH)}:00`,
        end: `${pad(endH)}:00`,
        outsideAction: 'message',
        outsideMessage: 'Chúng tôi đang ngoài giờ làm việc',
      };

      await db.query(
        `UPDATE custom_chatbots SET active_hours = $1 WHERE id = $2`,
        [JSON.stringify(config), chatbot.id]
      );

      // Gọi widget chat qua endpoint public
      const res = await request(app)
        .post(`/api/chatbot-public/custom-chatbot/${chatbot.widget_key}/chat`)
        .send({
          message: 'Chào shop',
          sessionId: `sess_${Date.now()}`,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.content).toBe('Chúng tôi đang ngoài giờ làm việc');
      expect(res.body.data.rateLimited).toBe(true);
      expect(res.body.data.reason).toBe('outside_active_hours');
    });

    it('remains silent when outside hours with action silent', async () => {
      const now = new Date();
      const vnMs = now.getTime() + 7 * 3600 * 1000;
      const vnHours = new Date(vnMs).getUTCHours();
      const startH = (vnHours + 2) % 24;
      const endH = (vnHours + 4) % 24;
      const pad = (n) => String(n).padStart(2, '0');

      const config = {
        start: `${pad(startH)}:00`,
        end: `${pad(endH)}:00`,
        outsideAction: 'silent',
        outsideMessage: '',
      };

      await db.query(
        `UPDATE custom_chatbots SET active_hours = $1 WHERE id = $2`,
        [JSON.stringify(config), chatbot.id]
      );

      const res = await request(app)
        .post(`/api/chatbot-public/custom-chatbot/${chatbot.widget_key}/chat`)
        .send({
          message: 'Alo shop ơi',
          sessionId: `sess_silent_${Date.now()}`,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.content).toBeNull();
      expect(res.body.data.rateLimited).toBe(true);
      expect(res.body.data.reason).toBe('outside_active_hours');
    });
  });
});
