import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-A (PLAN_DON_NO_KIEN_TRUC_AI_2026-10-10): slot filler chọn prompt THEO KÊNH của slot.
 * Trước đây mọi kênh ngoài Telegram/WhatsApp rơi vào prompt "Zalo Nhóm" (câu chào số đông, biến group_name), và email không có tiêu đề
 * (assertNoEmptyContent đòi emailSubject nên ca email luôn ném lỗi rồi rơi về luồng cũ).
 *
 * Mock Gemini + usage + model policy ở mức module (không thêm export mới vào các module bị mock).
 */
const generateGeminiContent = jest.fn();
const record = jest.fn();
const resolveAllowedModel = jest.fn();

jest.unstable_mockModule('../../../utils/geminiClient.util.js', () => ({ generateGeminiContent }));
jest.unstable_mockModule('../aiUsageMeter.service.js', () => ({ default: { record } }));
jest.unstable_mockModule('../aiModelPolicy.service.js', () => ({ resolveAllowedModel }));

const { compileCampaign } = await import('../campaignCompiler.service.js');
const {
  applySlotsToGraph,
  buildSlotFillingPrompt,
  fillContentSlots,
  groupSlotsByChannel,
  SLOTS_RESPONSE_SCHEMA,
} = await import('../campaignSlotFiller.service.js');
const { deriveIntent, isCompilableIntent } = await import('../campaignIntent.schema.js');

const contentBrief = { topic: 'Khai giảng khoá AI Automation', locale: 'vi' };

const zaloPersonalDrip = {
  version: 1,
  channel: 'zalo',
  sender: { type: 'zalo_account', id: 5 },
  audience: { type: 'sheet', url: 'https://docs.google.com/spreadsheets/d/abc', recipientKind: 'phone' },
  schedule: { type: 'drip', days: 2, slotsPerDay: 1 },
  contentBrief,
};

const emailDrip = {
  version: 1,
  channel: 'email',
  sender: { type: 'email_account', id: 7 },
  audience: { type: 'sheet', url: 'https://docs.google.com/spreadsheets/d/123456789/edit', recipientKind: 'email' },
  schedule: { type: 'drip', days: 2, slotsPerDay: 1 },
  contentBrief,
};

const zaloGroupOnce = {
  version: 1,
  channel: 'zalo_group',
  sender: { type: 'zalo_account', id: 8 },
  audience: { type: 'zalo_contacts', groupIds: ['g1'] },
  schedule: { type: 'once' },
  contentBrief: { ...contentBrief, targetAudience: 'Học viên trong nhóm Zalo' },
};

