/**
 * P9 bước 3 — trợ lý AI tôn trọng quyền kênh Telegram/WhatsApp theo gói của người đang chat: kênh có cờ bật nhưng gói
 * không có thì trợ lý coi như tắt (không dựng node, không liệt kê "LÀM ĐƯỢC"), và nói đúng lý do "mua thêm slot".
 * Ngoài ngữ cảnh (không có kho quyền) hành vi y nguyên trước P9.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockGetEntitlements = jest.fn();
jest.unstable_mockModule('../../campaign/channelEntitlement.service.js', () => ({
  getChannelEntitlements: mockGetEntitlements,
}));

const flags = await import('../../campaign/campaignChannelFlags.util.js');
const { classifyUnsupportedSendRequest, classifyCapabilityProbe, formatAssistantCapabilities } = await import('../assistantCapabilities.js');
const { default: campaignNodeRegistry } = await import('../../campaign/campaignNodeRegistry.service.js');
const { channelEntitlementContext } = await import('../../../middleware/channelEntitlement.middleware.js');

describe('trợ lý AI — quyền kênh theo gói (P9)', () => {
  let prevTg;
  let prevWa;
  beforeEach(() => {
    prevTg = process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED;
    prevWa = process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED;
    process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED = 'true';
    process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED = 'true';
    jest.clearAllMocks();
  });
  afterEach(() => {
    if (prevTg === undefined) delete process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED;
    else process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED = prevTg;
    if (prevWa === undefined) delete process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED;
    else process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED = prevWa;
  });

  it('cờ util: ngoài ngữ cảnh chỉ theo cờ; trong ngữ cảnh kênh bị chặn theo gói = tắt', () => {
    expect(flags.isTelegramCampaignChannelEnabled()).toBe(true);
    flags.runWithChannelEntitlements({ telegram: false, whatsapp: true }, () => {
      expect(flags.isTelegramCampaignChannelEnabled()).toBe(false);
      expect(flags.isWhatsAppCampaignChannelEnabled()).toBe(true);
      expect(flags.getEnabledAdapterCampaignChannels()).toEqual(['whatsapp']);
      expect(flags.getChannelsBlockedByPlan()).toEqual(['telegram']);
    });
    expect(flags.getChannelsBlockedByPlan()).toEqual([]);
  });

  it('cờ env TẮT thì không tính là "bị chặn theo gói" (chưa hỗ trợ ≠ gói chưa có)', () => {
    delete process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED;
    flags.runWithChannelEntitlements({ telegram: false, whatsapp: true }, () => {
      expect(flags.getChannelsBlockedByPlan()).toEqual([]);
    });
  });

  it('lệnh "gửi tin telegram" khi gói không có Telegram -> channel_not_in_plan; WhatsApp có quyền -> null như bình thường', () => {
    flags.runWithChannelEntitlements({ telegram: false, whatsapp: true }, () => {
      expect(classifyUnsupportedSendRequest('gửi tin telegram cho khách', 'vi'))
        .toMatchObject({ kind: 'unsupported', id: 'channel_not_in_plan', channel: 'telegram' });
      expect(classifyUnsupportedSendRequest('gửi tin whatsapp cho khách', 'vi')).toBeNull();
      expect(classifyCapabilityProbe('có gửi chiến dịch qua Telegram được không', 'vi'))
        .toMatchObject({ id: 'channel_not_in_plan', channel: 'telegram' });
    });
  });

  it('không có ngữ cảnh -> y như trước P9 (Telegram bật: lệnh gửi trả null)', () => {
    expect(classifyUnsupportedSendRequest('gửi tin telegram cho khách', 'vi')).toBeNull();
  });

  it('nói về CHATBOT nối Telegram thì không bị chặn theo gói ở nhánh gửi', () => {
    flags.runWithChannelEntitlements({ telegram: false, whatsapp: true }, () => {
      expect(classifyUnsupportedSendRequest('chatbot có nối telegram được không', 'vi')).toBeNull();
    });
  });

  it('prompt năng lực: kênh gói không có rời "LÀM ĐƯỢC"', () => {
    const before = formatAssistantCapabilities('vi').split('## CHỈ HƯỚNG DẪN')[0];
    expect(before).toContain('Telegram');
    flags.runWithChannelEntitlements({ telegram: false, whatsapp: true }, () => {
      const inside = formatAssistantCapabilities('vi').split('## CHỈ HƯỚNG DẪN')[0];
      expect(inside).not.toContain('Telegram');
      expect(inside).toContain('WhatsApp');
    });
  });

  it('registry node: gói không có Telegram -> không có node send_telegram, validate nói đúng lý do', () => {
    expect(campaignNodeRegistry.nodeTypes.send_telegram).toBeTruthy();
    flags.runWithChannelEntitlements({ telegram: false, whatsapp: true }, () => {
      expect(campaignNodeRegistry.nodeTypes.send_telegram).toBeUndefined();
      expect(campaignNodeRegistry.nodeTypes.send_whatsapp).toBeTruthy();
      const result = campaignNodeRegistry.validateNodeConfig('send_telegram', { steps: [{ message: 'x' }] });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/Gói của bạn không có kênh Telegram/);
    });
  });
});

describe('channelEntitlementContext (middleware)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED = 'true';
  });
  afterEach(() => {
    delete process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED;
  });

  it('gọi next() TRONG ngữ cảnh quyền của người dùng', async () => {
    mockGetEntitlements.mockResolvedValue({ telegram: false, whatsapp: true, limits: {} });
    let seen;
    await channelEntitlementContext({ user: { id: 1 } }, {}, () => { seen = flags.isTelegramCampaignChannelEnabled(); });
    expect(seen).toBe(false);
  });

  it('đọc quyền lỗi -> vẫn next(), không có ngữ cảnh (fail-open)', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetEntitlements.mockRejectedValue(new Error('x'));
    let seen;
    await channelEntitlementContext({ user: { id: 1 } }, {}, () => { seen = flags.isTelegramCampaignChannelEnabled(); });
    expect(seen).toBe(true);
    spy.mockRestore();
  });
});
