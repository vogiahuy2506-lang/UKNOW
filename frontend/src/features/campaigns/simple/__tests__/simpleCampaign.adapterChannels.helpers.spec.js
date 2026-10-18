import { describe, expect, it } from 'vitest';
import {
  ADAPTER_MESSAGE_MAX,
  AUDIENCE_TYPES_BY_CHANNEL,
  SIMPLE_CHANNELS,
  applyChannelChange,
  buildSimpleCampaignBody,
  createFollowUp,
  createInitialWizardState,
  getAvailableWhenOptions,
  getMaxFollowUps,
  getTemplateChannelProblem,
  isMessageContentComplete,
  isStepComplete,
  mapTelegramAccounts,
  mapWhatsAppAccounts,
  senderKindOf,
} from '../simpleCampaign.helpers';

const stateFor = (channel, patch = {}) => applyChannelChange({ ...createInitialWizardState(), ...patch }, channel);
const images = (n) => Array.from({ length: n }, (_v, i) => ({ key: `${i}.png`, name: `${i}.png`, size: 10 }));

describe('kênh Telegram / WhatsApp trong bảng của trình từng bước', () => {
  it('đúng 4 kênh (Nhóm là nguồn, không phải kênh); Telegram: conversations + nhóm; WhatsApp: conversations/customers/landing/form/sheet + nhóm (không nhập tay)', () => {
    expect(SIMPLE_CHANNELS).toEqual(['email', 'zalo', 'telegram', 'whatsapp']);
    expect(AUDIENCE_TYPES_BY_CHANNEL.telegram).toEqual(['conversations', 'telegram_groups']);
    expect(AUDIENCE_TYPES_BY_CHANNEL.whatsapp).toEqual(['conversations', 'customers', 'landing', 'form', 'sheet', 'whatsapp_groups']);
  });

  it('trần chuỗi: Telegram/WhatsApp 4 tin sau (tổng 5); email/Zalo 9 tin sau (tổng 10)', () => {
    expect(getMaxFollowUps('telegram')).toBe(4);
    expect(getMaxFollowUps('whatsapp')).toBe(4);
    expect(getMaxFollowUps('email')).toBe(9);
    expect(getMaxFollowUps('zalo')).toBe(9);
    expect(getMaxFollowUps('zalo_group')).toBe(9);
  });

  it('mỗi kênh adapter có danh sách tài khoản riêng', () => {
    expect(senderKindOf('telegram')).toBe('telegram');
    expect(senderKindOf('whatsapp')).toBe('whatsapp');
    expect(senderKindOf('zalo_group')).toBe('zalo');
  });
});

describe('đổi kênh', () => {
  it('chọn Telegram: nguồn "conversations" được chọn sẵn; WhatsApp: để người dùng chọn', () => {
    expect(stateFor('telegram').audience.type).toBe('conversations');
    expect(stateFor('whatsapp').audience.type).toBeNull();
  });

  it('Zalo → Telegram: bỏ tài khoản Zalo, bỏ nguồn không hợp (tự nhập), cắt chuỗi 7 tin sau xuống 4', () => {
    const followUps = Array.from({ length: 7 }, () => createFollowUp());
    const zalo = {
      ...createInitialWizardState(),
      channel: 'zalo',
      sender: { id: 21, label: 'Nick A' },
      audience: { ...createInitialWizardState().audience, type: 'manual', manualText: '0912345678' },
      followUps,
    };
    const next = applyChannelChange(zalo, 'telegram');
    expect(next.sender).toBeNull();
    expect(next.audience.type).toBe('conversations');
    expect(next.followUps).toHaveLength(4);
    expect(next.followUps.map((item) => item.id)).toEqual(followUps.slice(0, 4).map((item) => item.id));
  });

  it('Telegram → WhatsApp: bỏ tài khoản (khác loại), giữ nguồn "conversations"; WhatsApp → Zalo: bỏ nguồn "conversations"', () => {
    const telegram = { ...stateFor('telegram'), sender: { id: 5, label: 'Shop' } };
    const wa = applyChannelChange(telegram, 'whatsapp');
    expect(wa.sender).toBeNull();
    expect(wa.audience.type).toBe('conversations');
    const zalo = applyChannelChange(wa, 'zalo');
    expect(zalo.audience.type).toBeNull();
  });

  it('Telegram ↔ Zalo dùng chung kho mẫu nên giữ mẫu đã chọn; sang email thì bỏ mẫu + thông tin tệp của mẫu', () => {
    const base = {
      ...stateFor('telegram'),
      content: { mode: 'template', templateId: 6, templateName: 'Mẫu', templateAttachments: images(1), templateBodyLength: 9, subject: '', body: '' },
    };
    expect(applyChannelChange(base, 'zalo').content.templateId).toBe(6);
    const email = applyChannelChange(base, 'email');
    expect(email.content).toMatchObject({ templateId: null, templateAttachments: null, templateBodyLength: null });
  });

  it('"Tự động gửi cho người mới" của chiến dịch đang chọn bị trả về "Gửi ngay" khi đổi sang Telegram/WhatsApp', () => {
    const email = {
      ...createInitialWizardState(),
      channel: 'email',
      audience: { ...createInitialWizardState().audience, type: 'landing', slugs: ['a'] },
      schedule: { type: 'continuous', pollIntervalMinutes: 180 },
    };
    expect(applyChannelChange(email, 'whatsapp').schedule).toEqual({ type: 'now' });
  });
});