describe('PR-A — prompt theo kênh', () => {
  it('ca 1: 2 slot zalo_personal → prompt KHÔNG chứa "Zalo Nhóm" / group_name, có quy tắc xưng hô 1-1', () => {
    const compiled = compileCampaign(zaloPersonalDrip);
    expect(compiled.contentSlots).toHaveLength(2);
    expect(compiled.contentSlots.every((s) => s.channel === 'zalo')).toBe(true);

    const { systemPrompt, userPrompt } = buildSlotFillingPrompt({
      slots: compiled.contentSlots,
      campaignIntent: zaloPersonalDrip,
    });
    const all = `${systemPrompt}\n${userPrompt}`;
    expect(all).not.toContain('Zalo Nhóm');
    expect(all).not.toContain('Zalo nhóm');
    expect(all).not.toContain('group_name');
    expect(all).not.toContain('Chào cả nhà');
    expect(all).not.toContain('Thành viên nhóm Zalo');
    expect(systemPrompt).toContain('Xưng hô 1-1');
    expect(systemPrompt).toContain('{{ten}}');
    compiled.contentSlots.forEach((s) => expect(userPrompt).toContain(s.slotId));
  });

  it('ca 2: 2 slot email → prompt đòi subject + HTML; schema có subject; graph ra emailSubject + emailBody đúng step', () => {
    const compiled = compileCampaign(emailDrip);
    expect(compiled.contentSlots).toHaveLength(2);

    const { systemPrompt, userPrompt } = buildSlotFillingPrompt({
      slots: compiled.contentSlots,
      campaignIntent: emailDrip,
    });
    expect(systemPrompt).toContain('subject');
    expect(systemPrompt).toContain('<p>');
    expect(systemPrompt).toContain('KHÔNG dùng <script>');
    expect(`${systemPrompt}${userPrompt}`).not.toContain('group_name');
    expect(`${systemPrompt}${userPrompt}`).not.toContain('Zalo Nhóm');
    expect(userPrompt).toContain('subject');
    expect(SLOTS_RESPONSE_SCHEMA.properties.slots.items.properties.subject).toEqual({ type: 'string' });
    expect(SLOTS_RESPONSE_SCHEMA.properties.slots.items.required).toEqual(['slotId', 'message']);

    const { script, appliedCount } = applySlotsToGraph(compiled, [
      { slotId: compiled.contentSlots[0].slotId, subject: 'Khai giảng tuần này', message: '<p>Chào {{ten}}, khoá AI Automation khai giảng.</p>' },
      { slotId: compiled.contentSlots[1].slotId, subject: 'Nhắc lịch học', message: '<p>Mai học buổi đầu.</p>' },
    ]);
    expect(appliedCount).toBe(2);
    const sendEmail = script.nodes.find((n) => n.nodeSubtype === 'send_email');
    expect(sendEmail.config.emailSteps[0].emailSubject).toBe('Khai giảng tuần này');
    expect(sendEmail.config.emailSteps[0].emailBody).toContain('khai giảng');
    expect(sendEmail.config.emailSteps[1].emailSubject).toBe('Nhắc lịch học');
    expect(sendEmail.config.emailSteps[1].emailBody).toContain('Mai học');
  });

  it('email thiếu tiêu đề → ném lỗi (fail-open), không để thư không tiêu đề lọt qua', () => {
    const compiled = compileCampaign(emailDrip);
    expect(() => applySlotsToGraph(compiled, [
      { slotId: compiled.contentSlots[0].slotId, message: '<p>a</p>' },
      { slotId: compiled.contentSlots[1].slotId, subject: 'ok', message: '<p>b</p>' },
    ])).toThrow(/thiếu tiêu đề/);
  });

  it('email: bỏ <script>/<style>/on*=, chữ thuần được bọc <p>', () => {
    const compiled = compileCampaign({ ...emailDrip, schedule: { type: 'once' } });
    const { script } = applySlotsToGraph(compiled, [{
      slotId: compiled.contentSlots[0].slotId,
      subject: 'Tiêu đề\nhai dòng',
      message: '<style>p{color:red}</style><p onclick="x()">Xin chào</p><script>alert(1)</script>',
    }]);
    const step = script.nodes.find((n) => n.nodeSubtype === 'send_email').config.emailSteps[0];
    expect(step.emailBody).toBe('<p>Xin chào</p>');
    expect(step.emailSubject).toBe('Tiêu đề hai dòng');

    const plain = applySlotsToGraph(compiled, [{
      slotId: compiled.contentSlots[0].slotId,
      subject: 'S',
      message: 'Dòng một\n\nDòng hai',
    }]).script.nodes.find((n) => n.nodeSubtype === 'send_email').config.emailSteps[0];
    expect(plain.emailBody).toBe('<p>Dòng một</p>\n<p>Dòng hai</p>');
  });

  it('ca 3: slot zalo_group → prompt nhóm giữ nguyên (câu chào số đông, group_name, đối tượng mặc định)', () => {
    const compiled = compileCampaign(zaloGroupOnce);
    const { systemPrompt, userPrompt } = buildSlotFillingPrompt({
      slots: compiled.contentSlots,
      campaignIntent: zaloGroupOnce,
    });
    expect(systemPrompt).toContain('kênh Zalo Nhóm (Zalo Community/Group)');
    expect(systemPrompt).toContain('{{group_name}}');
    expect(systemPrompt).toContain('"Chào cả nhà!"');
    expect(userPrompt).toContain('Hãy soạn thảo nội dung tin nhắn Zalo nhóm');
    expect(userPrompt).toContain('- Đối tượng nhận tin: Học viên trong nhóm Zalo');

    const noAudience = buildSlotFillingPrompt({
      slots: compiled.contentSlots,
      campaignIntent: { ...zaloGroupOnce, contentBrief },
    });
    expect(noAudience.userPrompt).toContain('- Đối tượng nhận tin: Thành viên nhóm Zalo');
  });

  it('ca 4: slot Telegram/WhatsApp vẫn dùng prompt adapter', () => {
    const slots = [{ slotId: 's1', stepIndex: 0, channel: 'telegram' }];
    const tg = buildSlotFillingPrompt({ slots, campaignIntent: { contentBrief } });
    expect(tg.systemPrompt).toContain('kênh Telegram (tin nhắn chat 1-1 tới khách)');
    const wa = buildSlotFillingPrompt({ slots: [{ slotId: 's1', stepIndex: 0, channel: 'whatsapp' }], campaignIntent: { contentBrief } });
    expect(wa.systemPrompt).toContain('kênh WhatsApp');
  });

  it('groupSlotsByChannel: chia nhóm theo kênh, giữ thứ tự; slot không ghi kênh coi là zalo_group', () => {
    const groups = groupSlotsByChannel([
      { slotId: 'a', channel: 'email' },
      { slotId: 'b', channel: 'zalo' },
      { slotId: 'c', channel: 'email' },
      { slotId: 'd' },
    ]);
    expect(groups.map((g) => g.map((s) => s.slotId))).toEqual([['a', 'c'], ['b'], ['d']]);
  });
});

