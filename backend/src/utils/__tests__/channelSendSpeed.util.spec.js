/**
 * PLAN_TG_WA_DAY_DU_2026-09-29 P4 — preset tốc độ gửi + sàn cứng + ngưỡng cảnh báo cho Telegram/WhatsApp.
 * Bảng hằng số GHIM TỪNG PHẦN TỬ (đổi/bỏ một dòng phải đỏ đúng một ca).
 */
import { describe, it, expect } from '@jest/globals';
import {
  CHANNEL_SEND_SPEED_HARD_FLOOR_MS,
  CHANNEL_SEND_SPEED_KEYS,
  CHANNEL_SEND_SPEED_PRESETS,
  CHANNEL_DAILY_WARN_THRESHOLD,
  applyAccountDelayOverride,
  getChannelSendSpeedPreset,
  resolveChannelSendSpeedFromRow,
} from '../channelSendSpeed.util.js';

describe('ngưỡng cảnh báo gửi/ngày', () => {
  it('Telegram 150', () => expect(CHANNEL_DAILY_WARN_THRESHOLD.telegram).toBe(150));
  it('WhatsApp 100', () => expect(CHANNEL_DAILY_WARN_THRESHOLD.whatsapp).toBe(100));
  it('chỉ có hai kênh', () => expect(Object.keys(CHANNEL_DAILY_WARN_THRESHOLD).sort()).toEqual(['telegram', 'whatsapp']));
});

describe('sàn cứng giãn cách', () => {
  it('Telegram 2s', () => expect(CHANNEL_SEND_SPEED_HARD_FLOOR_MS.telegram).toBe(2_000));
  it('WhatsApp 3s', () => expect(CHANNEL_SEND_SPEED_HARD_FLOOR_MS.whatsapp).toBe(3_000));
});

describe('preset 3 mức', () => {
  it('đúng 3 khoá', () => expect([...CHANNEL_SEND_SPEED_KEYS]).toEqual(['safe', 'fast', 'very_fast']));

  it.each([
    ['telegram', 'safe', null, null],
    ['telegram', 'fast', 3_000, 6_000],
    ['telegram', 'very_fast', 2_000, 4_000],
    ['whatsapp', 'safe', null, null],
    ['whatsapp', 'fast', 5_000, 10_000],
    ['whatsapp', 'very_fast', 3_000, 6_000],
  ])('%s/%s = [%s, %s]', (channel, key, min, max) => {
    const preset = getChannelSendSpeedPreset(channel, key);
    expect(preset.delayMinMs).toBe(min);
    expect(preset.delayMaxMs).toBe(max);
  });

  it('KHÔNG preset nào (có ghi đè) dưới sàn cứng của kênh — ca sàn', () => {
    for (const channel of ['telegram', 'whatsapp']) {
      for (const key of CHANNEL_SEND_SPEED_KEYS) {
        const preset = CHANNEL_SEND_SPEED_PRESETS[channel][key];
        if (preset.delayMinMs == null) continue; // safe = theo env, không ghi đè
        expect(preset.delayMinMs).toBeGreaterThanOrEqual(CHANNEL_SEND_SPEED_HARD_FLOOR_MS[channel]);
        expect(preset.delayMaxMs).toBeGreaterThanOrEqual(preset.delayMinMs);
      }
    }
  });

  it('mức lạ / kênh lạ -> null', () => {
    expect(getChannelSendSpeedPreset('telegram', 'turbo')).toBeNull();
    expect(getChannelSendSpeedPreset('zalo', 'fast')).toBeNull();
    expect(getChannelSendSpeedPreset('telegram', 'constructor')).toBeNull();
  });
});

describe('resolveChannelSendSpeedFromRow', () => {
  it('NULL/NULL = safe; khớp preset = tên preset; lệch = custom', () => {
    expect(resolveChannelSendSpeedFromRow('telegram', null, null)).toBe('safe');
    expect(resolveChannelSendSpeedFromRow('telegram', 3000, 6000)).toBe('fast');
    expect(resolveChannelSendSpeedFromRow('telegram', 2000, 4000)).toBe('very_fast');
    expect(resolveChannelSendSpeedFromRow('whatsapp', 3000, 6000)).toBe('very_fast');
    expect(resolveChannelSendSpeedFromRow('whatsapp', 3000, 5000)).toBe('custom');
  });
});

describe('applyAccountDelayOverride', () => {
  const base = { minDelayMs: 5_000, maxDelayMs: 10_000, perHourLimit: 100, quietHours: { startHour: 23, endHour: 6 } };

  it('không có ghi đè -> trả nguyên policy env (KHÔNG kẹp lên sàn)', () => {
    expect(applyAccountDelayOverride('telegram', base, null)).toBe(base);
    expect(applyAccountDelayOverride('telegram', base, { delayMinMs: null, delayMaxMs: null })).toBe(base);
    const lowEnv = { ...base, minDelayMs: 1_000, maxDelayMs: 1_500 };
    expect(applyAccountDelayOverride('telegram', lowEnv, null)).toBe(lowEnv);
  });

  it('ghi đè hợp lệ -> đổi min/max, GIỮ nguyên các trường khác', () => {
    const p = applyAccountDelayOverride('telegram', base, { delayMinMs: 3_000, delayMaxMs: 6_000 });
    expect(p).toEqual({ ...base, minDelayMs: 3_000, maxDelayMs: 6_000 });
    expect(base.minDelayMs).toBe(5_000); // không sửa policy gốc
  });

  it('ghi đè dưới sàn (đặt tay bằng SQL) -> kẹp lên sàn của kênh', () => {
    const tg = applyAccountDelayOverride('telegram', base, { delayMinMs: 0, delayMaxMs: 500 });
    expect(tg.minDelayMs).toBe(2_000);
    expect(tg.maxDelayMs).toBe(2_000); // max kẹp theo min SAU khi kẹp
    const wa = applyAccountDelayOverride('whatsapp', base, { delayMinMs: 1_000, delayMaxMs: 2_000 });
    expect(wa.minDelayMs).toBe(3_000);
    expect(wa.maxDelayMs).toBe(3_000);
  });

  it('max KHÔNG bị kéo lên theo max của env (2–4s không thành 2–10s)', () => {
    const p = applyAccountDelayOverride('telegram', base, { delayMinMs: 2_000, delayMaxMs: 4_000 });
    expect(p.maxDelayMs).toBe(4_000);
  });

  it('thiếu một trong hai giá trị -> bỏ qua ghi đè', () => {
    expect(applyAccountDelayOverride('telegram', base, { delayMinMs: 3_000, delayMaxMs: null })).toBe(base);
  });
});
