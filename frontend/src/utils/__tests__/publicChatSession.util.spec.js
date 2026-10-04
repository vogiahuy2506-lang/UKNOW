/**
 * H-02 — phiên chat công khai + nhịp hỏi tin nhân viên trả lời tay (trang /chat/:id).
 * widget.js giữ bản sao các hằng số này (widgetAgentPoll.spec.js chạy widget thật); spec này ghim phía module.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  AGENT_LABEL,
  AGENT_POLL_BACKOFF_MS,
  AGENT_POLL_INTERVAL_MS,
  AGENT_POLL_MORE_MS,
  generateChatSessionId,
  idGreater,
  isValidMessageId,
  nextAgentPollDelay,
} from '../publicChatSession.util';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('hằng số nhịp hỏi', () => {
  it('ghim: 8 giây, giãn 16/32/60 giây, hasMore 1 giây, nhãn "Nhân viên"', () => {
    expect(AGENT_POLL_INTERVAL_MS).toBe(8000);
    expect([...AGENT_POLL_BACKOFF_MS]).toEqual([16000, 32000, 60000]);
    expect(AGENT_POLL_MORE_MS).toBe(1000);
    expect(AGENT_LABEL).toBe('Nhân viên');
  });
});

describe('nextAgentPollDelay', () => {
  it('thành công → 8 giây; hasMore → 1 giây', () => {
    expect(nextAgentPollDelay({ errorCount: 0 })).toBe(8000);
    expect(nextAgentPollDelay({ errorCount: 0, hasMore: true })).toBe(1000);
    expect(nextAgentPollDelay()).toBe(8000);
  });

  it('lỗi liên tiếp → 16, 32, 60, rồi giữ 60 giây (không giãn quá)', () => {
    expect([1, 2, 3, 4, 10].map((n) => nextAgentPollDelay({ errorCount: n }))).toEqual([16000, 32000, 60000, 60000, 60000]);
  });

  it('đang lỗi thì hasMore không rút ngắn chu kỳ', () => {
    expect(nextAgentPollDelay({ errorCount: 2, hasMore: true })).toBe(32000);
  });
});

describe('generateChatSessionId', () => {
  it('sess_ + 32 ký tự hex (128 bit) từ crypto; mỗi lần một giá trị khác; không dùng Math.random', () => {
    const random = vi.spyOn(Math, 'random');
    const ids = Array.from({ length: 50 }, () => generateChatSessionId());

    ids.forEach((id) => expect(id).toMatch(/^sess_[0-9a-f]{32}$/));
    expect(new Set(ids).size).toBe(50);
    expect(random).not.toHaveBeenCalled();
  });

  it('vừa khít cột session_id VARCHAR(100) và đủ dài để server chịu đọc (≥ 16 ký tự)', () => {
    const id = generateChatSessionId();
    expect(id.length).toBeGreaterThanOrEqual(16);
    expect(id.length).toBeLessThanOrEqual(100);
  });

  it('không có crypto → vẫn sinh được id đủ dài (dự phòng)', () => {
    vi.stubGlobal('crypto', undefined);
    const id = generateChatSessionId();
    expect(id.startsWith('sess_')).toBe(true);
    expect(id.length).toBeGreaterThanOrEqual(16);
  });
});

describe('idGreater / isValidMessageId', () => {
  it('so id BIGINT dạng chuỗi theo độ dài rồi theo chữ (không mất chính xác ở số lớn)', () => {
    expect(idGreater('10', '9')).toBe(true);
    expect(idGreater('9', '10')).toBe(false);
    expect(idGreater('41', '0')).toBe(true);
    expect(idGreater('41', '41')).toBe(false);
    expect(idGreater('9007199254740993', '9007199254740992')).toBe(true);
  });

  it('chỉ nhận chuỗi số nguyên không âm tối đa 18 chữ số', () => {
    expect(isValidMessageId('1')).toBe(true);
    expect(isValidMessageId(41)).toBe(true);
    expect(isValidMessageId('9'.repeat(18))).toBe(true);
    ['', 'abc', '-1', '1.5', '9'.repeat(19), null, undefined, '1; DROP'].forEach((bad) => {
      expect(isValidMessageId(bad)).toBe(false);
    });
  });
});