describe('cách gửi', () => {
  it('Telegram/WhatsApp KHÔNG có "Tự động gửi cho người mới" ở bất kỳ nguồn nào; email cùng nguồn thì có', () => {
    for (const type of ['conversations', 'landing', 'form', 'sheet']) {
      expect(getAvailableWhenOptions({ channel: 'whatsapp', audience: { type } })).not.toContain('continuous');
      expect(getAvailableWhenOptions({ channel: 'telegram', audience: { type } })).not.toContain('continuous');
    }
    expect(getAvailableWhenOptions({ channel: 'email', audience: { type: 'landing' } })).toContain('continuous');
    expect(getAvailableWhenOptions({ channel: 'whatsapp', audience: { type: 'landing' } })).toEqual(['now', 'scheduled', 'recurring']);
  });
});

describe('đủ thông tin để Tiếp tục', () => {
  it('bước Kênh: WhatsApp tài khoản là mã phiên chuỗi vẫn tính là đã chọn', () => {
    const state = { ...stateFor('whatsapp'), sender: { id: '7-main', label: 'Shop WA' } };
    expect(isStepComplete('channel', state)).toBe(true);
    expect(isStepComplete('channel', { ...state, sender: null })).toBe(false);
  });

  it('bước Người nhận: "conversations" đủ ngay cho Telegram và WhatsApp; nhập tay không hợp lệ cho WhatsApp', () => {
    expect(isStepComplete('audience', stateFor('telegram'))).toBe(true);
    const wa = { ...stateFor('whatsapp') };
    expect(isStepComplete('audience', wa)).toBe(false);
    expect(isStepComplete('audience', { ...wa, audience: { ...wa.audience, type: 'conversations' } })).toBe(true);
    expect(isStepComplete('audience', { ...wa, audience: { ...wa.audience, type: 'manual', manualText: '0912345678' } })).toBe(false);
  });

  it('chữ tự soạn vượt trần của kênh → chưa đủ (Telegram 4000, WhatsApp 4096); email/Zalo không bị trần này', () => {
    const body = (n) => ({ mode: 'custom', subject: 's', body: 'a'.repeat(n) });
    expect(isMessageContentComplete('telegram', body(4000))).toBe(true);
    expect(isMessageContentComplete('telegram', body(4001))).toBe(false);
    expect(isMessageContentComplete('whatsapp', body(4096))).toBe(true);
    expect(isMessageContentComplete('whatsapp', body(4097))).toBe(false);
    expect(isMessageContentComplete('zalo', body(5000))).toBe(true);
    expect(ADAPTER_MESSAGE_MAX).toEqual({ telegram: 4000, whatsapp: 4096 });
  });

  it('mẫu vượt giới hạn tệp/độ dài của kênh → có vấn đề + chưa đủ; mẫu hợp lệ → đủ', () => {
    const template = (patch) => ({ mode: 'template', templateId: 6, templateAttachments: [], templateBodyLength: 10, ...patch });
    expect(getTemplateChannelProblem('telegram', template({ templateAttachments: images(6) }))).toEqual({ code: 'images', limit: 5 });
    expect(getTemplateChannelProblem('whatsapp', template({ templateAttachments: [...images(1), ...Array.from({ length: 4 }, (_v, i) => ({ name: `${i}.pdf`, size: 1 }))] })))
      .toEqual({ code: 'documents', limit: 3 });
    expect(getTemplateChannelProblem('telegram', template({ templateAttachments: [{ name: 'big.pdf', size: 21 * 1024 * 1024 }] })))
      .toEqual({ code: 'size', limit: 20 });
    expect(getTemplateChannelProblem('telegram', template({ templateBodyLength: 4001 }))).toEqual({ code: 'tooLong', limit: 4000 });
    expect(getTemplateChannelProblem('whatsapp', template({ templateBodyLength: 4001 }))).toBeNull();
    // Kênh Zalo/email không bị giới hạn này.
    expect(getTemplateChannelProblem('zalo', template({ templateAttachments: images(9) }))).toBeNull();
    expect(isMessageContentComplete('telegram', template({ templateAttachments: images(6) }))).toBe(false);
    expect(isMessageContentComplete('telegram', template())).toBe(true);
    // Tệp của mẫu chưa tải xong (API danh sách mẫu không trả tệp): Telegram/WhatsApp chưa cho đi tiếp; Zalo/email không cần tệp.
    expect(isMessageContentComplete('telegram', template({ templateAttachments: null }))).toBe(false);
    expect(isMessageContentComplete('whatsapp', template({ templateAttachments: null }))).toBe(false);
    expect(isMessageContentComplete('zalo', template({ templateAttachments: null }))).toBe(true);
    // WebP: ảnh ở WhatsApp, tài liệu ở Telegram.
    const webp = Array.from({ length: 4 }, (_v, i) => ({ name: `${i}.webp`, size: 1 }));
    expect(getTemplateChannelProblem('whatsapp', template({ templateAttachments: webp }))).toBeNull();
    expect(getTemplateChannelProblem('telegram', template({ templateAttachments: webp }))).toEqual({ code: 'documents', limit: 3 });
  });
});

