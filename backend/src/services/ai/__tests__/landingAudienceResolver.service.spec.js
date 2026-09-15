import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const getFormIdForLandingSlug = jest.fn();

jest.unstable_mockModule('../../../repositories/ai/aiCampaign.repository.js', () => ({
  default: { getFormIdForLandingSlug },
}));

const { resolveLandingAudienceToForm, applyLandingAudienceResolution } = await import(
  '../landingAudienceResolver.service.js'
);
const { compileCampaign } = await import('../campaignCompiler.service.js');

describe('resolveLandingAudienceToForm (PR-5b-2b)', () => {
  beforeEach(() => {
    getFormIdForLandingSlug.mockReset();
  });

  it('đúng 1 slug, landing có form gắn → trả formId', async () => {
    getFormIdForLandingSlug.mockResolvedValue(7);
    const result = await resolveLandingAudienceToForm(3, ['khoa-hoc-ielts']);
    expect(result).toBe(7);
    expect(getFormIdForLandingSlug).toHaveBeenCalledWith(3, 'khoa-hoc-ielts');
  });

  it('đúng 1 slug, landing KHÔNG có form gắn → trả null', async () => {
    getFormIdForLandingSlug.mockResolvedValue(null);
    const result = await resolveLandingAudienceToForm(3, ['no-form-here']);
    expect(result).toBeNull();
  });

  // Phản biện: nhiều slug mà chỉ một số có form → mặc định GIỮ read_landing_leads (không đổi).
  it('2 slug (dù cả hai đều có form) → trả null, KHÔNG tra cứu (mặc định giữ read_landing_leads)', async () => {
    const result = await resolveLandingAudienceToForm(3, ['a', 'b']);
    expect(result).toBeNull();
    expect(getFormIdForLandingSlug).not.toHaveBeenCalled();
  });

  it('0 slug → trả null, không tra cứu', async () => {
    const result = await resolveLandingAudienceToForm(3, []);
    expect(result).toBeNull();
    expect(getFormIdForLandingSlug).not.toHaveBeenCalled();
  });

  it('slugs không phải mảng (null/undefined) → trả null, không throw', async () => {
    expect(await resolveLandingAudienceToForm(3, null)).toBeNull();
    expect(await resolveLandingAudienceToForm(3, undefined)).toBeNull();
    expect(getFormIdForLandingSlug).not.toHaveBeenCalled();
  });

  it('slug rỗng/khoảng trắng → trả null, không tra cứu', async () => {
    const result = await resolveLandingAudienceToForm(3, ['   ']);
    expect(result).toBeNull();
    expect(getFormIdForLandingSlug).not.toHaveBeenCalled();
  });

  it('lỗi tra cứu → trả null, fail-safe về hành vi cũ (không throw)', async () => {
    getFormIdForLandingSlug.mockRejectedValue(new Error('DB down'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await resolveLandingAudienceToForm(3, ['x']);
    expect(result).toBeNull();
    warnSpy.mockRestore();
  });
});

describe('applyLandingAudienceResolution (PR-5b-2b)', () => {
  beforeEach(() => {
    getFormIdForLandingSlug.mockReset();
  });

  it('audience.type !== "landing" → trả NGUYÊN intent (không đổi gì, cùng reference)', async () => {
    const intent = { version: 1, channel: 'email', audience: { type: 'db', recipientKind: 'email' } };
    const result = await applyLandingAudienceResolution(intent, 3);
    expect(result).toBe(intent);
    expect(getFormIdForLandingSlug).not.toHaveBeenCalled();
  });

  it('audience landing, đúng 1 slug, landing có form gắn id 7 → intent mới audience.type="form", formId=7, giữ recipientKind', async () => {
    getFormIdForLandingSlug.mockResolvedValue(7);
    const intent = {
      version: 1,
      channel: 'email',
      sender: { type: 'email_account', id: 1 },
      audience: { type: 'landing', slugs: ['khoa-hoc-ielts'], recipientKind: 'email' },
      schedule: { type: 'once' },
    };
    const result = await applyLandingAudienceResolution(intent, 3);
    expect(result).not.toBe(intent);
    expect(result.audience).toEqual({ type: 'form', formId: 7, recipientKind: 'email' });
    // Các trường khác của intent giữ nguyên.
    expect(result.channel).toBe('email');
    expect(result.sender).toEqual({ type: 'email_account', id: 1 });
  });

  it('audience landing, landing KHÔNG có form gắn → trả NGUYÊN intent (vẫn audience.type="landing")', async () => {
    getFormIdForLandingSlug.mockResolvedValue(null);
    const intent = {
      version: 1,
      audience: { type: 'landing', slugs: ['no-form'], recipientKind: 'email' },
    };
    const result = await applyLandingAudienceResolution(intent, 3);
    expect(result).toBe(intent);
    expect(result.audience.type).toBe('landing');
  });

  it('audience landing, nhiều slug → trả NGUYÊN intent (mặc định giữ read_landing_leads)', async () => {
    const intent = {
      version: 1,
      audience: { type: 'landing', slugs: ['a', 'b'], recipientKind: 'email' },
    };
    const result = await applyLandingAudienceResolution(intent, 3);
    expect(result).toBe(intent);
    expect(getFormIdForLandingSlug).not.toHaveBeenCalled();
  });
});

/**
 * Nghiệm thu hàng 1: "Ý định audience: { type: 'landing', slugs: ['x'] }, landing x có form gắn
 * id 7 → graph biên dịch có read_form_submissions formId = 7, không có read_landing_leads" —
 * chuỗi đầy đủ intent → applyLandingAudienceResolution → compileCampaign, không dừng ở test
 * riêng lẻ từng hàm.
 */
describe('applyLandingAudienceResolution + compileCampaign — nghiệm thu hàng 1', () => {
  beforeEach(() => {
    getFormIdForLandingSlug.mockReset();
  });

  it('landing 1 slug có form gắn id 7 → graph biên dịch có read_form_submissions formId=7, KHÔNG có read_landing_leads', async () => {
    getFormIdForLandingSlug.mockResolvedValue(7);
    const intent = {
      version: 1,
      channel: 'email',
      sender: { type: 'email_account', id: 1 },
      audience: { type: 'landing', slugs: ['khoa-hoc-ielts'], recipientKind: 'email' },
      schedule: { type: 'once' },
      contentBrief: { topic: 'Ra mắt khoá học', locale: 'vi' },
    };
    const resolved = await applyLandingAudienceResolution(intent, 3);
    const graph = compileCampaign(resolved);

    const formNode = graph.nodes.find((n) => n.nodeSubtype === 'read_form_submissions');
    const landingNode = graph.nodes.find((n) => n.nodeSubtype === 'read_landing_leads');
    expect(formNode).not.toBeUndefined();
    expect(formNode.config.formId).toBe(7);
    expect(landingNode).toBeUndefined();
  });

  it('landing 1 slug KHÔNG có form gắn → graph biên dịch VẪN dùng read_landing_leads (hành vi cũ)', async () => {
    getFormIdForLandingSlug.mockResolvedValue(null);
    const intent = {
      version: 1,
      channel: 'email',
      sender: { type: 'email_account', id: 1 },
      audience: { type: 'landing', slugs: ['khong-co-form'], recipientKind: 'email' },
      schedule: { type: 'once' },
      contentBrief: { topic: 'Ra mắt khoá học', locale: 'vi' },
    };
    const resolved = await applyLandingAudienceResolution(intent, 3);
    const graph = compileCampaign(resolved);

    const formNode = graph.nodes.find((n) => n.nodeSubtype === 'read_form_submissions');
    const landingNode = graph.nodes.find((n) => n.nodeSubtype === 'read_landing_leads');
    expect(landingNode).not.toBeUndefined();
    expect(landingNode.config.landingLeadsSlugs).toEqual(['khong-co-form']);
    expect(formNode).toBeUndefined();
  });
});
