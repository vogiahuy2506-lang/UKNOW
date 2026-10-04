/**
 * S-03 (04/10/2026) — Chat Widget (mã script) của bot nhận qua "Gửi bản sao" luôn 404 vì bản sao có
 * `widget_key = NULL` còn widget chỉ tra theo `widget_key`.
 *  - Bản sao có key ngay khi tạo (chatbotClone.repository._insertClonedChatbot).
 *  - Bot cũ thiếu key được sinh khi đọc (chatbot.repository.ensureWidgetKey): chỉ ghi khi key còn trống.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query },
}));

const { default: chatbotRepository } = await import('../chatbot.repository.js');
const { default: chatbotCloneRepository } = await import('../chatbotClone.repository.js');

const KEY_RE = /^[0-9a-f]{8}$/;

describe('chatbotClone.repository — bản sao có widget_key ngay khi tạo', () => {
  const client = { query: jest.fn() };

  beforeEach(() => {
    client.query.mockReset();
    client.query.mockResolvedValue({ rows: [{ id: 77, name: 'Bản sao' }] });
  });

  it('_insertClonedChatbot truyền widget_key dạng chuỗi hex 8 ký tự (không còn NULL)', async () => {
    await chatbotCloneRepository._insertClonedChatbot(client, 5, { name: 'Bản sao' }, 'shared');

    const [sql, params] = client.query.mock.calls[0];
    expect(String(sql)).toMatch(/\bwidget_key\b/);
    // widget_key là cột thứ 19 trong INSERT (tham số $19), chỉ số 18.
    expect(params[18]).toMatch(KEY_RE);
  });

  it('hai lần chèn sinh hai key khác nhau', async () => {
    await chatbotCloneRepository._insertClonedChatbot(client, 5, { name: 'A' }, 'shared');
    await chatbotCloneRepository._insertClonedChatbot(client, 5, { name: 'B' }, 'shared');

    const keys = client.query.mock.calls.map((c) => c[1][18]);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('cloneFromSnapshot (mua Marketplace) cũng chèn với widget_key hợp lệ (sau đó được ghi đè chatbot_<id>)', async () => {
    client.query.mockResolvedValue({ rows: [{ id: 88 }] });

    await chatbotCloneRepository.cloneFromSnapshot(client, 9, { chatbotName: 'Từ Marketplace' });

    expect(client.query.mock.calls[0][1][18]).toMatch(KEY_RE);
  });
});

describe('chatbot.repository.ensureWidgetKey — sinh key cho bot cũ thiếu key', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('chỉ UPDATE khi key còn trống (NULL hoặc rỗng) và trả key vừa sinh', async () => {
    query.mockResolvedValueOnce({ rows: [{ widget_key: 'deadbeef' }] });

    const key = await chatbotRepository.ensureWidgetKey(2);

    expect(key).toBe('deadbeef');
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toMatch(/UPDATE custom_chatbots SET widget_key/i);
    expect(String(sql)).toMatch(/widget_key IS NULL OR btrim\(widget_key\) = ''/i);
    expect(params[0]).toBe(2);
    expect(params[1]).toMatch(KEY_RE);
  });

  it('bot đã có key (UPDATE không khớp dòng nào) → đọc và trả key đang có, KHÔNG ghi đè', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [{ widget_key: 'existing1' }] });

    const key = await chatbotRepository.ensureWidgetKey(3);

    expect(key).toBe('existing1');
    expect(String(query.mock.calls[1][0])).toMatch(/SELECT widget_key FROM custom_chatbots/i);
  });

  it('đụng UNIQUE (23505) → thử key khác', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: '23505' }));
    query.mockResolvedValueOnce({ rows: [{ widget_key: 'second01' }] });

    const key = await chatbotRepository.ensureWidgetKey(4);

    expect(key).toBe('second01');
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][1][1]).not.toBe(query.mock.calls[1][1][1]);
  });

  it('lỗi khác 23505 → ném lên (controller bắt và giữ danh sách)', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: '08006' }));
    await expect(chatbotRepository.ensureWidgetKey(5)).rejects.toThrow('boom');
  });
});
