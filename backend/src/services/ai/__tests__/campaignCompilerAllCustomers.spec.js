/**
 * PR-5 "Khách hàng đã lưu = TOÀN BỘ khách": nguồn `audience.type='db'` phải sinh node `interested_customers` loại `all`.
 *
 * Loại `both` cũ đọc `FROM customer_purchases JOIN customers` nên khách không có dòng mua/quan tâm bị loại (prod: 96.940 khách,
 * chỉ 3 có dòng) → trợ lý AI "gửi cho khách đã lưu" ra ~0 người. Test phủ MỌI nhánh kênh/lịch của compiler và khoá rằng không
 * nhánh nào quay lại `both`, cũng không đặt `interestedLimit` 1.000 (sẽ cắt danh sách còn 1.000 người).
 */
import { describe, expect, it } from '@jest/globals';
import { compileCampaign } from '../campaignCompiler.service.js';
import { detectLegacyAudienceFilters } from '../campaignIntent.schema.js';

const base = { version: 1, contentBrief: { topic: 'Khuyến mãi', locale: 'vi' }, audience: { type: 'db' } };

const CASES = [
  ['email gửi một lần', { ...base, channel: 'email', sender: { type: 'email_account', id: 7 }, schedule: { type: 'once' } }],
  ['email drip', { ...base, channel: 'email', sender: { type: 'email_account', id: 7 }, schedule: { type: 'drip', days: 3, slotsPerDay: 1 } }],
  ['zalo cá nhân gửi một lần', { ...base, channel: 'zalo', sender: { type: 'zalo_account', id: 12 }, audience: { type: 'db', recipientKind: 'phone' }, schedule: { type: 'once' } }],
  ['zalo cá nhân drip', { ...base, channel: 'zalo', sender: { type: 'zalo_account', id: 5 }, audience: { type: 'db', recipientKind: 'phone' }, schedule: { type: 'drip', days: 3, slotsPerDay: 1 } }],
];

describe('PR-5 compiler: nguồn db sinh interestedCustomerType = all', () => {
  it.each(CASES)('%s', (_name, intent) => {
    const graph = compileCampaign(intent);
    const audienceNode = graph.nodes.find((n) => n.nodeSubtype === 'interested_customers');
    expect(audienceNode).toBeDefined();
    expect(audienceNode.config.interestedCustomerType).toBe('all');
    // Không đặt trần 1.000: runtime lấy tới trần 50.000 của loại `all` khi thiếu interestedLimit.
    expect(audienceNode.config.interestedLimit).toBeUndefined();
  });

  it('detectLegacyAudienceFilters: node all (không limit hoặc limit 50.000) KHÔNG bị coi là bộ lọc', () => {
    const script = (config) => ({ nodes: [{ nodeSubtype: 'interested_customers', config }] });
    expect(detectLegacyAudienceFilters(script({ interestedCustomerType: 'all' })).hasFilters).toBe(false);
    expect(detectLegacyAudienceFilters(script({ interestedCustomerType: 'all', interestedLimit: 50000 })).hasFilters).toBe(false);
    // đối chứng: loại purchased vẫn là bộ lọc
    expect(detectLegacyAudienceFilters(script({ interestedCustomerType: 'purchased' })).hasFilters).toBe(true);
  });

  it('nhánh adapter (whatsapp, cờ bật) cũng dùng all', () => {
    const prev = process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED;
    process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED = 'true';
    try {
      const graph = compileCampaign({
        ...base,
        channel: 'whatsapp',
        sender: { type: 'whatsapp_session', sessionKey: '7-shopwa' },
        audience: { type: 'db', recipientKind: 'phone' },
        schedule: { type: 'once' },
      });
      const audienceNode = graph.nodes.find((n) => n.nodeSubtype === 'interested_customers');
      expect(audienceNode).toBeDefined();
      expect(audienceNode.config.interestedCustomerType).toBe('all');
    } finally {
      if (prev === undefined) delete process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED;
      else process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED = prev;
    }
  });
});
