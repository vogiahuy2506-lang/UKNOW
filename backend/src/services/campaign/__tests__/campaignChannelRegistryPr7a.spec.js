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
