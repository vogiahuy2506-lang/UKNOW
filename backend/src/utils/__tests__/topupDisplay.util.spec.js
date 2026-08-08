import { describe, it, expect } from '@jest/globals';
import {
  buildAddonsPayload,
  isTopupOrderRow,
  mapTopupItemsFromConfig,
  normalizeWalletAddon,
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

  describe('normalizeWalletAddon', () => {
    it('kẹp remaining sàn 0 khi âm', () => {
      expect(normalizeWalletAddon({ granted: 3, used: 5 })).toEqual({
        granted: 3,
        used: 5,
        remaining: 0,
      });
    });
  });

  describe('buildAddonsPayload', () => {
    it('null khi mọi hạng mục = 0', () => {
      expect(buildAddonsPayload({ zaloMessages: 0, emails: 0, aiCredits: 0 })).toBeNull();
    });

    it('consumable là object wallet; không còn expiresAt', () => {
      expect(
        buildAddonsPayload({
          zaloMessages: { granted: 300, used: 10, remaining: 290 },
          emails: 0,
          aiCredits: 0,
        })
      ).toEqual({
        zaloMessages: { granted: 300, used: 10, remaining: 290 },
        emails: { granted: 0, used: 0, remaining: 0 },
        aiCredits: { granted: 0, used: 0, remaining: 0 },
        zaloAccounts: 0,
        emailAccounts: 0,
        landingPages: 0,
        chatbots: 0,
        employees: 0,
      });
    });

    it('hiện khi chỉ mua slot cấu trúc', () => {
      expect(
        buildAddonsPayload({ chatbots: 1, employees: 2 })
      ).toEqual(expect.objectContaining({
        chatbots: 1,
        employees: 2,
        zaloMessages: { granted: 0, used: 0, remaining: 0 },
      }));
    });
  });
});
