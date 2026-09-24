import { describe, expect, it } from '@jest/globals';
import ZaloRateLimiter, { ZALO_PERSONAL_DELAY_HARD_FLOOR_MS } from '../zaloRateLimiter.js';

/**
 * 3 mức tốc độ gửi Zalo cá nhân, sàn cứng 30 giây (ZALO_PERSONAL_DELAY_HARD_FLOOR_MS).
 * Production đang đặt env chung: 80.000–150.000ms (~80–150 giây).
 */
const PROD_FLOOR_MIN = 80_000;
const PROD_FLOOR_MAX = 150_000;

const makeProdLimiter = () => new ZaloRateLimiter({
  ZALO_OUTBOUND_INTER_MESSAGE_MIN_MS_DEFAULT: PROD_FLOOR_MIN,
  ZALO_OUTBOUND_INTER_MESSAGE_MAX_MS_DEFAULT: PROD_FLOOR_MAX,
});

const prodPolicyFor = (hint) =>
  makeProdLimiter().resolveOutboundPolicy('zalo_personal', hint);

describe('resolveOutboundPolicy — 3 mức tốc độ gửi Zalo cá nhân và sàn cứng 30s', () => {
  it('hằng số sàn cứng là 30.000ms', () => {
    expect(ZALO_PERSONAL_DELAY_HARD_FLOOR_MS).toBe(30_000);
  });

  describe('môi trường Production (env 80/150 giây)', () => {
    it('NULL (không có hint hoặc ghi đè null) → dùng đúng mức cấu hình env 80/150', () => {
      const policyNullHint = prodPolicyFor(null);
      expect(policyNullHint.minDelayMs).toBe(PROD_FLOOR_MIN);
      expect(policyNullHint.maxDelayMs).toBe(PROD_FLOOR_MAX);

      const policyNullFields = prodPolicyFor({
        zaloPersonalOutboundDelayMinMs: null,
        zaloPersonalOutboundDelayMaxMs: null,
      });
      expect(policyNullFields.minDelayMs).toBe(PROD_FLOOR_MIN);
      expect(policyNullFields.maxDelayMs).toBe(PROD_FLOOR_MAX);
    });

    it('very_fast (30.000–60.000ms) → đúng 30/60 (không bị kẹp lên 80 hay 150)', () => {
      const policy = prodPolicyFor({
        zaloPersonalOutboundDelayMinMs: 30_000,
        zaloPersonalOutboundDelayMaxMs: 60_000,
      });
      expect(policy.minDelayMs).toBe(30_000);
      expect(policy.maxDelayMs).toBe(60_000);
    });

    it('fast (50.000–100.000ms) → đúng 50/100', () => {
      const policy = prodPolicyFor({
        zaloPersonalOutboundDelayMinMs: 50_000,
        zaloPersonalOutboundDelayMaxMs: 100_000,
      });
      expect(policy.minDelayMs).toBe(50_000);
      expect(policy.maxDelayMs).toBe(100_000);
    });

    it('giá trị nhỏ 5.000ms → kẹp về sàn cứng 30.000ms', () => {
      const policy = prodPolicyFor({
        zaloPersonalOutboundDelayMinMs: 5_000,
        zaloPersonalOutboundDelayMaxMs: 10_000,
      });
      expect(policy.minDelayMs).toBe(30_000);
      expect(policy.maxDelayMs).toBe(30_000);
    });

    it('ghi đè 0 giây KHÔNG hạ được xuống dưới sàn cứng 30.000ms', () => {
      const policy = prodPolicyFor({
        zaloPersonalOutboundDelayMinMs: 0,
        zaloPersonalOutboundDelayMaxMs: 0,
      });
      expect(policy.minDelayMs).toBe(30_000);
      expect(policy.maxDelayMs).toBe(30_000);
    });

    it('dmax < dmin → max = min sau khi kẹp sàn', () => {
      const policy = prodPolicyFor({
        zaloPersonalOutboundDelayMinMs: 40_000,
        zaloPersonalOutboundDelayMaxMs: 35_000,
      });
      expect(policy.minDelayMs).toBe(40_000);
      expect(policy.maxDelayMs).toBe(40_000);
    });

    it('ghi đè CHẬM hơn env (vd: 200.000–300.000ms) được tôn trọng', () => {
      const policy = prodPolicyFor({
        zaloPersonalOutboundDelayMinMs: 200_000,
        zaloPersonalOutboundDelayMaxMs: 300_000,
      });
      expect(policy.minDelayMs).toBe(200_000);
      expect(policy.maxDelayMs).toBe(300_000);
    });

    it('giá trị rác (âm, không phải số) bị bỏ qua, giữ nguyên mức cấu hình env', () => {
      for (const bad of [-1, 'abc', undefined, NaN]) {
        const policy = prodPolicyFor({
          zaloPersonalOutboundDelayMinMs: bad,
          zaloPersonalOutboundDelayMaxMs: bad,
        });
        expect(policy.minDelayMs).toBe(PROD_FLOOR_MIN);
        expect(policy.maxDelayMs).toBe(PROD_FLOOR_MAX);
      }
    });

    it('giới hạn tin/giờ theo tài khoản vẫn ghi đè được như cũ', () => {
      const policy = prodPolicyFor({ zaloPersonalOutboundPerHourLimit: 40 });
      expect(policy.limitPerWindow).toBe(40);
    });
  });
});
