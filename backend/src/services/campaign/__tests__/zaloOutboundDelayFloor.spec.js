import { describe, expect, it } from '@jest/globals';
import ZaloRateLimiter from '../zaloRateLimiter.js';

/**
 * Ghi đè khoảng cách gửi theo từng tài khoản Zalo chỉ được phép làm CHẬM hơn
 * mức cấu hình chung, không bao giờ nhanh hơn.
 *
 * Trước đây nhánh này nhận thẳng giá trị từ DB (`dMin >= 0`), nên đặt 0 là bỏ qua
 * toàn bộ mặc định an toàn — đủ để đưa tài khoản Zalo của khách vào diện chống spam.
 */
const FLOOR_MIN = 20_000;
const FLOOR_MAX = 50_000;

const makeLimiter = () => new ZaloRateLimiter({
  ZALO_OUTBOUND_INTER_MESSAGE_MIN_MS_DEFAULT: FLOOR_MIN,
  ZALO_OUTBOUND_INTER_MESSAGE_MAX_MS_DEFAULT: FLOOR_MAX,
});

const policyFor = (hint) =>
  makeLimiter().resolveOutboundPolicy('zalo_personal', hint);

describe('resolveOutboundPolicy — sàn khoảng cách gửi Zalo cá nhân', () => {
  it('không có ghi đè → dùng đúng mức cấu hình chung', () => {
    const policy = policyFor(null);
    expect(policy.minDelayMs).toBe(FLOOR_MIN);
    expect(policy.maxDelayMs).toBe(FLOOR_MAX);
  });

  it('ghi đè 0 giây KHÔNG hạ được xuống dưới sàn', () => {
    const policy = policyFor({
      zaloPersonalOutboundDelayMinMs: 0,
      zaloPersonalOutboundDelayMaxMs: 0,
    });
    expect(policy.minDelayMs).toBe(FLOOR_MIN);
    expect(policy.maxDelayMs).toBe(FLOOR_MAX);
  });

  it('ghi đè nhanh hơn sàn bị kéo về sàn', () => {
    const policy = policyFor({
      zaloPersonalOutboundDelayMinMs: 5_000,
      zaloPersonalOutboundDelayMaxMs: 8_000,
    });
    expect(policy.minDelayMs).toBe(FLOOR_MIN);
    expect(policy.maxDelayMs).toBe(FLOOR_MAX);
  });

  it('ghi đè CHẬM hơn sàn được tôn trọng', () => {
    const policy = policyFor({
      zaloPersonalOutboundDelayMinMs: 90_000,
      zaloPersonalOutboundDelayMaxMs: 120_000,
    });
    expect(policy.minDelayMs).toBe(90_000);
    expect(policy.maxDelayMs).toBe(120_000);
  });

  it('max không bao giờ nhỏ hơn min sau khi kẹp sàn', () => {
    const policy = policyFor({
      zaloPersonalOutboundDelayMinMs: 200_000,
      zaloPersonalOutboundDelayMaxMs: 1_000,
    });
    expect(policy.minDelayMs).toBe(200_000);
    expect(policy.maxDelayMs).toBeGreaterThanOrEqual(policy.minDelayMs);
  });

  it('giá trị rác (âm, không phải số) bị bỏ qua, giữ nguyên sàn', () => {
    for (const bad of [-1, 'abc', null, undefined, NaN]) {
      const policy = policyFor({
        zaloPersonalOutboundDelayMinMs: bad,
        zaloPersonalOutboundDelayMaxMs: bad,
      });
      expect(policy.minDelayMs).toBe(FLOOR_MIN);
      expect(policy.maxDelayMs).toBe(FLOOR_MAX);
    }
  });

  it('giới hạn tin/giờ theo tài khoản vẫn ghi đè được như cũ', () => {
    const policy = policyFor({ zaloPersonalOutboundPerHourLimit: 40 });
    expect(policy.limitPerWindow).toBe(40);
  });
});
