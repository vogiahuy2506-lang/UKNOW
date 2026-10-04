import { describe, it, expect, vi, beforeEach } from 'vitest';
import { slimChatHistory } from '../chatHistoryPayload.js';

vi.mock('../api.js', () => ({ default: { post: vi.fn(), patch: vi.fn(), get: vi.fn() } }));
import api from '../api.js';
import aiApi from '../aiApi.js';

/**
 * B-19: mỗi tin chat gửi nguyên mảng `messages` kèm `data.html` / `previousHtml` / `css` của các thẻ landing (hàng trăm KB mỗi trang) →
 * phiên có vài trang lớn thì chạm trần 5 MB của backend và chat của phiên đó hỏng (413). Backend không đọc mã nguồn trang từ lịch sử.
 */
describe('slimChatHistory (B-19)', () => {
  const BIG = '<div>'.padEnd(400_000, 'x');

  it('bỏ html / previousHtml / css khỏi data của thẻ landing; giữ các trường nhỏ khác (title, id…)', () => {
    const history = [
      { role: 'user', content: 'Tạo landing' },
      { role: 'assistant', type: 'landing_page', content: 'Đã tạo', id: 7, data: { title: 'T', html: BIG, previousHtml: BIG, css: 'body{}', layoutStatus: 'ok' } },
    ];
    const out = slimChatHistory(history);
    expect(out[1].data).toEqual({ title: 'T', layoutStatus: 'ok' });
    expect(out[1]).toMatchObject({ role: 'assistant', type: 'landing_page', content: 'Đã tạo', id: 7 });
    expect(JSON.stringify(out).length).toBeLessThan(1000);
  });

  it('KHÔNG đổi mảng / tin gốc (state của React giữ nguyên html để hiện thẻ)', () => {
    const history = [{ role: 'assistant', type: 'landing_page', data: { title: 'T', html: BIG } }];
    const snapshot = JSON.stringify(history);
    slimChatHistory(history);
    expect(JSON.stringify(history)).toBe(snapshot);
    expect(history[0].data.html).toBe(BIG);
  });

  it('tin không có khoá nặng giữ NGUYÊN tham chiếu; thẻ wizard (data nhỏ) không bị đụng', () => {
    const wizard = { role: 'assistant', type: 'ask_sender_account', data: { channel: 'zalo', accounts: [{ id: 1 }] } };
    const plain = { role: 'user', content: 'xin chào' };
    const out = slimChatHistory([wizard, plain]);
    expect(out[0]).toBe(wizard);
    expect(out[1]).toBe(plain);
  });

  it('đầu vào lạ (không phải mảng, data null / mảng) → trả nguyên, không ném lỗi', () => {
    expect(slimChatHistory(undefined)).toBeUndefined();
    expect(slimChatHistory(null)).toBeNull();
    const odd = [{ role: 'assistant', data: null }, { role: 'assistant', data: [1, 2] }, null];
    expect(() => slimChatHistory(odd)).not.toThrow();
    expect(slimChatHistory(odd)[0]).toBe(odd[0]);
  });
});

describe('aiApi.chat gửi lịch sử đã thu gọn (B-19)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.post.mockResolvedValue({ data: { success: true } });
  });

  it('payload.history không còn html/previousHtml/css; các trường khác của payload giữ nguyên', async () => {
    const history = [
      { role: 'user', content: 'Sửa trang giúp mình' },
      { role: 'assistant', type: 'landing_page', data: { title: 'T', html: '<div>x</div>', previousHtml: '<div>y</div>', css: 'a{}' } },
    ];
    await aiApi.chat(history, [{ tempId: 't1' }], 55, 'vi', null, null);
    const [url, payload] = api.post.mock.calls[0];
    expect(url).toBe('/ai/chat');
    expect(payload.history[1].data).toEqual({ title: 'T' });
    expect(payload).toMatchObject({ files: [{ tempId: 't1' }], sessionId: 55, locale: 'vi' });
    // mảng gốc của nơi gọi không bị đổi
    expect(history[1].data.html).toBe('<div>x</div>');
  });
});
