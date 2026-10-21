/**
 * setEnabled không còn chụp custom_chatbots.system_instruction vào dòng Baileys (29/09/2026):
 * bản chụp làm sửa hướng dẫn trong Studio không có hiệu lực trên WhatsApp.
 */
import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '..', '..', '..', 'config', 'database.js').replace(/\\/g, '/');

const dbMock = { query: jest.fn() };
let repo;

beforeEach(async () => {
  jest.resetModules();
  jest.unstable_mockModule(dbPath, () => ({ default: dbMock }));
  const mod = await import('../chatbotWhatsAppBaileys.repository.js');
  repo = mod.default;
  dbMock.query.mockReset();
});

describe('chatbotWhatsAppBaileys.repository setEnabled', () => {
  it('INSERT không còn subquery cb.system_instruction và không ghi system_instruction', async () => {
    dbMock.query.mockImplementation(async () => ({ rows: [{ id: 1, id_user: 7 }] }));
    await repo.setEnabled(7, '7-default', 55, true);
    const insert = dbMock.query.mock.calls
      .map((c) => String(c[0]))
      .find((q) => /INSERT INTO chatbot_whatsapp_baileys_settings/i.test(q));
    expect(insert).toBeDefined();
    expect(insert).not.toMatch(/system_instruction/);
    expect(insert).toMatch(/is_enabled = EXCLUDED\.is_enabled/);
  });

  it('chatbot không thuộc chủ → 404 và KHÔNG chạy INSERT (cả khi bật lẫn tắt)', async () => {
    for (const enabled of [true, false]) {
      dbMock.query.mockReset();
      dbMock.query.mockResolvedValueOnce({ rows: [] }); // custom_chatbots của người khác → không khớp
      await expect(repo.setEnabled(7, '7-default', 555, enabled)).rejects.toMatchObject({ status: 404 });
      const [sql, params] = dbMock.query.mock.calls[0];
      expect(sql).toMatch(/FROM custom_chatbots/);
      expect(sql).toMatch(/id_user = \$2::bigint/);
      // BẬT bắt buộc chatbot còn hoạt động; TẮT thì chỉ cần đúng chủ.
      expect(params).toEqual([555, 7, enabled]);
      expect(dbMock.query).toHaveBeenCalledTimes(1);
    }
  });

  it('session_key của người khác vẫn bị chặn 403 trước mọi truy vấn', async () => {
    await expect(repo.setEnabled(7, '8-default', 55, true)).rejects.toMatchObject({ status: 403 });
    expect(dbMock.query).not.toHaveBeenCalled();
  });
});

describe('chatbotWhatsAppBaileys.repository upsertSettings', () => {
  it('trợ lý phụ không thuộc chủ → 404 và KHÔNG chạy INSERT', async () => {
    dbMock.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }); // chatbot đúng chủ
    dbMock.query.mockResolvedValueOnce({ rows: [] }); // sub_assistants của người khác
    await expect(
      repo.upsertSettings(7, '7-default', { id_chatbot: 55, id_sub_assistant: 777, is_enabled: true })
    ).rejects.toMatchObject({ status: 404 });
    const [sql, params] = dbMock.query.mock.calls[1];
    expect(sql).toMatch(/FROM sub_assistants/);
    expect(params).toEqual([777, 7]);
    expect(dbMock.query.mock.calls.some(([q]) => /INSERT INTO chatbot_whatsapp_baileys_settings/.test(q))).toBe(false);
  });

  it('chatbot không thuộc chủ → 404 và KHÔNG chạy INSERT', async () => {
    dbMock.query.mockResolvedValueOnce({ rows: [] });
    await expect(
      repo.upsertSettings(7, '7-default', { id_chatbot: 555, is_enabled: false })
    ).rejects.toMatchObject({ status: 404 });
    expect(dbMock.query).toHaveBeenCalledTimes(1);
  });
});
