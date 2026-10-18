/**
 * P12 (PLAN_TG_WA_DAY_DU mục 19) — cờ `zaloEnabled` (quyền kênh Zalo theo gói) của getAllowedActionNodeTypesByCampaignType.
 * Mặc định TRUE: caller cũ không truyền cờ giữ nguyên hành vi (Zalo không biến mất với khách trả phí).
 */
import { describe, it, expect } from 'vitest';
import { getAllowedActionNodeTypesByCampaignType, getAllowedDataNodeTypesByCampaignType } from '../campaignBuilderFlow';

const ZALO_TYPES = ['send_zalo_personal', 'send_zalo_friend_request', 'send_zalo_group'];

describe('getAllowedActionNodeTypesByCampaignType — cờ Zalo (P12)', () => {
  it('không truyền cờ / zaloEnabled:true -> giữ nguyên các khối Zalo', () => {
    for (const opts of [undefined, {}, { zaloEnabled: true }]) {
      const mixed = getAllowedActionNodeTypesByCampaignType('mixed', opts);
      ZALO_TYPES.forEach((type) => expect(mixed.has(type)).toBe(true));
      // PLAN_THU_CONG_GOP_4_KENH: loại zalo / zalo_group cùng một bảng khối (cá nhân + kết bạn + nhóm).
      const zaloFamily = ['send_zalo_friend_request', 'send_zalo_group', 'send_zalo_personal'];
      expect([...getAllowedActionNodeTypesByCampaignType('zalo', opts)].sort()).toEqual(zaloFamily);
      expect([...getAllowedActionNodeTypesByCampaignType('zalo_group', opts)].sort()).toEqual(zaloFamily);
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

describe('PLAN_THU_CONG_GOP_4_KENH — thẻ Zalo: bảng khối có cả khối cá nhân lẫn nhóm', () => {
  it.each(['zalo', 'zalo_group'])("loại '%s': khối dữ liệu có cả lấy bạn bè lẫn lấy nhóm + chọn tài khoản (chiến dịch zalo_group cũ vẫn đủ)", (type) => {
    const data = getAllowedDataNodeTypesByCampaignType(type);
    for (const nodeType of ['select_zalo_account', 'get_all_friends', 'get_all_groups', 'read_sheet', 'read_interested_customers']) {
      expect(data.has(nodeType)).toBe(true);
    }
    expect(data.has('send_zalo_group')).toBe(false);
  });

  it("email / whatsapp / telegram không nhận khối Zalo", () => {
    for (const type of ['email', 'whatsapp', 'telegram']) {
      const data = getAllowedDataNodeTypesByCampaignType(type);
      expect(data?.has('get_all_groups') ?? false).toBe(false);
    }
  });
});
