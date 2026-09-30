import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-12 (audit_ai.md C-4): điền nội dung chiến dịch bằng LLM (slot filling) đi thẳng generateGeminiContent nên bản cũ bỏ
 * `res.usage` — Google tính tiền mà `usage_logs` không có dòng nào. Nay ghi token `campaign_slots` cho `userId`.
 *
 * Tách file riêng vì cần MOCK generateGeminiContent + aiUsageMeter ở mức module; campaignSlotFiller.spec.js chạy code thật.
 */
const generateGeminiContent = jest.fn();
const record = jest.fn();
const resolveAllowedModel = jest.fn();

jest.unstable_mockModule('../../../utils/geminiClient.util.js', () => ({ generateGeminiContent }));
jest.unstable_mockModule('../aiUsageMeter.service.js', () => ({ default: { record } }));
jest.unstable_mockModule('../aiModelPolicy.service.js', () => ({ resolveAllowedModel }));

const { compileCampaign } = await import('../campaignCompiler.service.js');
const { fillContentSlots } = await import('../campaignSlotFiller.service.js');

const intent = {
  version: 1,
  channel: 'zalo_group',
  sender: { type: 'zalo_account', id: 8 },
  audience: { type: 'zalo_contacts', groupIds: ['g1', 'g2'] },
  schedule: { type: 'once' },
  contentBrief: {
    topic: 'Khai giảng khoá học AI Automation',
    targetAudience: 'Học viên trong nhóm Zalo',
    tone: 'Hào hứng, chuyên nghiệp',
    locale: 'vi',
  },
};

const USAGE = { promptTokens: 400, outputTokens: 60, totalTokens: 520 };

describe('fillContentSlots — ghi token campaign_slots', () => {
  beforeEach(() => {
    generateGeminiContent.mockReset();
    record.mockReset();
    resolveAllowedModel.mockReset();
    record.mockResolvedValue(undefined);
    resolveAllowedModel.mockResolvedValue('gemini-3.5-flash');
  });

  it('thành công: ghi đúng 1 dòng token feature=campaign_slots cho userId, model thật, kèm usage của Google', async () => {
    const compiled = compileCampaign(intent);
    generateGeminiContent.mockResolvedValue({
      text: JSON.stringify({
        slots: [{ slotId: compiled.contentSlots[0].slotId, message: 'Chào cả nhà! Khoá AI Automation khai giảng tối thứ 6 tuần này.' }],
      }),
      usage: USAGE,
      modelUsed: 'gemini-du-phong',
    });

    const res = await fillContentSlots({
      compiledGraph: compiled, campaignIntent: intent, userId: 7, requestedModel: 'gemini-x',
    });

    expect(res.success).toBe(true);
    expect(record).toHaveBeenCalledTimes(1);
    // model = model THẬT đã trả lời (dự phòng), không phải model hệ thống đã chọn
    expect(record).toHaveBeenCalledWith(7, USAGE, { feature: 'campaign_slots', model: 'gemini-du-phong' });
    // userId / requestedModel đi tới chính sách chọn model (bản cũ luôn null vì nơi gọi lồng trong options)
    expect(resolveAllowedModel).toHaveBeenCalledWith(7, 'gemini-x');
  });

  it('model thật không có trong kết quả → ghi model đã chọn', async () => {
    const compiled = compileCampaign(intent);
    generateGeminiContent.mockResolvedValue({
      text: JSON.stringify({ slots: [{ slotId: compiled.contentSlots[0].slotId, message: 'Nội dung hợp lệ cho nhóm.' }] }),
      usage: USAGE,
    });

    await fillContentSlots({ compiledGraph: compiled, campaignIntent: intent, userId: 7 });

    expect(record).toHaveBeenCalledWith(7, USAGE, { feature: 'campaign_slots', model: 'gemini-3.5-flash' });
  });

  it.each([
    ['rỗng', { text: '   ', usage: USAGE }, 'empty_llm_response'],
    // parseAiJson tự sửa được nhiều kiểu JSON hỏng nên rơi vào nhánh "không có slot" hoặc lỗi parse tuỳ kiểu hỏng — cả hai đều bỏ nội dung
    ['JSON hỏng', { text: '{không phải json', usage: USAGE }, 'json_parse_error|no_slots_in_llm_response'],
    ['không có slot', { text: JSON.stringify({ slots: [] }), usage: USAGE }, 'no_slots_in_llm_response'],
  ])('LLM trả %s (nội dung bị bỏ, fail-open): Google vẫn tính tiền nên VẪN ghi token', async (_label, response, errorPrefix) => {
    const compiled = compileCampaign(intent);
    generateGeminiContent.mockResolvedValue(response);

    const res = await fillContentSlots({ compiledGraph: compiled, campaignIntent: intent, userId: 7 });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(new RegExp(errorPrefix));
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(7, USAGE, expect.objectContaining({ feature: 'campaign_slots' }));
  });

  it('gọi Gemini ném lỗi (không có phản hồi nào để tính tiền): không ghi gì, vẫn fail-open', async () => {
    const compiled = compileCampaign(intent);
    generateGeminiContent.mockRejectedValue(new Error('Gemini API lỗi (503)'));

    const res = await fillContentSlots({ compiledGraph: compiled, campaignIntent: intent, userId: 7 });

    expect(res.success).toBe(false);
    expect(record).not.toHaveBeenCalled();
  });

  it('không có slot nào để điền: không gọi Gemini, không ghi', async () => {
    const res = await fillContentSlots({
      compiledGraph: { nodes: [], connections: [], contentSlots: [] }, campaignIntent: intent, userId: 7,
    });
    expect(res).toEqual({ success: false, error: 'no_slots_to_fill' });
    expect(generateGeminiContent).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });
});
