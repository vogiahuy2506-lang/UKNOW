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
});
