import { describe, it, expect } from '@jest/globals';
import {
  buildAddonsPayload,
  isTopupOrderRow,
  mapTopupItemsFromConfig,
} from '../topupDisplay.util.js';

describe('topupDisplay.util', () => {
  describe('isTopupOrderRow', () => {
    it('true khi note=topup hoặc có topup_config', () => {
      expect(isTopupOrderRow({ note: 'topup', plan_id: null })).toBe(true);
      expect(isTopupOrderRow({ note: null, topup_config: { quantities: {} } })).toBe(true);
    });

    it('false khi đơn gói thường', () => {
      expect(isTopupOrderRow({ note: null, topup_config: null, plan_id: 1 })).toBe(false);
    });
  });

  describe('mapTopupItemsFromConfig', () => {
    it('bỏ qty = 0 và giữ itemKey gốc', () => {
      expect(
        mapTopupItemsFromConfig({
          quantities: { zalo_messages: 300, emails: 0, ai_credits: 50 },
        })
      ).toEqual([
        { itemKey: 'zalo_messages', qty: 300 },
        { itemKey: 'ai_credits', qty: 50 },
      ]);
    });

    it('nhận JSON string', () => {
      expect(
        mapTopupItemsFromConfig(JSON.stringify({ quantities: { emails: 1000 } }))
      ).toEqual([{ itemKey: 'emails', qty: 1000 }]);
    });
  });

  describe('buildAddonsPayload', () => {
    it('null khi cả ba = 0', () => {
      expect(buildAddonsPayload({ zaloMessages: 0, emails: 0, aiCredits: 0 })).toBeNull();
    });

    it('trả object đầy đủ kể cả khi một hạng mục = 0', () => {
      expect(
        buildAddonsPayload({
          zaloMessages: 300,
          emails: 0,
          aiCredits: 0,
          expiresAt: '2026-09-01',
        })
      ).toEqual({
        zaloMessages: 300,
        emails: 0,
        aiCredits: 0,
        expiresAt: '2026-09-01',
      });
    });
  });
});
