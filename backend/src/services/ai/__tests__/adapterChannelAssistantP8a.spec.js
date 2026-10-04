/**
 * P8a (PLAN_TG_WA_DAY_DU mục 11) — Trợ lý AI dựng chiến dịch Telegram/WhatsApp.
 * Registry node + cờ, intent, compiler, ghép/điền nội dung, wizard, thẻ xác nhận, tài nguyên prompt.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const draftRepo = { findDefaultEmailSettingId: jest.fn(), findDefaultZaloSettingId: jest.fn() };
const telegramRepo = { getAccountById: jest.fn(), listAccountsByUser: jest.fn(), countOpenConversationsByAccountIds: jest.fn() };
const whatsappConversationRepo = { countOpenConversationsBySessionKeys: jest.fn() };
const whatsappService = { getSession: jest.fn(), listSessions: jest.fn() };

jest.unstable_mockModule('../../../repositories/ai/aiCampaignDraft.repository.js', () => ({ default: draftRepo }));
jest.unstable_mockModule('../../../repositories/email/emailTemplate.repository.js', () => ({ default: { findById: jest.fn() } }));
jest.unstable_mockModule('../../../repositories/zalo/zaloTemplate.repository.js', () => ({ default: { findById: jest.fn() } }));
jest.unstable_mockModule('../../../repositories/campaign/campaignEmailSender.repository.js', () => ({ default: { findEmailSettingsById: jest.fn() } }));
jest.unstable_mockModule('../../../repositories/campaign/campaignZaloSender.repository.js', () => ({ default: { findCampaignZaloAccount: jest.fn() } }));
jest.unstable_mockModule('../../../repositories/chatbot/chatbotTelegram.repository.js', () => ({ default: telegramRepo }));
jest.unstable_mockModule('../../chatbot/whatsappBaileys.service.js', () => whatsappService);
// whatsapp.campaignChannel.js cũng import `extractPhoneFromExternalId` từ module này — mock phải giữ đủ export.
jest.unstable_mockModule('../../../repositories/chatbot/whatsappCampaignConversation.repository.js', () => ({
  default: whatsappConversationRepo,
  extractPhoneFromExternalId: (externalId) => String(externalId ?? '').split(':').pop().trim(),
}));

const registry = (await import('../../campaign/campaignNodeRegistry.service.js')).default;
const channelFlags = await import('../../campaign/campaignChannelFlags.util.js');
const channelRegistry = await import('../../campaign/campaignChannelRegistry.service.js');
const { compileCampaign } = await import('../campaignCompiler.service.js');
const { isCompilableIntent, deriveIntent } = await import('../campaignIntent.schema.js');
const { mergeCompiledWithContent, assertNoEmptyContent } = await import('../campaignScriptMerge.service.js');
const { applySlotsToGraph, buildSlotFillingPrompt } = await import('../campaignSlotFiller.service.js');
const wizard = await import('../aiCampaignWizard.service.js');
const confirmation = (await import('../campaignConfirmation.service.js')).default;
const aiPromptResources = (await import('../aiPromptResources.service.js')).default;

const TG_FLAG = 'CAMPAIGN_CHANNEL_TELEGRAM_ENABLED';
const WA_FLAG = 'CAMPAIGN_CHANNEL_WHATSAPP_ENABLED';
const WA_KEY = '7-shopwa';

function setFlags({ telegram = false, whatsapp = false } = {}) {
  if (telegram) process.env[TG_FLAG] = 'true'; else delete process.env[TG_FLAG];
  if (whatsapp) process.env[WA_FLAG] = 'true'; else delete process.env[WA_FLAG];
}

const telegramIntent = (overrides = {}) => ({
  version: 1,
  channel: 'telegram',
  sender: { type: 'telegram_account', id: 12 },
  audience: { type: 'conversations' },
  schedule: { type: 'once' },
  contentBrief: { topic: 'Ưu đãi tháng 10' },
  ...overrides,
});

const whatsappIntent = (overrides = {}) => ({
  version: 1,
  channel: 'whatsapp',
  sender: { type: 'whatsapp_session', sessionKey: WA_KEY },
  audience: { type: 'conversations', recipientKind: 'phone' },
  schedule: { type: 'once' },
  contentBrief: { topic: 'Ưu đãi tháng 10' },
  ...overrides,
});

describe('P8a — assistant Telegram/WhatsApp', () => {
  let prevTg;
  let prevWa;
  beforeEach(() => {
    prevTg = process.env[TG_FLAG];
    prevWa = process.env[WA_FLAG];
    jest.clearAllMocks();
    setFlags({});
  });
  afterEach(() => {
    if (prevTg === undefined) delete process.env[TG_FLAG]; else process.env[TG_FLAG] = prevTg;
    if (prevWa === undefined) delete process.env[WA_FLAG]; else process.env[WA_FLAG] = prevWa;
  });

  describe('cờ kênh — hai nơi đọc cờ phải khớp nhau', () => {
    it.each([
      [{ telegram: false, whatsapp: false }],
      [{ telegram: true, whatsapp: false }],
      [{ telegram: false, whatsapp: true }],
      [{ telegram: true, whatsapp: true }],
    ])('cờ %j: tầng trợ lý = engine (campaignChannelRegistry)', (flags) => {
      setFlags(flags);
      const engineKeys = channelRegistry.getEnabledAdapterChannelsForBuilder().map((c) => c.key);
      expect(channelFlags.getEnabledAdapterCampaignChannels()).toEqual(engineKeys);
    });
  });

  describe('registry node (campaignNodeRegistry)', () => {
    it('cờ TẮT: registry KHÔNG có send_telegram / send_whatsapp (lạ với validate và prompt)', () => {
      expect(registry.getNodeType('send_telegram')).toBeNull();
      expect(registry.getNodeType('send_whatsapp')).toBeNull();
      expect(Object.keys(registry.getAllNodeTypes())).not.toContain('send_telegram');
      expect(registry.validateNodeConfig('send_telegram', {})).toMatchObject({ valid: false });
      const ctx = registry.buildNodeContextForAI();
      expect(ctx).not.toContain('send_telegram');
      expect(ctx).not.toContain('send_whatsapp');
    });

    it('cờ Telegram BẬT: chỉ có send_telegram; cờ WhatsApp BẬT: chỉ có send_whatsapp (đọc lúc gọi)', () => {
      setFlags({ telegram: true });
      expect(registry.getNodeType('send_telegram')).toMatchObject({ nodeType: 'action', multiStep: false });
      expect(registry.getNodeType('send_whatsapp')).toBeNull();
      setFlags({ whatsapp: true });
      expect(registry.getNodeType('send_telegram')).toBeNull();
      expect(registry.getNodeType('send_whatsapp')).toMatchObject({ nodeType: 'action' });
      setFlags({});
      expect(registry.getNodeType('send_whatsapp')).toBeNull();
    });

    it('cờ BẬT: prompt AI liệt kê node đúng tên trường config thật', () => {
      setFlags({ telegram: true, whatsapp: true });
      const ctx = registry.buildNodeContextForAI();
      expect(ctx).toContain('send_telegram');
      expect(ctx).toContain('telegramAccountId');
      expect(ctx).toContain('send_whatsapp');
      expect(ctx).toContain('whatsappSessionKey');
      expect(ctx).toContain('recipientSource');
    });

    it('validateNodeConfig: thiếu tài khoản, >5 bước, trễ sai, thân tin rỗng đều bị chặn; 2 bước có trễ (P7) và config đủ thì qua', () => {
      setFlags({ telegram: true, whatsapp: true });
      expect(registry.validateNodeConfig('send_telegram', { steps: [{ message: 'x' }] }).valid).toBe(false);
      expect(registry.validateNodeConfig('send_whatsapp', { steps: [{ message: 'x' }] }).valid).toBe(false);
      // P7 — nhiều bước có hẹn giờ ĐƯỢC PHÉP (tối đa 5); trần + độ trễ sai vẫn bị chặn.
      expect(registry.validateNodeConfig('send_telegram', {
        telegramAccountId: 1, steps: [{ message: 'a' }, { message: 'b', delayValue: 1, delayUnit: 'days' }],
      })).toMatchObject({ valid: true });
      expect(registry.validateNodeConfig('send_telegram', {
        telegramAccountId: 1, steps: Array.from({ length: 6 }, (_, i) => ({ message: `m${i}` })),
      }).valid).toBe(false);
      expect(registry.validateNodeConfig('send_whatsapp', {
        whatsappSessionKey: WA_KEY, steps: [{ message: 'a' }, { message: 'b', delayValue: -2, delayUnit: 'hours' }],
      }).valid).toBe(false);
      expect(registry.validateNodeConfig('send_telegram', {
        telegramAccountId: 1, steps: [{ message: 'a' }, { message: '' }],
      }).valid).toBe(false);
      expect(registry.validateNodeConfig('send_telegram', { telegramAccountId: 1, steps: [{ message: '  ' }] }).valid).toBe(false);
      expect(registry.validateNodeConfig('send_telegram', { telegramAccountId: 1, steps: [{ message: 'Chào bạn' }] })).toMatchObject({ valid: true });
      expect(registry.validateNodeConfig('send_whatsapp', { whatsappSessionKey: WA_KEY, steps: [{ templateId: 5 }] })).toMatchObject({ valid: true });
    });
  });

  describe('intent + compiler', () => {
    it('cờ TẮT: intent Telegram/WhatsApp KHÔNG biên dịch được (thiếu channel)', () => {
      expect(isCompilableIntent(telegramIntent())).toMatchObject({ ok: false });
      expect(isCompilableIntent(telegramIntent()).missing).toContain('channel');
      expect(() => compileCampaign(whatsappIntent())).toThrow(/INTENT|incomplete/i);
    });

    it('cờ BẬT: intent đủ trường → ok', () => {
      setFlags({ telegram: true, whatsapp: true });
      expect(isCompilableIntent(telegramIntent())).toEqual({ ok: true, missing: [] });
      expect(isCompilableIntent(whatsappIntent())).toEqual({ ok: true, missing: [] });
    });

    it('thiếu tài khoản / sai kiểu tài khoản / drip quá 5 bước / nguồn không hỗ trợ → không biên dịch', () => {
      setFlags({ telegram: true, whatsapp: true });
      expect(isCompilableIntent(whatsappIntent({ sender: { type: 'whatsapp_session' } })).missing).toContain('sender.sessionKey');
      expect(isCompilableIntent(whatsappIntent({ sender: { type: 'whatsapp_session', sessionKey: 'khong-co-chu' } })).missing).toContain('sender.sessionKey');
      expect(isCompilableIntent(telegramIntent({ sender: undefined })).missing).toContain('sender');
      expect(isCompilableIntent(telegramIntent({ sender: { type: 'zalo_account', id: 12 } })).missing).toContain('sender.type');
      // P7 — drip HỢP LỆ khi ngày × tin/ngày <= 5; vượt trần thì hỏi lại (schedule.days), không cắt bớt im lặng.
      expect(isCompilableIntent(telegramIntent({ schedule: { type: 'drip', days: 3 } }))).toEqual({ ok: true, missing: [] });
      expect(isCompilableIntent(telegramIntent({ schedule: { type: 'drip', days: 3, slotsPerDay: 2 } })).missing).toContain('schedule.days');
      expect(isCompilableIntent(whatsappIntent({ schedule: { type: 'drip', days: 5, slotsPerDay: 1 } })).ok).toBe(true);
      expect(isCompilableIntent(telegramIntent({ audience: { type: 'db' } })).missing).toContain('audience.type');
      expect(isCompilableIntent(telegramIntent({ audience: { type: 'manual' } })).missing).toContain('audience.type');
      // 'conversations' không có nghĩa với Email/Zalo
      expect(isCompilableIntent({
        version: 1, channel: 'zalo', sender: { type: 'zalo_account', id: 3 }, audience: { type: 'conversations' }, schedule: { type: 'once' },
      }).missing).toContain('audience.type');
    });

    it('P7 drip: 3 ngày × 1 tin → 3 bước, bước 2+ trễ 1 ngày kể từ bước trước; slot có day/slot; 2 tin/ngày → trễ 12 giờ', () => {
      setFlags({ telegram: true, whatsapp: true });
      const graph = compileCampaign(telegramIntent({ schedule: { type: 'drip', days: 3, slotsPerDay: 1 } }));
      const send = graph.nodes.find((n) => n.nodeSubtype === 'send_telegram');
      expect(send.config.steps).toEqual([
        { templateId: null, message: '' },
        { templateId: null, message: '', delayValue: 1, delayUnit: 'days' },
        { templateId: null, message: '', delayValue: 1, delayUnit: 'days' },
      ]);
      expect(graph.contentSlots.map((s) => [s.stepIndex, s.day, s.slot])).toEqual([[0, 1, 1], [1, 2, 1], [2, 3, 1]]);
      const wa = compileCampaign(whatsappIntent({ schedule: { type: 'drip', days: 2, slotsPerDay: 2 } }));
      const waSteps = wa.nodes.find((n) => n.nodeSubtype === 'send_whatsapp').config.steps;
      expect(waSteps).toHaveLength(4);
      expect(waSteps[1]).toMatchObject({ delayValue: 12, delayUnit: 'hours' });
      expect(waSteps[0].delayValue).toBeUndefined();
    });

    it('P7 wizard: drip vượt 5 tin ở kênh adapter → hỏi lại lịch; vừa 5 tin thì qua cổng lịch', () => {
      setFlags({ telegram: true });
      const state = (schedule) => ({
        isCampaignFlow: true, channel: 'telegram', senderAccountId: 12, dataSource: 'conversations', zaloGroupIds: [], zaloFriendIds: [],
        schedule, brief: { contentMode: 'custom_topic', topicText: 'Ưu đãi tháng mười cho khách quen' },
      });
      const tooLong = wizard.evaluateNextGate(state({ mode: 'drip', days: 4, slotsPerDay: 2 }), { telegramAccounts: [{ id: 12, name: 'a', usable: true }] }, 'vi');
      expect(tooLong?.gate).toBe('schedule');
      expect(tooLong.response.content).toContain('tối đa 5 tin');
      const ok = wizard.evaluateNextGate(state({ mode: 'drip', days: 5, slotsPerDay: 1 }), { telegramAccounts: [{ id: 12, name: 'a', usable: true }] }, 'vi');
      expect(ok?.gate).not.toBe('schedule');
    });

    it('ví dụ Telegram: "gửi tin Telegram cho khách đang nhắn" → Trigger → send_telegram (hội thoại đang mở)', () => {
      setFlags({ telegram: true });
      const graph = compileCampaign(telegramIntent());
      expect(graph.nodes.map((n) => n.nodeSubtype)).toEqual(['manual', 'send_telegram']);
      const send = graph.nodes.find((n) => n.nodeSubtype === 'send_telegram');
      expect(send).toMatchObject({ nodeType: 'action' });
      expect(send.config).toEqual({
        telegramAccountId: 12,
        recipientSource: 'telegram_conversations',
        steps: [{ templateId: null, message: '' }],
      });
      expect(graph.connections).toEqual([
        expect.objectContaining({ sourceNodeId: 'node_trigger_1', targetNodeId: 'node_send_telegram_1' }),
      ]);
      expect(graph.contentSlots).toEqual([
        expect.objectContaining({ nodeId: 'node_send_telegram_1', channel: 'telegram', stepIndex: 0 }),
      ]);
    });

    it('ví dụ WhatsApp nguồn hội thoại: config có mã phiên, không có node dữ liệu', () => {
      setFlags({ whatsapp: true });
      const graph = compileCampaign(whatsappIntent());
      expect(graph.nodes.map((n) => n.nodeSubtype)).toEqual(['manual', 'send_whatsapp']);
      expect(graph.nodes[1].config).toEqual({
        whatsappSessionKey: WA_KEY,
        recipientSource: 'whatsapp_conversations',
        steps: [{ templateId: null, message: '' }],
      });
    });

    it('ví dụ WhatsApp từ Google Sheet: Trigger → read_sheet → send_whatsapp, nối recipientNodeId', () => {
      setFlags({ whatsapp: true });
      const graph = compileCampaign(whatsappIntent({ audience: { type: 'sheet', url: 'https://docs.google.com/spreadsheets/d/abc/edit', recipientKind: 'phone' } }));
      expect(graph.nodes.map((n) => n.nodeSubtype)).toEqual(['manual', 'read_sheet', 'send_whatsapp']);
      const send = graph.nodes[2];
      expect(send.config).toMatchObject({ recipientSource: 'node', recipientNodeId: graph.nodes[1].id, recipientColumn: '' });
      expect(graph.connections.map((c) => [c.sourceNodeId, c.targetNodeId])).toEqual([
        ['node_trigger_1', graph.nodes[1].id],
        [graph.nodes[1].id, 'node_send_whatsapp_1'],
      ]);
    });

    it('tệp đính kèm (as_attachment) đi vào steps[0].attachments', () => {
      setFlags({ telegram: true });
      const graph = compileCampaign(telegramIntent({
        fileUsage: 'as_attachment',
        attachments: [{ key: 'f/1.pdf', name: 'bao-gia.pdf', size: 10, contentType: 'application/pdf' }],
      }));
      expect(graph.nodes[1].config.steps[0].attachments).toHaveLength(1);
    });

    it('deriveIntent: Telegram tự có audience hội thoại; WhatsApp giữ mã phiên chuỗi (không ép Number)', () => {
      setFlags({ telegram: true, whatsapp: true });
      const tg = deriveIntent({ channel: 'telegram', senderAccountId: '12', schedule: { mode: 'once' } }).intent;
      expect(tg.sender).toEqual({ type: 'telegram_account', id: 12 });
      expect(tg.audience).toEqual({ type: 'conversations' });
      const wa = deriveIntent({ channel: 'whatsapp', senderAccountId: WA_KEY, schedule: { mode: 'once' } }).intent;
      expect(wa.sender).toEqual({ type: 'whatsapp_session', sessionKey: WA_KEY });
      expect(isCompilableIntent(wa).ok).toBe(true);
    });
  });

  describe('ghép nội dung + chốt chặn rỗng', () => {
    it('assertNoEmptyContent chặn node adapter có tin rỗng; có nội dung hoặc mẫu tin thì qua', () => {
      setFlags({ telegram: true, whatsapp: true });
      const graph = compileCampaign(telegramIntent());
      expect(() => assertNoEmptyContent(graph)).toThrow(/rỗng/);
      graph.nodes[1].config.steps[0].message = 'Xin chào!';
      expect(() => assertNoEmptyContent(graph)).not.toThrow();
      graph.nodes[1].config.steps[0] = { templateId: 9, message: '' };
      expect(() => assertNoEmptyContent(graph)).not.toThrow();
    });

    it('mergeCompiledWithContent lấy message từ script LLM; thiếu thì báo unmatched', () => {
      setFlags({ whatsapp: true });
      const graph = compileCampaign(whatsappIntent());
      const legacy = { nodes: [{ nodeSubtype: 'send_whatsapp', config: { steps: [{ message: 'Chào {{ten}}' }] } }], connections: [] };
      const merged = mergeCompiledWithContent(graph, legacy);
      expect(merged.unmatchedSlots).toEqual([]);
      expect(merged.script.nodes[1].config.steps[0].message).toBe('Chào {{ten}}');
      // LLM soạn 2 bước → bước thừa bị bỏ im lặng là không chấp nhận được
      const tooMany = mergeCompiledWithContent(graph, {
        nodes: [{ nodeSubtype: 'send_whatsapp', config: { steps: [{ message: 'a' }, { message: 'b' }] } }],
        connections: [],
      });
      expect(tooMany.unmatchedSlots.map((s) => s.reason)).toContain('legacy_has_more_steps');
      expect(mergeCompiledWithContent(graph, { nodes: [], connections: [] }).unmatchedSlots).toHaveLength(1);
    });

    it('slot filler: prompt riêng cho Telegram/WhatsApp và điền steps[0].message', () => {
      setFlags({ telegram: true });
      const graph = compileCampaign(telegramIntent());
      const prompt = buildSlotFillingPrompt({ slots: graph.contentSlots, campaignIntent: telegramIntent() });
      expect(prompt.systemPrompt).toContain('Telegram');
      expect(prompt.systemPrompt).not.toContain('Zalo Nhóm');
      const { script, appliedCount } = applySlotsToGraph(graph, [{ slotId: graph.contentSlots[0].slotId, message: 'Ưu đãi mới!' }]);
      expect(appliedCount).toBe(1);
      expect(script.nodes[1].config.steps[0].message).toBe('Ưu đãi mới!');
    });
  });

  describe('wizard', () => {
    it('cờ TẮT: câu hỏi kênh chỉ có Email/Zalo/Zalo nhóm; normalizeChannel không nhận telegram', () => {
      const values = wizard.buildChannelQuestion('vi').data.questions[0].options.map((o) => o.value);
      expect(values).toEqual(['email', 'zalo', 'zalo_group']);
      expect(wizard.normalizeChannel('telegram')).toBeNull();
      expect(wizard.normalizeChannel('whatsapp')).toBeNull();
    });

    it('cờ BẬT: câu hỏi kênh thêm đúng kênh đang bật; normalizeChannel nhận diện', () => {
      setFlags({ telegram: true });
      expect(wizard.buildChannelQuestion('vi').data.questions[0].options.map((o) => o.value))
        .toEqual(['email', 'zalo', 'zalo_group', 'telegram']);
      setFlags({ telegram: true, whatsapp: true });
      expect(wizard.buildChannelQuestion('vi').data.questions[0].options.map((o) => o.value))
        .toEqual(['email', 'zalo', 'zalo_group', 'telegram', 'whatsapp']);
      expect(wizard.normalizeChannel('Telegram')).toBe('telegram');
      expect(wizard.normalizeChannel('WhatsApp')).toBe('whatsapp');
      expect(wizard.normalizeChannel('zalo')).toBe('zalo');
    });

    it('lịch cho kênh adapter có cả "Gửi một lần" và chuỗi nhiều ngày (P7, kèm nhắc trần 5 tin)', () => {
      const opts = (q) => q.data.questions[0].options.map((o) => o.value);
      expect(opts(wizard.buildScheduleQuestion('vi', { channel: 'telegram' }))).toEqual(['once', 'drip']);
      expect(wizard.buildScheduleQuestion('vi', { channel: 'whatsapp' }).data.questions[0].options[1].description).toContain('tối đa 5');
      expect(opts(wizard.buildScheduleQuestion('vi', { channel: 'email' }))).toEqual(['once', 'drip']);
      expect(opts(wizard.buildScheduleQuestion('vi'))).toEqual(['once', 'drip']);
    });

    const baseState = (channel) => ({
      isCampaignFlow: true,
      channel,
      senderAccountId: null,
      dataSource: null,
      zaloGroupIds: [],
      zaloFriendIds: [],
      schedule: null,
      brief: null,
    });

    it('chưa có tài khoản dùng được → hướng dẫn kết nối (chặn tại cổng senderAccount)', () => {
      setFlags({ telegram: true });
      const gate = wizard.evaluateNextGate(baseState('telegram'), { telegramAccounts: [{ id: 1, name: 'a', usable: false }] }, 'vi');
      expect(gate.gate).toBe('senderAccount');
      expect(gate.response.content).toContain('Telegram');
    });

    // Rà soát C P3-6 — trước đây cổng trả null ("nhả cho LLM hỏi"): "hỏi lại, không tự chọn" chỉ là luật prompt, model có thể tự chọn tài khoản đầu.
    it('nhiều tài khoản + chưa chọn → THẺ chọn tài khoản tất định (ask_sender_account), không còn nhả cho LLM', () => {
      setFlags({ telegram: true });
      const gate = wizard.evaluateNextGate(baseState('telegram'), {
        telegramAccounts: [{ id: 1, name: 'shop_a', usable: true }, { id: 2, name: 'shop_b', usable: true }, { id: 3, name: 'cu', usable: false }],
      }, 'vi');

      expect(gate.gate).toBe('senderAccount');
      expect(gate.response.type).toBe('ask_sender_account');
      expect(gate.response.content).toContain('Telegram');
      // Chỉ liệt kê tài khoản DÙNG ĐƯỢC; id Telegram giữ kiểu số.
      expect(gate.response.data.accounts.map((a) => [a.id, a.name, a.usable])).toEqual([[1, 'shop_a', true], [2, 'shop_b', true]]);
      // Nút "Khác" của thẻ Email/Zalo dẫn tới QR Zalo — vô nghĩa ở đây nên backend tắt.
      expect(gate.response.data).toMatchObject({ channel: 'telegram', allowOther: false, noUsableAccount: false });
    });

    it('WhatsApp: id là MÃ PHIÊN chuỗi, giữ nguyên kiểu chuỗi trên thẻ; tiếng Anh có bản tiếng Anh', () => {
      setFlags({ whatsapp: true });
      const gate = wizard.evaluateNextGate(baseState('whatsapp'), {
        whatsappAccounts: [{ id: WA_KEY, name: 'Shop A', usable: true }, { id: '7-shopb', name: 'Shop B', usable: true }],
      }, 'en');

      expect(gate.response.data.accounts.map((a) => a.id)).toEqual([WA_KEY, '7-shopb']);
      expect(gate.response.content).toBe('Choose the WhatsApp account to send this campaign from.');
    });

    it('đã chọn một tài khoản dùng được → cổng thông qua (không hỏi lại), đi tiếp brief', () => {
      setFlags({ telegram: true });
      const gate = wizard.evaluateNextGate({ ...baseState('telegram'), senderAccountId: 2 }, {
        telegramAccounts: [{ id: 1, name: 'a', usable: true }, { id: 2, name: 'b', usable: true }], courses: [],
      }, 'vi');
      expect(gate?.gate).toBe('campaignBrief');
    });

    it('tài khoản đã chọn không còn trong danh sách dùng được (ngắt kết nối) mà còn ≥ 2 tài khoản khác → hỏi lại bằng thẻ', () => {
      setFlags({ telegram: true });
      const gate = wizard.evaluateNextGate({ ...baseState('telegram'), senderAccountId: 9 }, {
        telegramAccounts: [{ id: 1, name: 'a', usable: true }, { id: 2, name: 'b', usable: true }],
      }, 'vi');
      expect(gate.gate).toBe('senderAccount');
      expect(gate.response.type).toBe('ask_sender_account');
    });

    it('marker senderAccount của thẻ → state.senderAccountId đúng kiểu (số cho Telegram, chuỗi cho WhatsApp) và cổng thông qua', () => {
      setFlags({ telegram: true, whatsapp: true });
      const tg = wizard.extractWizardState([
        { role: 'user', content: 'Gửi Telegram cho khách chiến dịch tháng 10' },
        { role: 'user', content: '[wizard]{"gate":"channel","channel":"telegram"}\nTelegram' },
        { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"telegram","accountId":2,"accountName":"shop_b"}\nChọn' },
      ]);
      expect(tg.channel).toBe('telegram');
      expect(tg.senderAccountId).toBe(2);
      const wa = wizard.extractWizardState([
        { role: 'user', content: 'Gửi WhatsApp cho khách chiến dịch tháng 10' },
        { role: 'user', content: '[wizard]{"gate":"channel","channel":"whatsapp"}\nWA' },
        { role: 'user', content: `[wizard]{"gate":"senderAccount","channel":"whatsapp","accountId":"${WA_KEY}","accountName":"Shop"}\nChọn` },
      ]);
      expect(wa.senderAccountId).toBe(WA_KEY);
    });

    it('đúng 1 tài khoản → KHÔNG hỏi tài khoản/nguồn người nhận, đi thẳng tới cổng chung (brief)', () => {
      setFlags({ whatsapp: true });
      const gate = wizard.evaluateNextGate(baseState('whatsapp'), { whatsappAccounts: [{ id: WA_KEY, name: 'wa', usable: true }], courses: [] }, 'vi');
      expect(gate?.gate).toBe('campaignBrief');
    });
  });

  describe('thẻ xác nhận (campaignConfirmation)', () => {
    const script = (config) => ({
      campaignName: 'TG',
      nodes: [{ tempId: 'tg-1', nodeType: 'action', nodeSubtype: 'send_telegram', config }],
    });

    it('cờ TẮT: node Telegram không được nhận diện (no_send_steps như subtype lạ)', async () => {
      const view = await confirmation.buildConfirmationView({
        userId: 7,
        script: script({ telegramAccountId: 12, steps: [{ message: 'x' }] }),
      });
      expect(view.blockingIssues.map((i) => i.code)).toContain('no_send_steps');
    });

    it('cờ BẬT: Telegram đủ tài khoản + nội dung → readyToCreate, kênh telegram, sender có nhãn', async () => {
      setFlags({ telegram: true });
      telegramRepo.getAccountById.mockResolvedValue({ id: 12, username: 'shop_bot', is_active: true });
      const view = await confirmation.buildConfirmationView({
        userId: 99, // nhân viên
        ownerUserId: 7, // chủ workspace — tài khoản tra theo CHỦ
        script: script({ telegramAccountId: 12, recipientSource: 'telegram_conversations', steps: [{ message: 'Xin chào' }] }),
      });
      expect(telegramRepo.getAccountById).toHaveBeenCalledWith(12, { userId: 7 });
      expect(view.readyToCreate).toBe(true);
      expect(view.steps[0]).toMatchObject({
        channel: 'telegram',
        sender: { id: 12, label: 'shop_bot' },
        content: { bodyText: 'Xin chào' },
        recipients: { mode: 'source' },
      });
    });

    it('thiếu/không thuộc chủ tài khoản → missing_sender chặn tạo', async () => {
      setFlags({ telegram: true, whatsapp: true });
      telegramRepo.getAccountById.mockResolvedValue(null);
      const tg = await confirmation.buildConfirmationView({ userId: 7, script: script({ telegramAccountId: 12, steps: [{ message: 'x' }] }) });
      expect(tg.readyToCreate).toBe(false);
      expect(tg.blockingIssues.map((i) => i.code)).toContain('missing_sender');
      const wa = await confirmation.buildConfirmationView({
        userId: 7,
        script: { nodes: [{ tempId: 'wa-1', nodeSubtype: 'send_whatsapp', config: { whatsappSessionKey: '8-cua-nguoi-khac', steps: [{ message: 'x' }] } }] },
      });
      expect(wa.blockingIssues.map((i) => i.code)).toContain('missing_sender');
    });

    // Rà soát C P2-9 — nguồn "hội thoại": thẻ phải nói rõ bao nhiêu người đã từng nhắn tới tài khoản nào (trước đây không có dòng người nhận nào).
    // Mock giữ ĐÚNG hình dạng repo thật: Telegram trả Map<số, số> theo id tài khoản; WhatsApp trả Map<chuỗi, số> theo mã phiên.
    it('Telegram nguồn hội thoại → recipients.conversations = số hội thoại đang mở của ĐÚNG tài khoản + nhãn tài khoản', async () => {
      setFlags({ telegram: true });
      telegramRepo.getAccountById.mockResolvedValue({ id: 12, username: 'shop_bot', is_active: true });
      telegramRepo.countOpenConversationsByAccountIds.mockResolvedValue(new Map([[12, 37]]));
      const view = await confirmation.buildConfirmationView({
        userId: 7,
        script: script({ telegramAccountId: 12, recipientSource: 'telegram_conversations', steps: [{ message: 'Xin chào' }] }),
      });

      expect(telegramRepo.countOpenConversationsByAccountIds).toHaveBeenCalledWith([12]);
      expect(view.steps[0].recipients.conversations).toEqual({ count: 37, accountLabel: 'shop_bot' });
      expect(view.steps[0].recipients.mode).toBe('source');
    });

    it('WhatsApp nguồn hội thoại → đếm theo mã phiên của CHỦ; phiên chưa có hội thoại → count 0 (không phải null)', async () => {
      setFlags({ whatsapp: true });
      whatsappService.getSession.mockReturnValue({ userName: 'Shop WA' });
      whatsappConversationRepo.countOpenConversationsBySessionKeys.mockResolvedValue(new Map());
      const view = await confirmation.buildConfirmationView({
        userId: 7,
        script: { nodes: [{ tempId: 'wa-1', nodeSubtype: 'send_whatsapp', config: { whatsappSessionKey: WA_KEY, recipientSource: 'whatsapp_conversations', steps: [{ message: 'Hi' }] } }] },
      });

      expect(whatsappConversationRepo.countOpenConversationsBySessionKeys).toHaveBeenCalledWith(7, [WA_KEY]);
      expect(view.steps[0].recipients.conversations).toEqual({ count: 0, accountLabel: 'Shop WA' });
    });

    it('đếm hội thoại lỗi → thẻ KHÔNG vỡ, count null (thẻ ghi "tất cả người đã từng nhắn", không bịa số)', async () => {
      setFlags({ telegram: true });
      telegramRepo.getAccountById.mockResolvedValue({ id: 12, username: 'shop_bot', is_active: true });
      telegramRepo.countOpenConversationsByAccountIds.mockRejectedValue(new Error('db down'));
      const view = await confirmation.buildConfirmationView({
        userId: 7,
        script: script({ telegramAccountId: 12, recipientSource: 'telegram_conversations', steps: [{ message: 'Xin chào' }] }),
      });

      expect(view.readyToCreate).toBe(true);
      expect(view.steps[0].recipients.conversations).toEqual({ count: null, accountLabel: 'shop_bot' });
    });

    it('nguồn nhập tay / nguồn node WhatsApp → KHÔNG có recipients.conversations và không đếm hội thoại', async () => {
      setFlags({ telegram: true, whatsapp: true });
      telegramRepo.getAccountById.mockResolvedValue({ id: 12, username: 'shop_bot', is_active: true });
      telegramRepo.countOpenConversationsByAccountIds.mockClear();
      const manual = await confirmation.buildConfirmationView({
        userId: 7,
        script: script({ telegramAccountId: 12, recipientSource: 'manual', recipientKeys: ['123456789'], steps: [{ message: 'x' }] }),
      });

      expect(manual.steps[0].recipients).not.toHaveProperty('conversations');
      expect(telegramRepo.countOpenConversationsByAccountIds).not.toHaveBeenCalled();
    });

    it('WhatsApp nhập tay: đếm SĐT, thiếu thì chặn manual_recipients_required', async () => {
      setFlags({ whatsapp: true });
      whatsappService.getSession.mockReturnValue({ userName: 'Shop WA' });
      const mk = (recipientKeys) => ({
        nodes: [{
          tempId: 'wa-1', nodeSubtype: 'send_whatsapp',
          config: { whatsappSessionKey: WA_KEY, recipientSource: 'manual', recipientKeys, steps: [{ message: 'Hi' }] },
        }],
      });
      const ok = await confirmation.buildConfirmationView({ userId: 7, script: mk(['84912345678', '84987654321']) });
      expect(ok.readyToCreate).toBe(true);
      expect(ok.steps[0]).toMatchObject({ channel: 'whatsapp', sender: { id: WA_KEY, label: 'Shop WA' }, recipients: { mode: 'manual', count: 2 } });
      const empty = await confirmation.buildConfirmationView({ userId: 7, script: mk([]) });
      expect(empty.blockingIssues.map((i) => i.code)).toContain('manual_recipients_required');
    });
  });

  describe('tài nguyên cho prompt (aiPromptResources)', () => {
    it('cả hai cờ TẮT: không chạm DB/Baileys, block rỗng', async () => {
      await expect(aiPromptResources.getAdapterChannelAccounts(7)).resolves.toEqual({ telegram: [], whatsapp: [] });
      await expect(aiPromptResources.getAdapterAccountsPromptBlock(7)).resolves.toBe('');
      expect(aiPromptResources.getAdapterNodeTypesPromptLines()).toBe('');
      expect(telegramRepo.listAccountsByUser).not.toHaveBeenCalled();
      expect(whatsappService.listSessions).not.toHaveBeenCalled();
    });

    // Rà soát C P2-9 — prompt không còn DẠY model chép danh sách người nhận vào node (`recipientKeys`/nguồn "manual"): danh sách riêng tư đi qua lớp phủ.
    it('cờ BẬT: dòng node Telegram/WhatsApp KHÔNG dạy recipientKeys, dặn dùng nguồn hội thoại và cấm chép chat id/SĐT', () => {
      setFlags({ telegram: true, whatsapp: true });
      const lines = aiPromptResources.getAdapterNodeTypesPromptLines();

      expect(lines).toContain('send_telegram');
      expect(lines).toContain('send_whatsapp');
      expect(lines).not.toContain('recipientKeys');
      expect(lines).toContain('"telegram_conversations"');
      expect(lines).toContain('"whatsapp_conversations"');
      expect(lines).toContain('KHÔNG chép chat id/SĐT');
      expect(lines).toContain('KHÔNG chép SĐT');
    });

    it('cờ BẬT: liệt kê tài khoản Telegram + phiên WhatsApp CỦA CHỦ (lọc theo tiền tố), usable đúng', async () => {
      setFlags({ telegram: true, whatsapp: true });
      telegramRepo.listAccountsByUser.mockResolvedValue([
        { id: 1, username: 'a', is_active: true },
        { id: 2, first_name: 'B', is_active: false },
      ]);
      whatsappService.listSessions.mockReturnValue([
        { sessionKey: WA_KEY, status: 'open', userName: 'Shop' },
        { sessionKey: '8-khac', status: 'open', userName: 'Người khác' },
        { sessionKey: '7-ngat', status: 'close', userName: null },
      ]);
      const accounts = await aiPromptResources.getAdapterChannelAccounts(7);
      expect(accounts.telegram).toEqual([
        { id: 1, name: 'a', usable: true },
        { id: 2, name: 'B', usable: false },
      ]);
      expect(accounts.whatsapp).toEqual([
        { id: WA_KEY, name: 'Shop', usable: true },
        { id: '7-ngat', name: '7-ngat', usable: false },
      ]);
      const block = await aiPromptResources.getAdapterAccountsPromptBlock(7);
      expect(block.startsWith('\n')).toBe(true);
      expect(block).toContain('telegramAccountId');
      expect(block).toContain(WA_KEY);
      expect(block).not.toContain('8-khac');
    });
  });
});
