import { describe, expect, it } from '@jest/globals';
import {
  resolveSendSpeedFromRow,
  ZALO_SEND_SPEED_PRESETS,
  VALID_SEND_SPEED_KEYS,
} from '../zaloSendSpeed.util.js';

describe('zaloSendSpeed.util', () => {
  it('VALID_SEND_SPEED_KEYS chứa đúng 3 mức', () => {
    expect(VALID_SEND_SPEED_KEYS).toEqual(['safe', 'fast', 'very_fast']);
  });

  describe('resolveSendSpeedFromRow', () => {
    it('NULL / undefined cả min và max → safe', () => {
      expect(resolveSendSpeedFromRow(null, null)).toBe('safe');
      expect(resolveSendSpeedFromRow(undefined, undefined)).toBe('safe');
    });

    it('50.000 / 100.000 → fast', () => {
      expect(resolveSendSpeedFromRow(50_000, 100_000)).toBe('fast');
      expect(resolveSendSpeedFromRow('50000', '100000')).toBe('fast');
    });

    it('30.000 / 60.000 → very_fast', () => {
      expect(resolveSendSpeedFromRow(30_000, 60_000)).toBe('very_fast');
      expect(resolveSendSpeedFromRow('30000', '60000')).toBe('very_fast');
    });

    it('Giá trị bất kỳ khác (SQL tay) → custom', () => {
      expect(resolveSendSpeedFromRow(20_000, 50_000)).toBe('custom');
      expect(resolveSendSpeedFromRow(40_000, 80_000)).toBe('custom');
      expect(resolveSendSpeedFromRow(null, 60_000)).toBe('custom');
      expect(resolveSendSpeedFromRow(30_000, null)).toBe('custom');
      expect(resolveSendSpeedFromRow(0, 0)).toBe('custom');
    });
  });

  describe('ZALO_SEND_SPEED_PRESETS', () => {
    it('khớp định nghĩa 3 mức', () => {
      expect(ZALO_SEND_SPEED_PRESETS.safe.delayMinMs).toBeNull();
      expect(ZALO_SEND_SPEED_PRESETS.safe.delayMaxMs).toBeNull();

      expect(ZALO_SEND_SPEED_PRESETS.fast.delayMinMs).toBe(50_000);
      expect(ZALO_SEND_SPEED_PRESETS.fast.delayMaxMs).toBe(100_000);

      expect(ZALO_SEND_SPEED_PRESETS.very_fast.delayMinMs).toBe(30_000);
      expect(ZALO_SEND_SPEED_PRESETS.very_fast.delayMaxMs).toBe(60_000);
    });
  });
});
