/**
 * H-02 — usePublicAgentMessages: trang /chat/:id hỏi tin nhân viên trả lời tay (cùng nhịp với widget.js).
 * 8 giây/lần; không bật → không hỏi; tab ẩn → dừng, hiện lại → hỏi ngay; lỗi → giãn 16/32/60 giây; khử trùng theo id;
 * afterId tiến theo id cuối; gỡ hook (rời trang) → dừng hẳn và huỷ lượt đang bay.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const getPublicAgentMessages = vi.fn();
vi.mock('../../features/chatbot/services/chatbotApi.service', () => ({
  default: { getPublicAgentMessages: (...args) => getPublicAgentMessages(...args) },
}));

const { default: usePublicAgentMessages } = await import('../usePublicAgentMessages');

const SESSION = 'sess_0123456789abcdef0123456789abcdef';
const msg = (id, content = `tin ${id}`, attachments = []) => ({
  id: String(id), role: 'agent', content, attachments, createdAt: '2026-10-04T03:00:00.000Z',
});
const ok = (messages = [], hasMore = false) => ({ data: { success: true, data: { messages, hasMore } } });

let hidden = false;
const setHidden = (value) => {
  hidden = value;
  document.dispatchEvent(new Event('visibilitychange'));
};
const advance = async (ms) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const afterIdOfCall = (n) => getPublicAgentMessages.mock.calls[n][1].afterId;

function mount(props = {}) {
  const onMessages = vi.fn();
  const utils = renderHook(
    (p) => usePublicAgentMessages(p),
    { initialProps: { chatbotId: '12', sessionId: SESSION, enabled: true, onMessages, ...props } },
  );
  return { onMessages, ...utils };
}

describe('usePublicAgentMessages', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    getPublicAgentMessages.mockResolvedValue(ok());
  });

  afterEach(() => {
    vi.useRealTimers();
    delete document.hidden;
  });

  it('enabled=false (chưa tải chatbot / khách chưa nhắn) → không hỏi lần nào', async () => {
    mount({ enabled: false });
    await advance(60000);
    expect(getPublicAgentMessages).not.toHaveBeenCalled();
  });

  it('thiếu sessionId hoặc chatbotId → không hỏi', async () => {
    mount({ sessionId: '' });
    mount({ chatbotId: '' });
    await advance(60000);
    expect(getPublicAgentMessages).not.toHaveBeenCalled();
  });

  it('bật → hỏi ngay (afterId 0, đúng chatbotId + sessionId), rồi 8 giây một lần', async () => {
    mount();
    await advance(1);
    expect(getPublicAgentMessages).toHaveBeenCalledTimes(1);
    expect(getPublicAgentMessages).toHaveBeenLastCalledWith('12', { sessionId: SESSION, afterId: '0' }, { signal: expect.any(AbortSignal) });

    await advance(7900);
    expect(getPublicAgentMessages).toHaveBeenCalledTimes(1);
    await advance(200);
    expect(getPublicAgentMessages).toHaveBeenCalledTimes(2);
    await advance(8000);
    expect(getPublicAgentMessages).toHaveBeenCalledTimes(3);
  });

  it('tin mới → onMessages đúng một lần; server trả lại cùng id thì không báo lại; afterId tiến theo id cuối', async () => {
    getPublicAgentMessages
      .mockResolvedValueOnce(ok([msg(41, 'Em là nhân viên')]))
      .mockResolvedValueOnce(ok([msg(41, 'Em là nhân viên'), msg(42, 'Anh để lại số nhé')]))
      .mockResolvedValue(ok());
    const { onMessages } = mount();

    await advance(1);
    expect(onMessages).toHaveBeenCalledTimes(1);
    expect(onMessages.mock.calls[0][0]).toEqual([expect.objectContaining({ id: '41', role: 'agent', content: 'Em là nhân viên' })]);

    await advance(8000);
    expect(afterIdOfCall(1)).toBe('41');
    expect(onMessages).toHaveBeenCalledTimes(2);
    expect(onMessages.mock.calls[1][0].map((m) => m.id)).toEqual(['42']); // 41 không báo lại

    await advance(8000);
    expect(afterIdOfCall(2)).toBe('42');
    expect(onMessages).toHaveBeenCalledTimes(2);
  });

  it('tin rỗng hoàn toàn bị bỏ nhưng afterId vẫn tiến; id không hợp lệ bị bỏ; tin chỉ có tệp vẫn báo', async () => {
    getPublicAgentMessages.mockResolvedValueOnce(ok([
      msg(8, '', [{ url: 'https://example.com/a.pdf', displayName: 'a.pdf' }]),
      msg(9, '', []),
      { id: 'abc', role: 'agent', content: 'id rác', attachments: [] },
      null,
    ])).mockResolvedValue(ok());
    const { onMessages } = mount();

    await advance(1);
    expect(onMessages.mock.calls[0][0].map((m) => m.id)).toEqual(['8']);
    await advance(8000);
    expect(afterIdOfCall(1)).toBe('9');
  });

  it('hasMore → hỏi lại sau 1 giây', async () => {
    getPublicAgentMessages.mockResolvedValueOnce(ok([msg(1), msg(2)], true)).mockResolvedValue(ok());
    mount();
    await advance(1);
    expect(getPublicAgentMessages).toHaveBeenCalledTimes(1);
    await advance(1100);
    expect(getPublicAgentMessages).toHaveBeenCalledTimes(2);
    expect(afterIdOfCall(1)).toBe('2');
  });

  it('tab ẩn → dừng; tab hiện lại → hỏi ngay', async () => {
    mount();
    await advance(1);
    expect(getPublicAgentMessages).toHaveBeenCalledTimes(1);

    act(() => setHidden(true));
    await advance(60000);
    expect(getPublicAgentMessages).toHaveBeenCalledTimes(1);

    act(() => setHidden(false));
    await advance(1);
    expect(getPublicAgentMessages).toHaveBeenCalledTimes(2);
  });

  it('lỗi liên tiếp → giãn 16 → 32 → 60 → 60 giây; thành công → về 8 giây', async () => {
    getPublicAgentMessages
      .mockRejectedValueOnce(new Error('500'))
      .mockRejectedValueOnce(new Error('500'))
      .mockRejectedValueOnce(new Error('429'))
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue(ok());
    mount();

    await advance(1);
    expect(getPublicAgentMessages).toHaveBeenCalledTimes(1);

    await advance(15900);
    expect(getPublicAgentMessages).toHaveBeenCalledTimes(1);
    await advance(200);
    expect(getPublicAgentMessages).toHaveBeenCalledTimes(2); // lỗi 2 → 32 giây

    await advance(31800);
    expect(getPublicAgentMessages).toHaveBeenCalledTimes(2);
    await advance(200);
    expect(getPublicAgentMessages).toHaveBeenCalledTimes(3); // lỗi 3 → 60 giây

    await advance(59800);
    expect(getPublicAgentMessages).toHaveBeenCalledTimes(3);
    await advance(200);
    expect(getPublicAgentMessages).toHaveBeenCalledTimes(4); // lỗi 4 → vẫn 60 giây

    await advance(59800);
    expect(getPublicAgentMessages).toHaveBeenCalledTimes(4);
    await advance(200);
    expect(getPublicAgentMessages).toHaveBeenCalledTimes(5); // thành công → 8 giây

    await advance(8100);
    expect(getPublicAgentMessages).toHaveBeenCalledTimes(6);
  });

  it('thân phản hồi sai hình dạng → coi là lỗi (giãn 16 giây)', async () => {
    getPublicAgentMessages.mockResolvedValue({ data: { success: true, data: { messages: 'x' } } });
    const { onMessages } = mount();
    await advance(1);
    await advance(8100);
    expect(getPublicAgentMessages).toHaveBeenCalledTimes(1);
    await advance(8000);
    expect(getPublicAgentMessages).toHaveBeenCalledTimes(2);
    expect(onMessages).not.toHaveBeenCalled();
  });

  it('không chạy chồng: lượt trước chưa xong thì không phát lượt mới', async () => {
    let release;
    getPublicAgentMessages.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(ok()); }));
    mount();
    await advance(1);
    expect(getPublicAgentMessages).toHaveBeenCalledTimes(1);

    act(() => setHidden(true));
    act(() => setHidden(false)); // hiện lại khi lượt cũ còn bay → không phát thêm
    await advance(30000);
    expect(getPublicAgentMessages).toHaveBeenCalledTimes(1);

    await act(async () => { release(); });
    await advance(8100);
    expect(getPublicAgentMessages).toHaveBeenCalledTimes(2);
  });

  it('gỡ hook (rời trang) → dừng hẳn, huỷ lượt đang bay, không báo tin về sau', async () => {
    let signal;
    let release;
    getPublicAgentMessages.mockImplementationOnce((_id, _q, opts) => {
      signal = opts.signal;
      return new Promise((resolve) => { release = () => resolve(ok([msg(5)])); });
    });
    const { onMessages, unmount } = mount();
    await advance(1);

    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => { release(); });
    await advance(60000);

    expect(getPublicAgentMessages).toHaveBeenCalledTimes(1);
    expect(onMessages).not.toHaveBeenCalled();
  });

  it('tắt enabled giữa chừng → dừng; bật lại → hỏi ngay, tiếp từ afterId cũ và KHÔNG báo trùng', async () => {
    getPublicAgentMessages
      .mockResolvedValueOnce(ok([msg(41, 'Em là nhân viên')]))
      .mockResolvedValue(ok([msg(41, 'Em là nhân viên')])); // server (giả) trả lại cả tin cũ
    const first = vi.fn();
    const { rerender } = mount({ onMessages: first });
    await advance(1);
    expect(first).toHaveBeenCalledTimes(1);

    rerender({ chatbotId: '12', sessionId: SESSION, enabled: false, onMessages: first });
    await advance(60000);
    expect(getPublicAgentMessages).toHaveBeenCalledTimes(1);

    rerender({ chatbotId: '12', sessionId: SESSION, enabled: true, onMessages: first });
    await advance(1);
    expect(getPublicAgentMessages).toHaveBeenCalledTimes(2);
    expect(afterIdOfCall(1)).toBe('41');
    expect(first).toHaveBeenCalledTimes(1); // 41 đã báo, không báo lại
  });

  it('đổi phiên (sessionId khác) → tiến độ làm mới: afterId về 0', async () => {
    getPublicAgentMessages.mockResolvedValueOnce(ok([msg(41)])).mockResolvedValue(ok());
    const onMessages = vi.fn();
    const { rerender } = mount({ onMessages });
    await advance(1);

    rerender({ chatbotId: '12', sessionId: 'sess_fedcba9876543210fedcba9876543210', enabled: true, onMessages });
    await advance(1);

    expect(afterIdOfCall(1)).toBe('0');
  });
});
