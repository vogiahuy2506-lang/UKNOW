/**
 * formatTime.spec.js — test cho helper DRY dùng chung cho ConversationList +
 * TiktokConversationList. Đảm bảo khi 1 component đổi logic, component kia
 * KHÔNG lệch vì cùng import từ đây.
 */

import { describe, it, expect, vi } from 'vitest';
import { formatTime } from '../formatTime';

const t = (key, params) => {
  const map = {
    'inbox.justNow': 'Vừa xong',
    'inbox.timeMinutes': `${params?.n} phút`,
    'inbox.timeHours': `${params?.n} giờ`,
    'inbox.timeDays': `${params?.n} ngày`,
  };
  return map[key] || key;
};

describe('formatTime', () => {
  it('Empty input → empty string', () => {
    expect(formatTime('', t, 'vi')).toBe('');
    expect(formatTime(null, t, 'vi')).toBe('');
    expect(formatTime(undefined, t, 'vi')).toBe('');
  });

  it('< 1 phút → justNow', () => {
    const now = new Date().toISOString();
    expect(formatTime(now, t, 'vi')).toBe('Vừa xong');
  });

  it('< 60 phút → timeMinutes', () => {
    const date = new Date(Date.now() - 45 * 60 * 1000).toISOString();
    expect(formatTime(date, t, 'vi')).toBe('45 phút');
  });

  it('< 24 giờ → timeHours', () => {
    const date = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
    expect(formatTime(date, t, 'vi')).toBe('6 giờ');
  });

  it('< 7 ngày → timeDays', () => {
    const date = new Date(Date.now() - 3 * 86400 * 1000).toISOString();
    expect(formatTime(date, t, 'vi')).toBe('3 ngày');
  });

  it('≥ 7 ngày → toLocaleDateString (vi-VN)', () => {
    const date = new Date(Date.now() - 10 * 86400 * 1000).toISOString();
    const result = formatTime(date, t, 'vi');
    // Không assert text chính xác (locale phụ thuộc environment) — chỉ check
    // nó KHÔNG phải key i18n (đã fallback về locale string)
    expect(result).not.toMatch(/^inbox\./);
  });

  it('≥ 7 ngày với locale=en → en-US format', () => {
    const date = new Date(Date.now() - 10 * 86400 * 1000).toISOString();
    const result = formatTime(date, t, 'en');
    expect(result).not.toMatch(/^inbox\./);
  });

  it('Hàm t() chỉ được gọi với key hợp lệ (regression test cho logic)', () => {
    const spy = vi.fn(t);
    const date = new Date(Date.now() - 45 * 60 * 1000).toISOString();
    formatTime(date, spy, 'vi');
    // Có thể bị gọi nhiều lần (các if trả sớm) — chỉ cần key đầu tiên đúng
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0]).toBe('inbox.timeMinutes');
  });
});
