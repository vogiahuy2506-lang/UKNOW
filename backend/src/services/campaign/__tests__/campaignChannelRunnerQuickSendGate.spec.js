/**
 * W7a (PLAN_GUI_NHANH_TELEGRAM_2026-09-28 Việc 1) — cổng nhịp KHÔNG-NGỦ của gửi nhanh kênh adapter:
 * `evaluateAdapterSendGate` + `recordAdapterSendAttempt` (campaignChannelRunner.service.js). Hàm thuần theo
 * đồng hồ truyền vào (`nowMs`), không chạm DB.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  evaluateAdapterSendGate,
  recordAdapterSendAttempt,
  __recordSendForTest,
  __resetPerHourWindowForTest,
} from '../campaignChannelRunner.service.js';

const VN_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;
/** Epoch ms cho một giờ VN cụ thể (không phụ thuộc TZ tiến trình). */
function vn(hour, minute = 0) {
  return Date.UTC(2026, 8, 29, hour, minute, 0, 0) - VN_UTC_OFFSET_MS;
}

const TELEGRAM = {
  key: 'telegram',
  policy: { minDelayMs: 5000, maxDelayMs: 10000, perHourLimit: 100, quietHours: { startHour: 23, endHour: 6 } },
};
const WHATSAPP = {
  key: 'whatsapp',
  policy: { minDelayMs: 8000, maxDelayMs: 20000, perHourLimit: 60, quietHours: { startHour: 23, endHour: 6 } },
};

describe('evaluateAdapterSendGate', () => {
  beforeEach(() => __resetPerHourWindowForTest());

  it('chưa có lần gửi nào, ngoài giờ nghỉ -> ok', () => {
    expect(evaluateAdapterSendGate({ descriptor: TELEGRAM, accountKey: '7', nowMs: vn(10) })).toEqual({ ok: true });
  });

  it('23:30 giờ VN -> quiet_hours, waitMs = 23.400.000 (tới 06:00)', () => {
    const gate = evaluateAdapterSendGate({ descriptor: TELEGRAM, accountKey: '7', nowMs: vn(23, 30) });
    expect(gate).toEqual({ ok: false, reason: 'quiet_hours', waitMs: 23_400_000 });
  });

  it('giờ nghỉ được xét TRƯỚC giãn cách và trần giờ', () => {
    __recordSendForTest('telegram::7', vn(23, 29));
    const gate = evaluateAdapterSendGate({ descriptor: TELEGRAM, accountKey: '7', nowMs: vn(23, 30) });
    expect(gate.reason).toBe('quiet_hours');
  });

  it('có 100 dấu thời gian trong giờ qua (lượt chạy chiến dịch) -> rate_limited', () => {
    const now = vn(12);
    for (let i = 0; i < 100; i += 1) __recordSendForTest('telegram::7', now - 30 * 60 * 1000 - i);
    const gate = evaluateAdapterSendGate({ descriptor: TELEGRAM, accountKey: '7', nowMs: now });
    expect(gate.ok).toBe(false);
    expect(gate.reason).toBe('rate_limited');
    expect(gate.waitMs).toBeGreaterThan(0);
    expect(gate.waitMs).toBeLessThanOrEqual(30 * 60 * 1000);
  });

  it('trần giờ được xét TRƯỚC giãn cách', () => {
    const now = vn(12);
    for (let i = 0; i < 100; i += 1) __recordSendForTest('telegram::7', now - i);
    expect(evaluateAdapterSendGate({ descriptor: TELEGRAM, accountKey: '7', nowMs: now }).reason).toBe('rate_limited');
  });

  it('gửi lần 2 ngay sau lần 1 cùng tài khoản -> inter_message_delay, waitMs trong [min, max] của Telegram', () => {
    const now = vn(12);
    recordAdapterSendAttempt({ descriptor: TELEGRAM, accountKey: '7', nowMs: now });
    const gate = evaluateAdapterSendGate({ descriptor: TELEGRAM, accountKey: '7', nowMs: now });
    expect(gate.ok).toBe(false);
    expect(gate.reason).toBe('inter_message_delay');
    expect(gate.waitMs).toBeGreaterThanOrEqual(5000);
    expect(gate.waitMs).toBeLessThanOrEqual(10000);
  });

  it('WhatsApp: giãn cách 8-20s theo policy của chính kênh', () => {
    const now = vn(12);
    recordAdapterSendAttempt({ descriptor: WHATSAPP, accountKey: 'u1-abc', nowMs: now });
    const gate = evaluateAdapterSendGate({ descriptor: WHATSAPP, accountKey: 'u1-abc', nowMs: now });
    expect(gate.reason).toBe('inter_message_delay');
    expect(gate.waitMs).toBeGreaterThanOrEqual(8000);
    expect(gate.waitMs).toBeLessThanOrEqual(20000);
  });

  it('đã qua quá max giãn cách -> ok', () => {
    const now = vn(12);
    recordAdapterSendAttempt({ descriptor: TELEGRAM, accountKey: '7', nowMs: now - 10_001 });
    expect(evaluateAdapterSendGate({ descriptor: TELEGRAM, accountKey: '7', nowMs: now })).toEqual({ ok: true });
  });

  it('CHUNG cửa sổ với bộ chạy: dấu thời gian bộ chạy ghi (khoá `${key}::${accountKey}`) làm gửi nhanh bị hoãn', () => {
    const now = vn(12);
    __recordSendForTest('telegram::7', now);
    expect(evaluateAdapterSendGate({ descriptor: TELEGRAM, accountKey: '7', nowMs: now }).reason)
      .toBe('inter_message_delay');
  });

  it('tài khoản khác và kênh khác có cửa sổ RIÊNG', () => {
    const now = vn(12);
    recordAdapterSendAttempt({ descriptor: TELEGRAM, accountKey: '7', nowMs: now });
    expect(evaluateAdapterSendGate({ descriptor: TELEGRAM, accountKey: '8', nowMs: now })).toEqual({ ok: true });
    expect(evaluateAdapterSendGate({ descriptor: WHATSAPP, accountKey: '7', nowMs: now })).toEqual({ ok: true });
  });

  it('evaluate rồi record liền nhau: cặp gọi thứ hai bị chặn (hai tab không lọt cả hai)', () => {
    const now = vn(12);
    const first = evaluateAdapterSendGate({ descriptor: TELEGRAM, accountKey: '7', nowMs: now });
    if (first.ok) recordAdapterSendAttempt({ descriptor: TELEGRAM, accountKey: '7', nowMs: now });
    const second = evaluateAdapterSendGate({ descriptor: TELEGRAM, accountKey: '7', nowMs: now });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
  });
});
