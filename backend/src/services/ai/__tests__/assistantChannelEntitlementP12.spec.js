/**
 * P12 (PLAN_TG_WA_DAY_DU mục 19) — trợ lý AI tôn trọng quyền kênh ZALO theo gói của người đang chat: gói không có Zalo
 * (trần tài khoản = 0) thì trợ lý không dựng node Zalo, wizard không đưa Zalo vào thẻ chọn kênh, intent Zalo không
 * biên dịch được, câu lệnh gửi Zalo được trả "mua thêm slot / nâng gói", và node Zalo lọt vào kịch bản bị chặn CỨNG.
 * Gói CÓ Zalo (kể cả trần = 1) và ngoài ngữ cảnh (job nền, test cũ) giữ nguyên hành vi trước P12.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockGetEntitlements = jest.fn();
jest.unstable_mockModule('../../campaign/channelEntitlement.service.js', () => ({
  getChannelEntitlements: mockGetEntitlements,
}));

const flags = await import('../../campaign/campaignChannelFlags.util.js');
const { classifyUnsupportedSendRequest, classifyCapabilityProbe, formatAssistantCapabilities } = await import('../assistantCapabilities.js');
const { default: registry } = await import('../../campaign/campaignNodeRegistry.service.js');
const { normalizeChannel, buildChannelQuestion } = await import('../aiCampaignWizard.service.js');
const { isCompilableIntent } = await import('../campaignIntent.schema.js');
const { default: aiPromptResources } = await import('../aiPromptResources.service.js');
const { channelEntitlementContext } = await import('../../../middleware/channelEntitlement.middleware.js');

const ZALO_NODES = ['send_zalo_personal', 'send_zalo_group', 'send_zalo_friend_request', 'select_zalo_account', 'get_all_friends', 'get_all_groups'];
const NO_ZALO = { telegram: true, whatsapp: true, zalo: false };
const HAS_ZALO = { telegram: true, whatsapp: true, zalo: true };

const zaloIntent = {
  version: 1,
  channel: 'zalo',
  sender: { type: 'zalo_account', id: 2 },
  audience: { type: 'db', recipientKind: 'phone' },
  schedule: { type: 'once' },
};

describe('trợ lý AI — quyền kênh Zalo theo gói (P12)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('cờ util: Zalo bị chặn theo gói chỉ trong ngữ cảnh; kênh adapter không bị ảnh hưởng', () => {
    expect(flags.isChannelBlockedByPlan('zalo')).toBe(false);
    flags.runWithChannelEntitlements(NO_ZALO, () => {
      expect(flags.isChannelBlockedByPlan('zalo')).toBe(true);
      expect(flags.isChannelBlockedByPlan('telegram')).toBe(false);
      expect(flags.getChannelsBlockedByPlan()).toEqual([]);
      expect(flags.buildChannelNotInPlanMessage('zalo')).toMatch(/Gói của bạn không có kênh Zalo — mua thêm slot/);
    });
    flags.runWithChannelEntitlements(HAS_ZALO, () => {
      expect(flags.isChannelBlockedByPlan('zalo')).toBe(false);
    });
  });

  it('registry node: không Zalo -> mất 6 node Zalo, validate nói đúng lý do; có Zalo (limit=1) -> đủ; email luôn còn', () => {
    ZALO_NODES.forEach((subtype) => expect(registry.nodeTypes[subtype]).toBeTruthy());
    flags.runWithChannelEntitlements(NO_ZALO, () => {
      ZALO_NODES.forEach((subtype) => {
        expect(registry.nodeTypes[subtype]).toBeUndefined();
        const result = registry.validateNodeConfig(subtype, {});
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toMatch(/Gói của bạn không có kênh Zalo/);
      });
      expect(registry.nodeTypes.send_email).toBeTruthy();
    });
    flags.runWithChannelEntitlements(HAS_ZALO, () => {
      ZALO_NODES.forEach((subtype) => expect(registry.nodeTypes[subtype]).toBeTruthy());
    });
  });

  it('prompt registry + prompt cứng: không Zalo -> câu cấm dựng node Zalo, không liệt kê node Zalo; có Zalo -> y nguyên', () => {
    const normal = registry.buildNodeContextForAI();
    expect(normal).toContain('send_zalo_personal');
    expect(normal).not.toContain('KÊNH ZALO KHÔNG KHẢ DỤNG');
    expect(aiPromptResources.getBlockedZaloPromptNotice()).toBe('');
    flags.runWithChannelEntitlements(NO_ZALO, () => {
      const blocked = registry.buildNodeContextForAI();
      expect(blocked).toContain('KÊNH ZALO KHÔNG KHẢ DỤNG');
      expect(blocked).not.toContain('"nodeSubtype": "send_zalo_personal"');
      expect(aiPromptResources.getBlockedZaloPromptNotice()).toContain('KÊNH ZALO KHÔNG KHẢ DỤNG');
    });
  });

  it('wizard: không Zalo -> normalizeChannel bỏ zalo/zalo_group (email giữ), thẻ chọn kênh không có 2 lựa chọn Zalo', () => {
    expect(normalizeChannel('zalo')).toBe('zalo');
    flags.runWithChannelEntitlements(NO_ZALO, () => {
      expect(normalizeChannel('zalo')).toBeNull();
      expect(normalizeChannel('zalo_group')).toBeNull();
      expect(normalizeChannel('Zalo nhóm')).toBeNull();
      expect(normalizeChannel('email')).toBe('email');
      const values = buildChannelQuestion('vi').data.questions[0].options.map((o) => o.value);
      expect(values).toContain('email');
      expect(values).not.toContain('zalo');
      expect(values).not.toContain('zalo_group');
    });
    flags.runWithChannelEntitlements(HAS_ZALO, () => {
      expect(normalizeChannel('zalo_group')).toBe('zalo_group');
      const values = buildChannelQuestion('vi').data.questions[0].options.map((o) => o.value);
      expect(values).toEqual(expect.arrayContaining(['email', 'zalo', 'zalo_group']));
    });
  });

  it('isCompilableIntent: intent Zalo không biên dịch được khi gói không có Zalo; email vẫn được', () => {
    expect(isCompilableIntent(zaloIntent).ok).toBe(true);
    flags.runWithChannelEntitlements(NO_ZALO, () => {
      const result = isCompilableIntent(zaloIntent);
      expect(result.ok).toBe(false);
      expect(result.missing).toContain('channel');
      expect(isCompilableIntent({
        ...zaloIntent, channel: 'email', sender: { type: 'email_account', id: 1 }, audience: { type: 'sheet', url: 'https://docs.google.com/spreadsheets/d/1', recipientKind: 'email' },
      }).ok).toBe(true);
    });
    flags.runWithChannelEntitlements(HAS_ZALO, () => {
      expect(isCompilableIntent(zaloIntent).ok).toBe(true);
    });
  });

  it('câu lệnh gửi Zalo khi gói không có Zalo -> channel_not_in_plan; có Zalo/ngoài ngữ cảnh -> như cũ', () => {
    flags.runWithChannelEntitlements(NO_ZALO, () => {
      expect(classifyUnsupportedSendRequest('gửi tin zalo cho khách', 'vi'))
        .toMatchObject({ kind: 'unsupported', id: 'channel_not_in_plan', channel: 'zalo', label: 'Zalo' });
      expect(classifyCapabilityProbe('có gửi chiến dịch qua Zalo được không', 'vi'))
        .toMatchObject({ id: 'channel_not_in_plan', channel: 'zalo' });
    });
    flags.runWithChannelEntitlements(HAS_ZALO, () => {
      expect(classifyUnsupportedSendRequest('gửi tin zalo cho khách', 'vi')).toBeNull();
    });
    expect(classifyUnsupportedSendRequest('gửi tin zalo cho khách', 'vi')).toBeNull();
  });

  it('không chặn nhầm: câu còn nhắc Email (đa kênh) hoặc nói về CHATBOT Zalo đi tiếp như thường', () => {
    flags.runWithChannelEntitlements(NO_ZALO, () => {
      expect(classifyUnsupportedSendRequest('gửi chiến dịch qua email và zalo cho khách', 'vi')).toBeNull();
      expect(classifyUnsupportedSendRequest('chatbot có nối zalo được không', 'vi')).toBeNull();
    });
  });

  it('prompt năng lực: không Zalo -> nhãn "LÀM ĐƯỢC" không hứa Zalo; có Zalo -> giữ "Email và Zalo"', () => {
    const before = formatAssistantCapabilities('vi').split('## CHỈ HƯỚNG DẪN')[0];
    expect(before).toContain('Email và Zalo');
    flags.runWithChannelEntitlements(NO_ZALO, () => {
      const inside = formatAssistantCapabilities('vi').split('## CHỈ HƯỚNG DẪN')[0];
      expect(inside).not.toContain('Zalo');
      expect(inside).toContain('tạo chiến dịch qua Email');
    });
  });

  it('middleware: quyền thật từ getChannelEntitlements (zalo=false) đặt Zalo là bị chặn TRONG next(); limit=1 (zalo=true) thì không', async () => {
    mockGetEntitlements.mockResolvedValue({ ...NO_ZALO, limits: { zalo: 0 } });
    let blocked;
    await channelEntitlementContext({ user: { id: 1 } }, {}, () => { blocked = flags.isChannelBlockedByPlan('zalo'); });
    expect(blocked).toBe(true);

    mockGetEntitlements.mockResolvedValue({ ...HAS_ZALO, limits: { zalo: 1 } });
    await channelEntitlementContext({ user: { id: 1 } }, {}, () => { blocked = flags.isChannelBlockedByPlan('zalo'); });
    expect(blocked).toBe(false);
  });
});

describe('Zalo không phá hành vi cờ adapter', () => {
  let prevTg;
  beforeEach(() => { prevTg = process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED; process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED = 'true'; });
  afterEach(() => {
    if (prevTg === undefined) delete process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED;
    else process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED = prevTg;
  });

  it('Zalo bị chặn nhưng Telegram có quyền -> vẫn dựng được node send_telegram', () => {
    flags.runWithChannelEntitlements(NO_ZALO, () => {
      expect(registry.nodeTypes.send_telegram).toBeTruthy();
      expect(registry.nodeTypes.send_zalo_personal).toBeUndefined();
    });
  });
});