describe('body gửi server', () => {
  const full = (channel, sender) => ({
    ...stateFor(channel),
    sender,
    audience: { ...stateFor(channel).audience, type: 'conversations' },
    content: { mode: 'custom', templateId: null, templateName: '', subject: '', body: ' Xin chào ' },
    followUps: [{ ...createFollowUp(), delayValue: 2, delayUnit: 'hours', content: { mode: 'custom', body: 'Tin 2', subject: '' } }],
  });

  it('Telegram: senderId số, KHÔNG có senderKey', () => {
    const body = buildSimpleCampaignBody(full('telegram', { id: 5, label: 'Shop' }));
    expect(body).toMatchObject({ channel: 'telegram', senderId: 5, audience: { type: 'conversations' }, content: { mode: 'custom', body: 'Xin chào' } });
    expect(body).not.toHaveProperty('senderKey');
    expect(body.followUps).toEqual([{ delayValue: 2, delayUnit: 'hours', content: { mode: 'custom', body: 'Tin 2' } }]);
  });

  it('WhatsApp: senderKey là mã phiên chuỗi, KHÔNG có senderId', () => {
    const body = buildSimpleCampaignBody(full('whatsapp', { id: '7-main', label: 'Shop WA' }));
    expect(body).toMatchObject({ channel: 'whatsapp', senderKey: '7-main' });
    expect(body).not.toHaveProperty('senderId');
  });

  it('email/Zalo vẫn gửi senderId như cũ', () => {
    const state = { ...stateFor('zalo'), sender: { id: 21, label: 'A' }, audience: { ...stateFor('zalo').audience, type: 'customers' }, content: { mode: 'template', templateId: 3, templateName: 'x' } };
    const body = buildSimpleCampaignBody(state);
    expect(body.senderId).toBe(21);
    expect(body).not.toHaveProperty('senderKey');
  });
});

describe('ánh xạ tài khoản', () => {
  it('Telegram: dùng được hết (endpoint đã lọc), nhãn là tên, nhãn phụ @username, kèm số người đã nhắn', () => {
    expect(mapTelegramAccounts([{ id: 5, name: 'Shop', username: 'shop_tg', openConversationCount: 12 }])).toEqual([
      { id: 5, label: 'Shop', sublabel: '@shop_tg', isDefault: false, usable: true, problem: null, conversationCount: 12 },
    ]);
    expect(mapTelegramAccounts(null)).toEqual([]);
  });

  it('WhatsApp: chỉ phiên `open` dùng được; offline/connecting → problem disconnected; id là mã phiên chuỗi', () => {
    const accounts = mapWhatsAppAccounts([
      { sessionKey: '7-a', display: 'A', status: 'open', openConversationCount: 3 },
      { sessionKey: '7-b', display: 'B', status: 'offline' },
      { sessionKey: '7-c', display: 'C', status: 'connecting' },
    ]);
    expect(accounts.map((a) => [a.id, a.usable, a.problem])).toEqual([['7-a', true, null], ['7-b', false, 'disconnected'], ['7-c', false, 'disconnected']]);
    expect(accounts[0].conversationCount).toBe(3);
    expect(accounts[1].conversationCount).toBeNull();
  });
});
