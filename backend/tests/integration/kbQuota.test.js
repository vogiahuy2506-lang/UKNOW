import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import db from '../../src/config/database.js';
import {
  getWorkspaceKbUsage,
  withKbQuotaLock,
} from '../../src/services/storage/kbQuota.service.js';
import { createUser, truncateAll } from './helpers/db.js';

const previousEnforcement = process.env.STORAGE_KB_LIMIT_ENABLED;

beforeEach(async () => {
  await truncateAll();
  process.env.STORAGE_KB_LIMIT_ENABLED = 'true';
});

afterAll(() => {
  if (previousEnforcement === undefined) {
    delete process.env.STORAGE_KB_LIMIT_ENABLED;
  } else {
    process.env.STORAGE_KB_LIMIT_ENABLED = previousEnforcement;
  }
});

async function createKnowledgeBase(ownerUserId) {
  const { rows } = await db.query(
    `INSERT INTO knowledge_bases (id_user, name)
     VALUES ($1, 'KB quota integration')
     RETURNING id`,
    [ownerUserId]
  );
  return rows[0].id;
}

describe('KB workspace quota', () => {
  it('sums documents and extracted chars across both KB systems', async () => {
    const owner = await createUser({ username: 'kb_usage_owner' });
    const kbId = await createKnowledgeBase(owner.id);
    const { rows: chatbots } = await db.query(
      `INSERT INTO custom_chatbots (id_user, name)
       VALUES ($1, 'KB quota chatbot')
       RETURNING id`,
      [owner.id]
    );

    await db.query(
      `INSERT INTO kb_documents
        (id_kb, id_user, title, source_type, content_text, status, extracted_chars)
       VALUES ($1, $2, 'Legacy', 'text', 'legacy text', 'ready', 11)`,
      [kbId, owner.id]
    );
    await db.query(
      `INSERT INTO custom_chatbot_documents
        (chatbot_id, owner_user_id, source_type, source_key, title, status, extracted_chars)
       VALUES ($1, $2, 'text', 'custom', 'Custom', 'processing', 17)`,
      [chatbots[0].id, owner.id]
    );

    const usage = await getWorkspaceKbUsage(owner.id);
    expect(usage.documentCount).toBe(2);
    expect(usage.extractedChars).toBe(28);
  });

  it('serializes concurrent positive deltas so only one document reaches the limit', async () => {
    const owner = await createUser({ username: 'kb_lock_owner' });
    const kbId = await createKnowledgeBase(owner.id);
    await db.query(
      `UPDATE plans
          SET max_kb_documents = 1,
              max_kb_extracted_chars = 1000
        WHERE id = $1`,
      [owner.active_plan_id]
    );

    const claimDocument = (title) => withKbQuotaLock(owner.id, async ({ client, assertDelta }) => {
      assertDelta({ documentDelta: 1, charDelta: 10 });
      await client.query(`SELECT pg_sleep(0.05)`);
      await client.query(
        `INSERT INTO kb_documents
          (id_kb, id_user, title, source_type, content_text, status, extracted_chars)
         VALUES ($1, $2, $3, 'text', '0123456789', 'pending', 10)`,
        [kbId, owner.id, title]
      );
    });

    const results = await Promise.allSettled([
      claimDocument('A'),
      claimDocument('B'),
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason.code).toBe('KB_DOCUMENT_LIMIT_EXCEEDED');

    const usage = await getWorkspaceKbUsage(owner.id);
    expect(usage.documentCount).toBe(1);
    expect(usage.extractedChars).toBe(10);
  });
});
