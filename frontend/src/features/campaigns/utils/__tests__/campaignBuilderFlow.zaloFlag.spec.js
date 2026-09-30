/**
 * P12 (PLAN_TG_WA_DAY_DU mục 19) — cờ `zaloEnabled` (quyền kênh Zalo theo gói) của getAllowedActionNodeTypesByCampaignType.
 * Mặc định TRUE: caller cũ không truyền cờ giữ nguyên hành vi (Zalo không biến mất với khách trả phí).
 */
import { describe, it, expect } from 'vitest';
import { getAllowedActionNodeTypesByCampaignType } from '../campaignBuilderFlow';

const ZALO_TYPES = ['send_zalo_personal', 'send_zalo_friend_request', 'send_zalo_group'];

describe('getAllowedActionNodeTypesByCampaignType — cờ Zalo (P12)', () => {
  it('không truyền cờ / zaloEnabled:true -> giữ nguyên các khối Zalo', () => {
    for (const opts of [undefined, {}, { zaloEnabled: true }]) {
      const mixed = getAllowedActionNodeTypesByCampaignType('mixed', opts);
      ZALO_TYPES.forEach((type) => expect(mixed.has(type)).toBe(true));
      expect([...getAllowedActionNodeTypesByCampaignType('zalo', opts)].sort()).toEqual(['send_zalo_friend_request', 'send_zalo_personal']);
      expect([...getAllowedActionNodeTypesByCampaignType('zalo_group', opts)]).toEqual(['send_zalo_group']);
    }
  });

  it('zaloEnabled:false -> mixed chỉ còn email (+ adapter đang bật); loại zalo/zalo_group -> rỗng; email không đổi', () => {
    const mixed = getAllowedActionNodeTypesByCampaignType('mixed', { zaloEnabled: false, telegramEnabled: true, whatsappEnabled: true });
    expect([...mixed].sort()).toEqual(['send_email', 'send_telegram', 'send_whatsapp']);
    expect(getAllowedActionNodeTypesByCampaignType('zalo', { zaloEnabled: false }).size).toBe(0);
    expect(getAllowedActionNodeTypesByCampaignType('zalo_group', { zaloEnabled: false }).size).toBe(0);
    expect([...getAllowedActionNodeTypesByCampaignType('email', { zaloEnabled: false })]).toEqual(['send_email']);
  });
});
