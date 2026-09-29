import { afterEach, describe, expect, it } from '@jest/globals';
import campaignChannelRegistry, {
  getEnabledAdapterChannelsForBuilder,
} from '../campaignChannelRegistry.service.js';

/**
 * PLAN_PR7_NODE_TELEGRAM_TRINH_DUNG_2026-09-28 Việc 1 — nguồn cho GET /api/campaigns/channels.
 * `isTelegramChannelEnabled()` đọc process.env LÚC GỌI (không cache lúc import) nên test đổi env
 * trực tiếp giữa các ca không cần reset module.
 */
describe('campaignChannelRegistry.getEnabledAdapterChannelsForBuilder', () => {
  afterEach(() => {
    delete process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED;
  });

  it('cờ tắt (hoặc không set) -> mảng rỗng', () => {
    delete process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED;
    expect(getEnabledAdapterChannelsForBuilder()).toEqual([]);
  });

  it('cờ bật -> có telegram với key/sendNodeSubtype/label, KHÔNG có policy/adapter (không lộ nội bộ)', () => {
    process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED = 'true';
    const channels = getEnabledAdapterChannelsForBuilder();
    expect(channels).toEqual([
      { key: 'telegram', sendNodeSubtype: 'send_telegram', label: 'Telegram' },
    ]);
    expect(channels[0]).not.toHaveProperty('policy');
    expect(channels[0]).not.toHaveProperty('adapter');
  });

  it('default export cũng có getEnabledAdapterChannelsForBuilder', () => {
    expect(typeof campaignChannelRegistry.getEnabledAdapterChannelsForBuilder).toBe('function');
  });
});

/** PLAN_WHATSAPP_DAY_DU_2026-09-29 PR-W4a — kênh WhatsApp cùng khuôn Telegram. */
describe('campaignChannelRegistry — WhatsApp (W4a)', () => {
  afterEach(() => {
    delete process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED;
    delete process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED;
  });

  it('cờ WhatsApp tắt -> không có kênh, send_whatsapp không phải node gửi đã biết', () => {
    expect(getEnabledAdapterChannelsForBuilder()).toEqual([]);
    expect(campaignChannelRegistry.isKnownSendSubtype('send_whatsapp')).toBe(false);
  });

  it('cờ bật -> whatsapp đúng hợp đồng, không continuous, quota đếm vào zalo', () => {
    process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED = 'true';
    expect(getEnabledAdapterChannelsForBuilder()).toEqual([
      { key: 'whatsapp', sendNodeSubtype: 'send_whatsapp', label: 'WhatsApp' },
    ]);
    const descriptor = campaignChannelRegistry.getAdapterDescriptorBySubtype('send_whatsapp');
    expect(descriptor).toMatchObject({
      key: 'whatsapp', engine: 'adapter', quotaChannel: 'zalo',
      continuousSupported: false, continuousReplay: false,
    });
    expect(campaignChannelRegistry.getContinuousSupportedSubtypes()).not.toContain('send_whatsapp');
    expect(campaignChannelRegistry.getContinuousReplaySubtypes()).not.toContain('send_whatsapp');
  });

  it('đếm quota Zalo luôn có whatsapp + telegram bất kể cờ; email không có', () => {
    expect(campaignChannelRegistry.getAdapterChannelKeysByQuotaChannel('zalo')).toEqual(
      expect.arrayContaining(['whatsapp', 'telegram'])
    );
    expect(campaignChannelRegistry.getAdapterChannelKeysByQuotaChannel('email')).toEqual([]);
  });

  it('hai cờ cùng bật -> cả hai kênh', () => {
    process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED = 'true';
    process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED = 'true';
    expect(getEnabledAdapterChannelsForBuilder().map((c) => c.key).sort()).toEqual(['telegram', 'whatsapp']);
  });

  // P2 (PLAN_TG_WA_DAY_DU mục 4.1): cổng "khách từ chối nhận tin" chỉ áp cho kênh có recipientKey là SĐT.
  // Ghim ở registry — spec runner tự dựng descriptor nên đột biến `recipientIsPhone: false` ở đây lọt (review 29/09).
  it('WhatsApp khai recipientIsPhone=true (kiểm từ chối nhận tin theo SĐT); Telegram thì không (chat id)', () => {
    process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED = 'true';
    process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED = 'true';
    expect(campaignChannelRegistry.getAdapterDescriptorBySubtype('send_whatsapp').recipientIsPhone).toBe(true);
    expect(campaignChannelRegistry.getAdapterDescriptorBySubtype('send_telegram').recipientIsPhone).toBeFalsy();
  });
});
