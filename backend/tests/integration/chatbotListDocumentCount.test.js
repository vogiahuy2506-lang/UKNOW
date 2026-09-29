import { beforeEach, describe, expect, it } from '@jest/globals';
import db from '../../src/config/database.js';
import chatbotRepository from '../../src/repositories/ai/chatbot.repository.js';
import { createUser, truncateAll } from './helpers/db.js';

async function insertBot(userId, name) {
  const { rows } = await db.query(
    `INSERT INTO custom_chatbots (id_user, name, widget_key)
     VALUES ($1, $2, $3) RETURNING id`,
    [userId, name, `dc_${name}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`]
  );
  return rows[0].id;
}

async function insertDoc(botId, ownerId, key, status) {
  await db.query(
    `INSERT INTO custom_chatbot_documents
      (chatbot_id, owner_user_id, source_type, source_key, title, status)
     VALUES ($1, $2, 'text', $3, $3, $4)`,
    [botId, ownerId, key, status]
  );
}

describe('listChatbotsByUser document_count', () => {
  let userA;
  let a1;
  let a2;
  let b1;

  beforeEach(async () => {
    await truncateAll();
    userA = await createUser({ username: `dc-a-${Date.now()}` });
    const userB = await createUser({ username: `dc-b-${Date.now()}` });
    a1 = await insertBot(userA.id, 'A1');
    a2 = await insertBot(userA.id, 'A2');
    b1 = await insertBot(userB.id, 'B1');
    await insertDoc(a1, userA.id, 'd1', 'ready');
    await insertDoc(a1, userA.id, 'd2', 'processing');
    await insertDoc(a1, userA.id, 'd3', 'error');
    await insertDoc(b1, userB.id, 'e1', 'ready');
    await insertDoc(b1, userB.id, 'e2', 'ready');
  });

  it('dem moi trang thai theo tung chatbot, khong lan sang bot khac/nguoi khac', async () => {
    const rows = await chatbotRepository.listChatbotsByUser(userA.id);
    const byId = Object.fromEntries(rows.map((r) => [String(r.id), r]));
    expect(rows).toHaveLength(2);
    expect(byId[String(b1)]).toBeUndefined();
    expect(byId[String(a1)].document_count).toBe(3);
    expect(byId[String(a2)].document_count).toBe(0);
    expect(typeof byId[String(a1)].document_count).toBe('number');
  });

  it('loc origin=self_created van co document_count dung', async () => {
    const rows = await chatbotRepository.listChatbotsByUser(userA.id, 'self_created');
    const byId = Object.fromEntries(rows.map((r) => [String(r.id), r]));
    expect(byId[String(a1)].document_count).toBe(3);
    expect(byId[String(a2)].document_count).toBe(0);
  });
});
