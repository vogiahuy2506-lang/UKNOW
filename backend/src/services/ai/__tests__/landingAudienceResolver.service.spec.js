import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const getFormIdsForLandingSlug = jest.fn();

jest.unstable_mockModule('../../../repositories/ai/aiCampaign.repository.js', () => ({
  default: { getFormIdsForLandingSlug },
}));

const { resolveLandingAudienceToForms, applyLandingAudienceResolution } = await import(
  '../landingAudienceResolver.service.js'
);
const { compileCampaign } = await import('../campaignCompiler.service.js');

describe('resolveLandingAudienceToForms (PR-5b-2b, PR-7b)', () => {
  beforeEach(() => {
    getFormIdsForLandingSlug.mockReset();
  });

  it('đúng 1 slug, landing có form gắn → trả danh sách formId', async () => {
    getFormIdsForLandingSlug.mockResolvedValue([7]);
    const result = await resolveLandingAudienceToForms(3, ['khoa-hoc-ielts']);
    expect(result).toEqual([7]);
    expect(getFormIdsForLandingSlug).toHaveBeenCalledWith(3, 'khoa-hoc-ielts');
  });

  it('PR-7b: landing có 3 biểu mẫu → trả ĐỦ 3 id theo thứ tự (không chỉ biểu mẫu chính)', async () => {
    getFormIdsForLandingSlug.mockResolvedValue([4, 9, 12]);
    expect(await resolveLandingAudienceToForms(3, ['landing-3-form'])).toEqual([4, 9, 12]);
  });

  it('đúng 1 slug, landing KHÔNG có form gắn → trả null', async () => {
    getFormIdsForLandingSlug.mockResolvedValue([]);
    const result = await resolveLandingAudienceToForms(3, ['no-form-here']);
    expect(result).toBeNull();
  });

  // Phản biện: nhiều slug mà chỉ một số có form → mặc định GIỮ read_landing_leads (không đổi).
  it('2 slug (dù cả hai đều có form) → trả null, KHÔNG tra cứu (mặc định giữ read_landing_leads)', async () => {
    const result = await resolveLandingAudienceToForms(3, ['a', 'b']);
    expect(result).toBeNull();
    expect(getFormIdsForLandingSlug).not.toHaveBeenCalled();
  });

  it('0 slug → trả null, không tra cứu', async () => {
    const result = await resolveLandingAudienceToForms(3, []);
    expect(result).toBeNull();
    expect(getFormIdsForLandingSlug).not.toHaveBeenCalled();
  });

  it('slugs không phải mảng (null/undefined) → trả null, không throw', async () => {
    expect(await resolveLandingAudienceToForms(3, null)).toBeNull();
    expect(await resolveLandingAudienceToForms(3, undefined)).toBeNull();
    expect(getFormIdsForLandingSlug).not.toHaveBeenCalled();
  });

  it('slug rỗng/khoảng trắng → trả null, không tra cứu', async () => {
    const result = await resolveLandingAudienceToForms(3, ['   ']);
    expect(result).toBeNull();
    expect(getFormIdsForLandingSlug).not.toHaveBeenCalled();
  });

  it('lỗi tra cứu → trả null, fail-safe về hành vi cũ (không throw)', async () => {
    getFormIdsForLandingSlug.mockRejectedValue(new Error('DB down'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await resolveLandingAudienceToForms(3, ['x']);
    expect(result).toBeNull();
    warnSpy.mockRestore();
  });
});

describe('applyLandingAudienceResolution (PR-5b-2b)', () => {
  beforeEach(() => {
    getFormIdsForLandingSlug.mockReset();
  });

  it('audience.type !== "landing" → trả NGUYÊN intent (không đổi gì, cùng reference)', async () => {
    const intent = { version: 1, channel: 'email', audience: { type: 'db', recipientKind: 'email' } };
    const result = await applyLandingAudienceResolution(intent, 3);
    expect(result).toBe(intent);
    expect(getFormIdsForLandingSlug).not.toHaveBeenCalled();
  });

  it('audience landing, đúng 1 slug, landing có form gắn id 7 → intent mới audience.type="form", formId=7 + formIds=[7], giữ recipientKind', async () => {
    getFormIdsForLandingSlug.mockResolvedValue([7]);
    const intent = {
      version: 1,
      channel: 'email',
      sender: { type: 'email_account', id: 1 },
      audience: { type: 'landing', slugs: ['khoa-hoc-ielts'], recipientKind: 'email' },
      schedule: { type: 'once' },
    };
    const result = await applyLandingAudienceResolution(intent, 3);
    expect(result).not.toBe(intent);
    expect(result.audience).toEqual({ type: 'form', formId: 7, formIds: [7], recipientKind: 'email' });
    // Các trường khác của intent giữ nguyên.
    expect(result.channel).toBe('email');
    expect(result.sender).toEqual({ type: 'email_account', id: 1 });
  });

  it('PR-7b: audience landing, landing có 3 biểu mẫu → audience.formIds đủ 3 (formId = biểu mẫu đầu)', async () => {
    getFormIdsForLandingSlug.mockResolvedValue([5, 6, 8]);
    const intent = {
      version: 1,
      channel: 'email',
      audience: { type: 'landing', slugs: ['landing-3-form'], recipientKind: 'email' },
    };
    const result = await applyLandingAudienceResolution(intent, 3);
    expect(result.audience).toEqual({ type: 'form', formId: 5, formIds: [5, 6, 8], recipientKind: 'email' });
  });

  it('audience landing, landing KHÔNG có form gắn → trả NGUYÊN intent (vẫn audience.type="landing")', async () => {
    getFormIdsForLandingSlug.mockResolvedValue([]);
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
    expect(getFormIdsForLandingSlug).not.toHaveBeenCalled();
  });
});

/**
 * Nghiệm thu hàng 1: "Ý định audience: { type: 'landing', slugs: ['x'] }, landing x có form gắn
 * id 7 → graph biên dịch có read_form_submissions formIds = [7], không có read_landing_leads" —
 * chuỗi đầy đủ intent → applyLandingAudienceResolution → compileCampaign, không dừng ở test
 * riêng lẻ từng hàm.
 */
describe('applyLandingAudienceResolution + compileCampaign — nghiệm thu hàng 1', () => {
  beforeEach(() => {
    getFormIdsForLandingSlug.mockReset();
  });

  it('landing 1 slug có form gắn id 7 → graph biên dịch có read_form_submissions formIds=[7], KHÔNG có read_landing_leads', async () => {
    getFormIdsForLandingSlug.mockResolvedValue([7]);
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
    expect(formNode.config.formIds).toEqual([7]);
    expect(formNode.config.formId).toBeUndefined();
    expect(landingNode).toBeUndefined();
  });

  it('PR-7b nghiệm thu: landing có 3 biểu mẫu → node read_form_submissions đọc ĐỦ 3 (email once, email drip, zalo once, zalo drip)', async () => {
    getFormIdsForLandingSlug.mockResolvedValue([11, 12, 13]);
    const base = {
      version: 1,
      audience: { type: 'landing', slugs: ['landing-3-form'], recipientKind: 'email' },
      contentBrief: { topic: 'Ra mắt khoá học', locale: 'vi' },
    };
    const variants = [
      { ...base, channel: 'email', sender: { type: 'email_account', id: 1 }, schedule: { type: 'once' } },
      { ...base, channel: 'email', sender: { type: 'email_account', id: 1 }, schedule: { type: 'drip', days: 2, slotsPerDay: 1 } },
      { ...base, channel: 'zalo', sender: { type: 'zalo_account', id: 1 }, audience: { ...base.audience, recipientKind: 'phone' }, schedule: { type: 'once' } },
      { ...base, channel: 'zalo', sender: { type: 'zalo_account', id: 1 }, audience: { ...base.audience, recipientKind: 'phone' }, schedule: { type: 'drip', days: 2, slotsPerDay: 1 } },
    ];
    for (const intent of variants) {
      const resolved = await applyLandingAudienceResolution(intent, 3);
      const graph = compileCampaign(resolved);
      const formNodes = graph.nodes.filter((n) => n.nodeSubtype === 'read_form_submissions');
      expect(formNodes).toHaveLength(1);
      expect(formNodes[0].config).toEqual({ formIds: [11, 12, 13] });
      expect(graph.nodes.find((n) => n.nodeSubtype === 'read_landing_leads')).toBeUndefined();
    }
  });

  it('người dùng chọn MỘT biểu mẫu ở wizard (audience.formId, không formIds) → node vẫn { formId } như trước PR-7b', async () => {
    const intent = {
      version: 1,
      channel: 'email',
      sender: { type: 'email_account', id: 1 },
      audience: { type: 'form', formId: 42, recipientKind: 'email' },
      schedule: { type: 'once' },
      contentBrief: { topic: 'Ra mắt khoá học', locale: 'vi' },
    };
    const graph = compileCampaign(intent);
    const formNode = graph.nodes.find((n) => n.nodeSubtype === 'read_form_submissions');
    expect(formNode.config).toEqual({ formId: 42 });
  });

  it('landing 1 slug KHÔNG có form gắn → graph biên dịch VẪN dùng read_landing_leads (hành vi cũ)', async () => {
    getFormIdsForLandingSlug.mockResolvedValue([]);
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
