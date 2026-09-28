/**
 * PLAN_PR7_NODE_TELEGRAM_TRINH_DUNG_2026-09-28 Việc 4 — palette/thả node chỉ cho send_telegram khi
 * cờ CAMPAIGN_CHANNEL_TELEGRAM_ENABLED bật, và chỉ áp dụng cho campaign_type 'mixed'.
 */
import { describe, expect, it } from 'vitest';
import { getAllowedActionNodeTypesByCampaignType } from '../campaignBuilderFlow';

describe('getAllowedActionNodeTypesByCampaignType — cờ Telegram', () => {
  it("campaign_type 'mixed' + cờ tắt (mặc định) -> KHÔNG có send_telegram", () => {
    const allowed = getAllowedActionNodeTypesByCampaignType('mixed');
    expect(allowed.has('send_telegram')).toBe(false);
  });

  it("campaign_type 'mixed' + telegramEnabled:false (tường minh) -> KHÔNG có send_telegram", () => {
    const allowed = getAllowedActionNodeTypesByCampaignType('mixed', { telegramEnabled: false });
    expect(allowed.has('send_telegram')).toBe(false);
  });

  it("campaign_type 'mixed' + telegramEnabled:true -> CÓ send_telegram, vẫn giữ email/zalo/zalo_group cũ", () => {
    const allowed = getAllowedActionNodeTypesByCampaignType('mixed', { telegramEnabled: true });
    expect(allowed.has('send_telegram')).toBe(true);
    expect(allowed.has('send_email')).toBe(true);
    expect(allowed.has('send_zalo_personal')).toBe(true);
    expect(allowed.has('send_zalo_friend_request')).toBe(true);
    expect(allowed.has('send_zalo_group')).toBe(true);
  });

  it.each(['email', 'zalo', 'zalo_group'])(
    "campaign_type '%s' + telegramEnabled:true -> VẪN KHÔNG có send_telegram (chỉ áp dụng cho 'mixed')",
    (type) => {
      const allowed = getAllowedActionNodeTypesByCampaignType(type, { telegramEnabled: true });
      expect(allowed.has('send_telegram')).toBe(false);
    }
  );

  it('không truyền options (gọi kiểu cũ) -> mặc định như cờ tắt, không throw', () => {
    const allowed = getAllowedActionNodeTypesByCampaignType('mixed');
    expect(() => allowed.has('send_telegram')).not.toThrow();
    expect(allowed.has('send_telegram')).toBe(false);
  });
});