describe('PR-A — fillContentSlots theo kênh', () => {
  beforeEach(() => {
    generateGeminiContent.mockReset();
    record.mockReset();
    resolveAllowedModel.mockReset();
    resolveAllowedModel.mockResolvedValue('gemini-test');
  });

  it('email: một lượt gọi Gemini, prompt email, ra graph có emailSubject + emailBody', async () => {
    const compiled = compileCampaign({ ...emailDrip, schedule: { type: 'once' } });
    generateGeminiContent.mockResolvedValueOnce({
      text: JSON.stringify({
        slots: [{
          slotId: compiled.contentSlots[0].slotId,
          subject: 'Khai giảng khoá AI Automation',
          message: '<p>Chào {{ten}}, khoá AI Automation khai giảng tuần này.</p>',
        }],
      }),
    });
    const res = await fillContentSlots({ compiledGraph: compiled, campaignIntent: emailDrip, userId: 3 });
    expect(res.success).toBe(true);
    expect(generateGeminiContent).toHaveBeenCalledTimes(1);
    expect(generateGeminiContent.mock.calls[0][0].systemInstruction.parts[0].text).toContain('Email Marketing');
    const step = res.script.nodes.find((n) => n.nodeSubtype === 'send_email').config.emailSteps[0];
    expect(step.emailSubject).toBe('Khai giảng khoá AI Automation');
    expect(step.emailBody).toContain('khai giảng');
  });

  it('slot lẫn nhiều kênh: mỗi kênh một lượt gọi Gemini với prompt riêng, ghi token mỗi lượt', async () => {
    const emailCompiled = compileCampaign({ ...emailDrip, schedule: { type: 'once' } });
    const zaloCompiled = compileCampaign({ ...zaloPersonalDrip, schedule: { type: 'once' } });
    const emailSlot = emailCompiled.contentSlots[0];
    const zaloSlot = zaloCompiled.contentSlots[0];
    const mixed = {
      nodes: [...emailCompiled.nodes, ...zaloCompiled.nodes],
      connections: [...emailCompiled.connections, ...zaloCompiled.connections],
      contentSlots: [emailSlot, zaloSlot],
    };
    generateGeminiContent
      .mockResolvedValueOnce({ text: JSON.stringify({ slots: [{ slotId: emailSlot.slotId, subject: 'Tiêu đề', message: '<p>Thư</p>' }] }) })
      .mockResolvedValueOnce({ text: JSON.stringify({ slots: [{ slotId: zaloSlot.slotId, message: 'Chào bạn, khoá AI khai giảng.' }] }) });

    const res = await fillContentSlots({ compiledGraph: mixed, campaignIntent: emailDrip, userId: 3 });
    expect(res.success).toBe(true);
    expect(generateGeminiContent).toHaveBeenCalledTimes(2);
    expect(generateGeminiContent.mock.calls[0][0].systemInstruction.parts[0].text).toContain('Email Marketing');
    expect(generateGeminiContent.mock.calls[1][0].systemInstruction.parts[0].text).toContain('Zalo cá nhân');
    expect(record).toHaveBeenCalledTimes(2);
  });
});

describe('PR-A — lỗ audience.url (bảng tính đính kèm, không có link)', () => {
  it('wizard có bảng tính đính kèm + dataSource=sheet nhưng không sheetUrl → intent khuyết audience.url, lý do nói rõ tệp đính kèm', () => {
    const { intent } = deriveIntent({
      channel: 'zalo',
      senderAccountId: 5,
      dataSource: 'sheet',
      hasAttachedSpreadsheet: true,
      schedule: { mode: 'once' },
    }, { topicText: 'Khai giảng', contentLocale: 'vi' });
    const check = isCompilableIntent(intent);
    expect(check.ok).toBe(false);
    expect(check.missing).toEqual(['audience.url']);
    expect(check.reasons['audience.url']).toContain('ĐÍNH KÈM');
  });

  it('không có tệp đính kèm: vẫn khuyết audience.url nhưng lý do là thiếu link; intent ok vẫn là { ok, missing } trần', () => {
    const { intent } = deriveIntent({
      channel: 'zalo',
      senderAccountId: 5,
      dataSource: 'sheet',
      schedule: { mode: 'once' },
    }, { topicText: 'Khai giảng', contentLocale: 'vi' });
    const check = isCompilableIntent(intent);
    expect(check.reasons['audience.url']).toContain('chưa có link');
    expect(isCompilableIntent(zaloPersonalDrip)).toEqual({ ok: true, missing: [] });
  });
});
