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

  it('cloneFromSnapshot (mua Marketplace) chèn widget_key ngẫu nhiên hex, KHÔNG khớp ^chatbot_\\d+$ (và service không ghi đè nữa)', async () => {
    client.query.mockResolvedValue({ rows: [{ id: 88 }] });

    await chatbotCloneRepository.cloneFromSnapshot(client, 9, { chatbotName: 'Từ Marketplace' });

    expect(client.query.mock.calls[0][1][18]).toMatch(KEY_RE);
    expect(client.query.mock.calls[0][1][18]).not.toMatch(/^chatbot_\d+$/);
  });
});

describe('chatbot.repository.ensureWidgetKey — sinh key cho bot cũ thiếu key', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('bot allow_public_numeric_id=true thiếu key → UPDATE chỉ khi key còn trống, key = chatbot_<id>', async () => {
    query.mockResolvedValueOnce({ rows: [{ widget_key: null, allow_public_numeric_id: true }] });
    query.mockResolvedValueOnce({ rows: [{ widget_key: 'chatbot_2' }] });

    const key = await chatbotRepository.ensureWidgetKey(2);

    expect(key).toBe('chatbot_2');
    expect(query).toHaveBeenCalledTimes(2);
    const [sql, params] = query.mock.calls[1];
    expect(String(sql)).toMatch(/UPDATE custom_chatbots SET widget_key/i);
    expect(String(sql)).toMatch(/widget_key IS NULL OR btrim\(widget_key\) = ''/i);
    expect(params).toEqual([2, 'chatbot_2']);
  });

  it('bot MỚI (allow_public_numeric_id=false) thiếu key → key ngẫu nhiên, KHÔNG BAO GIỜ chatbot_<id>', async () => {
    query.mockResolvedValueOnce({ rows: [{ widget_key: '', allow_public_numeric_id: false }] });
    query.mockResolvedValueOnce({ rows: [{ widget_key: 'abcd1234' }] });

    const key = await chatbotRepository.ensureWidgetKey(7);

    expect(key).toBe('abcd1234');
    const candidate = query.mock.calls[1][1][1];
    expect(candidate).toMatch(KEY_RE);
    expect(candidate).not.toMatch(/^chatbot_\d+$/);
  });

  it('bot mới đụng UNIQUE liên tiếp → mọi ứng viên đều ngẫu nhiên, không rơi về chatbot_<id>', async () => {
    query.mockResolvedValueOnce({ rows: [{ widget_key: null, allow_public_numeric_id: false }] });
    const dup = () => Object.assign(new Error('duplicate'), { code: '23505' });
    query.mockRejectedValueOnce(dup()).mockRejectedValueOnce(dup()).mockRejectedValueOnce(dup());

    const key = await chatbotRepository.ensureWidgetKey(8);

    expect(key).toBeNull();
    for (const call of query.mock.calls.slice(1)) expect(call[1][1]).toMatch(KEY_RE);
  });

  it('bot đã có key → trả key đang có, KHÔNG ghi đè', async () => {
    query.mockResolvedValueOnce({ rows: [{ widget_key: 'existing1', allow_public_numeric_id: false }] });

    const key = await chatbotRepository.ensureWidgetKey(3);

    expect(key).toBe('existing1');
    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0][0])).toMatch(/SELECT widget_key, allow_public_numeric_id FROM custom_chatbots/i);
  });

  it('bot allow=true đụng UNIQUE (23505) → thử key ngẫu nhiên hex 8 ký tự', async () => {
    query.mockResolvedValueOnce({ rows: [{ widget_key: null, allow_public_numeric_id: true }] });
    query.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: '23505' }));
    query.mockResolvedValueOnce({ rows: [{ widget_key: 'second01' }] });

    const key = await chatbotRepository.ensureWidgetKey(4);

    expect(key).toBe('second01');
    expect(query.mock.calls[1][1][1]).toBe('chatbot_4');
    expect(query.mock.calls[2][1][1]).toMatch(KEY_RE);
  });

  it('lỗi khác 23505 → ném lên (controller bắt và giữ danh sách)', async () => {
    query.mockResolvedValueOnce({ rows: [{ widget_key: null, allow_public_numeric_id: false }] });
    query.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: '08006' }));
    await expect(chatbotRepository.ensureWidgetKey(5)).rejects.toThrow('boom');
  });
});

describe('chatbot.repository.findChatbotByWidgetKey — khoá chatbot_<số> chỉ khi bật allow_public_numeric_id', () => {
  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue({ rows: [] });
  });

  it('SQL chặn key khớp ^chatbot_[0-9]+$ trừ khi allow_public_numeric_id = true; key ngẫu nhiên đi qua nguyên', async () => {
    await chatbotRepository.findChatbotByWidgetKey('chatbot_7');
    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toContain("widget_key !~ '^chatbot_[0-9]+$' OR allow_public_numeric_id = true");
    expect(params).toEqual(['chatbot_7']);
  });

  // Mô phỏng ngữ nghĩa của điều kiện SQL trên 3 tình huống nghiệm thu (DB thật có ở integration).
  const passes = (key, allow) => !/^chatbot_[0-9]+$/.test(key) || allow === true;
  it.each([
    ['chatbot_7', false, false],
    ['chatbot_21', true, true],
    ['a1b2c3d4', false, true],
  ])('key %s, allow=%s → qua điều kiện: %s', (key, allow, expected) => {
    expect(passes(key, allow)).toBe(expected);
  });
});

describe('chatbot.repository.listChatbotsByUser — tham số khớp placeholder theo từng origin', () => {
  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue({ rows: [] });
  });

  // Lỗi có thật (phát hiện 04/10/2026 trên DB thật): origin=shared không có $2 nhưng vẫn đẩy tham số thứ hai →
  // pg báo "bind message supplies 2 parameters, but prepared statement requires 1" → lọc "Chia sẻ" luôn 500.
  it.each([
    ['shared', 1],
    ['shared_with_me', 1],
    ['self_created', 2],
    ['marketplace_purchased', 2],
    [null, 1],
  ])('origin=%s → %i tham số, đúng số placeholder trong câu SQL', async (origin, expected) => {
    await chatbotRepository.listChatbotsByUser(7, origin);

    const [sql, params] = query.mock.calls[0];
    expect(params).toHaveLength(expected);
    const placeholders = new Set(String(sql).match(/\$\d+/g) || []);
    expect(placeholders.size).toBe(expected);
  });

  it('SELECT tóm tắt triển khai + đếm tài liệu sẵn sàng/lỗi cho cột trái và Triển khai (S-05, S-17)', async () => {
    await chatbotRepository.listChatbotsByUser(7);

    const sql = String(query.mock.calls[0][0]);
    for (const col of [
      'document_count', 'document_error_count', 'zalo_personal_count', 'telegram_count',
      'whatsapp_count', 'facebook_count', 'web_active', 'is_locked', 'marketplace_listing_status',
    ]) {
      expect(sql).toMatch(new RegExp(`AS ${col}\\b`));
    }
    expect(sql).toMatch(/d\.status = 'ready'/);
    expect(sql).toMatch(/d\.status = 'error'/);
    // Facebook Messenger (khôi phục 05/10/2026): chỉ đếm dòng đang bật, đúng kênh.
    expect(sql).toMatch(/fbc\.channel_type = 'facebook'/);
    expect(sql).toMatch(/fbc\.is_active = true/);
  });
});
