/**
 * PLAN_SUA_AI_DOT4_PR5 (A P1-5) — id số chỉ chat công khai được với chatbot ĐÃ CÓ lúc migrate (CSDL thật + HTTP thật).
 *
 * Gồm: migration 284 (backfill + chạy lại không bật lại cho bot mới), đường theo id số (bot cũ cờ true chạy, bot mới cờ
 * false 404 — không phân biệt "có nhưng cấm" với "không có"), đường theo widget_key luôn chạy cho cả hai loại bot,
 * link ngắn /<widget_key> chuyển tới /chat/<widget_key> (không lộ id số).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

// Bộ giới hạn theo người gửi / chatbot không phải đối tượng của file này: nới để mỗi ca không đụng trần.
process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_MIN = '1000';
process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_HOUR = '10000';
process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_DAY = '10000';
process.env.CHATBOT_RATE_LIMIT_PER_CHATBOT_PER_HOUR = '10000';

const mockChat = jest.fn();
jest.unstable_mockModule('../../src/services/ai/customChat.service.js', () => ({
  default: { chat: mockChat },
}));

const request = (await import('supertest')).default;
const { createApp } = await import('../../src/app.js');
const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_SQL = fs.readFileSync(
  path.resolve(__dirname, '../../migrations/284_custom_chatbots_allow_public_numeric_id.sql'),
  'utf8'
);

let app;
let owner;
let sessionCounter = 0;
const nextSession = () => `sess_numid_${Date.now()}_${++sessionCounter}_xxxxxxxx`;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  mockChat.mockReset();
  mockChat.mockResolvedValue({ content: 'Chào bạn!' });
  owner = await createUser({ username: `numid${Date.now()}` });
});

afterEach(async () => {
  // Migration tự thêm lại cột khi thiếu — mọi ca sau luôn thấy cột.
  await db.query(MIGRATION_SQL);
});

async function insertBot({ widgetKey, allowNumericId }) {
  const { rows } = await db.query(
    `INSERT INTO custom_chatbots (id_user, name, system_instruction, widget_key, is_active, allow_public_numeric_id)
     VALUES ($1, $2, 'BÍ MẬT', $3, true, $4) RETURNING *`,
    [owner.id, `Bot ${widgetKey}`, widgetKey, allowNumericId]
  );
  return rows[0];
}

describe('migration 284 — backfill + chạy lại không bật lại cho bot mới', () => {
  it('bot ĐANG CÓ lúc migrate → true; bot tạo SAU → false (mặc định); chạy migration LẠI không bật id số cho bot mới', async () => {
    // Dựng lại đúng trạng thái "trước migration": cột chưa có.
    await db.query('ALTER TABLE custom_chatbots DROP COLUMN allow_public_numeric_id');
    const { rows: before } = await db.query(
      `INSERT INTO custom_chatbots (id_user, name, widget_key) VALUES ($1, 'Bot cũ 1', 'wk_old_1'), ($1, 'Bot cũ 2', 'wk_old_2') RETURNING id`,
      [owner.id]
    );

    await db.query(MIGRATION_SQL);

    const flagOf = async (id) =>
      (await db.query('SELECT allow_public_numeric_id FROM custom_chatbots WHERE id = $1', [id])).rows[0].allow_public_numeric_id;
    for (const { id } of before) expect(await flagOf(id)).toBe(true);

    const { rows: after } = await db.query(
      `INSERT INTO custom_chatbots (id_user, name, widget_key) VALUES ($1, 'Bot mới', 'wk_new_1') RETURNING id`,
      [owner.id]
    );
    expect(await flagOf(after[0].id)).toBe(false);

    await db.query(MIGRATION_SQL);
    expect(await flagOf(after[0].id)).toBe(false);
    for (const { id } of before) expect(await flagOf(id)).toBe(true);
  });
});
