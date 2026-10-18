/**
 * PR-T3: nguồn `audience.type='db'` kèm `audience.tagIds` phải sinh node `interested_customers` có `interestedTagIds` — ở MỌI nhánh
 * kênh/lịch của compiler (email/Zalo, một lần/drip, adapter WhatsApp). Một nhánh làm rơi trường này = chiến dịch "chỉ khách VIP" gửi cho
 * TẤT CẢ khách. Không có tag thì node phải y như cũ (không thêm khoá).
 */
import { describe, expect, it } from '@jest/globals';
import { compileCampaign } from '../campaignCompiler.service.js';

const base = { version: 1, contentBrief: { topic: 'Khuyến mãi', locale: 'vi' } };

const CASES = [
  ['email gửi một lần', { channel: 'email', sender: { type: 'email_account', id: 7 }, schedule: { type: 'once' }, recipientKind: 'email' }],
  ['email drip', { channel: 'email', sender: { type: 'email_account', id: 7 }, schedule: { type: 'drip', days: 3, slotsPerDay: 1 }, recipientKind: 'email' }],
  ['zalo cá nhân gửi một lần', { channel: 'zalo', sender: { type: 'zalo_account', id: 12 }, schedule: { type: 'once' }, recipientKind: 'phone' }],
  ['zalo cá nhân drip', { channel: 'zalo', sender: { type: 'zalo_account', id: 5 }, schedule: { type: 'drip', days: 3, slotsPerDay: 1 }, recipientKind: 'phone' }],
];

const intentOf = ({ recipientKind, ...rest }, audienceExtra = {}) => ({
  ...base,
  ...rest,
  audience: { type: 'db', recipientKind, ...audienceExtra },
});
const audienceNodeOf = (graph) => graph.nodes.find((node) => node.nodeSubtype === 'interested_customers');

describe('PR-T3 compiler: audience.tagIds -> interestedTagIds', () => {
  it.each(CASES)('%s: có tag -> node mang interestedTagIds, vẫn loại all', (_name, spec) => {
    const node = audienceNodeOf(compileCampaign(intentOf(spec, { tagIds: [4, 9] })));
    expect(node.config).toEqual({ interestedCustomerType: 'all', interestedTagIds: [4, 9] });
  });

  it.each(CASES)('%s: không có tag (hoặc rỗng) -> node y như cũ, không có khoá interestedTagIds', (_name, spec) => {
    expect(audienceNodeOf(compileCampaign(intentOf(spec))).config).toEqual({ interestedCustomerType: 'all' });
    expect(audienceNodeOf(compileCampaign(intentOf(spec, { tagIds: [] }))).config).toEqual({ interestedCustomerType: 'all' });
  });

  it('id tag rác (chuỗi, âm, trùng) bị lọc, giữ số nguyên dương không trùng', () => {
    const node = audienceNodeOf(compileCampaign(intentOf(CASES[0][1], { tagIds: [4, '4', -1, 'x', 0, 9.5, 7] })));
    expect(node.config.interestedTagIds).toEqual([4, 7]);
  });

  it('nhánh adapter (whatsapp, cờ bật) cũng mang interestedTagIds', () => {
    const prev = process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED;
    process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED = 'true';
    try {
      const graph = compileCampaign(intentOf(
        { channel: 'whatsapp', sender: { type: 'whatsapp_session', sessionKey: '7-shopwa' }, schedule: { type: 'once' }, recipientKind: 'phone' },
        { tagIds: [4] },
      ));
      expect(audienceNodeOf(graph).config).toEqual({ interestedCustomerType: 'all', interestedTagIds: [4] });
    } finally {
      if (prev === undefined) delete process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED;
      else process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED = prev;
    }
  });
});
