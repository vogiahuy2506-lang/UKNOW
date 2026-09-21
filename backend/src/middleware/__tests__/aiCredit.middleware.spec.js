import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const assertAvailable = jest.fn();
const consume = jest.fn();

jest.unstable_mockModule('../../services/ai/aiCreditMeter.service.js', () => ({
  default: { assertAvailable, consume },
}));

const { assertAiCreditAvailable, chargeAiCredit } = await import('../aiCredit.middleware.js');

const makeRes = () => {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  return res;
};
const makeReq = (body = {}) => ({ user: { id: 7 }, body });

describe('assertAiCreditAvailable — lượt sửa tự động (plan landing tự kiểm, mục 10.2)', () => {
  beforeEach(() => {
    assertAvailable.mockReset();
    consume.mockReset();
    assertAvailable.mockResolvedValue({ plan: 'basic' });
  });

  it('không tự động: vẫn kiểm credit trước (assertAvailable) rồi cho đi tiếp', async () => {
    const req = makeReq({ instruction: 'đổi màu' });
    const next = jest.fn();
    await assertAiCreditAvailable('ai_edit_landing_html')(req, makeRes(), next);
    expect(assertAvailable).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.aiCreditSkipped).toBeUndefined();
    expect(req.aiCreditFeature).toBe('ai_edit_landing_html');
    expect(req.aiCreditContext).toEqual({ plan: 'basic' });
  });

  it('autoLayoutFix === true: BỎ pre-flight, đánh dấu aiCreditSkipped, đi tiếp', async () => {
    const req = makeReq({ autoLayoutFix: true });
    const res = makeRes();
    const next = jest.fn();
    await assertAiCreditAvailable('ai_edit_landing_html')(req, res, next);
    expect(assertAvailable).not.toHaveBeenCalled();
    expect(req.aiCreditSkipped).toBe(true);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('khách HẾT credit: lượt thường bị chặn, lượt tự sửa của hệ thống vẫn đi qua', async () => {
    const outOfCredit = Object.assign(new Error('Đã hết lượt AI trong kỳ'), {
      code: 'RESOURCE_LIMIT_EXCEEDED',
      status: 402,
    });
    assertAvailable.mockRejectedValue(outOfCredit);

    const resNormal = makeRes();
    const nextNormal = jest.fn();
    await assertAiCreditAvailable('ai_edit_landing_html')(makeReq({}), resNormal, nextNormal);
    expect(resNormal.status).toHaveBeenCalledWith(402);
    expect(nextNormal).not.toHaveBeenCalled();

    const nextAuto = jest.fn();
    await assertAiCreditAvailable('ai_edit_landing_html')(makeReq({ autoLayoutFix: true }), makeRes(), nextAuto);
    expect(nextAuto).toHaveBeenCalledTimes(1);
  });

  // Review 21/09 — lỗ chạm tiền: middleware dùng chung cho 11 route tính credit. Bản đầu miễn cho
  // MỌI feature hễ body có autoLayoutFix:true, và chargeAiCredit bỏ trừ theo cùng cờ → gửi thêm một
  // trường vào /ai/chat là dùng AI miễn phí không giới hạn. Chỉ feature sửa landing mới được miễn.
  it.each([
    'ai_assistant_chat', 'ai_assistant_chat_v2', 'ai_generate_campaign', 'ai_generate_campaign_v2',
    'ai_generate_landing_html', 'ai_generate_system_instruction', 'ai_custom_chat',
    'landing_template_generate', 'dashboard_insights', 'inbox_ai_summary',
  ])('feature KHÁC (%s) + autoLayoutFix:true → VẪN kiểm credit và VẪN bị trừ', async (feature) => {
    const req = makeReq({ autoLayoutFix: true });
    const next = jest.fn();
    await assertAiCreditAvailable(feature)(req, makeRes(), next);
    expect(assertAvailable).toHaveBeenCalledTimes(1);
    expect(req.aiCreditSkipped).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);

    consume.mockResolvedValue(undefined);
    await chargeAiCredit(req);
    expect(consume).toHaveBeenCalledTimes(1);
    expect(consume).toHaveBeenCalledWith(7, expect.objectContaining({ feature }));
  });

  it('feature KHÁC + autoLayoutFix:true + khách HẾT credit → bị chặn 402 như thường', async () => {
    assertAvailable.mockRejectedValue(Object.assign(new Error('Đã hết lượt AI trong kỳ'), { code: 'RESOURCE_LIMIT_EXCEEDED', status: 402 }));
    const res = makeRes();
    const next = jest.fn();
    await assertAiCreditAvailable('ai_assistant_chat')(makeReq({ autoLayoutFix: true }), res, next);
    expect(res.status).toHaveBeenCalledWith(402);
    expect(next).not.toHaveBeenCalled();
  });

  it.each([['"true"', 'true'], ['1', 1], ['"1"', '1'], ['{}', {}], ['false', false]])(
    'chỉ boolean true mới được miễn (autoLayoutFix = %s vẫn kiểm credit)',
    async (_label, value) => {
      const req = makeReq({ autoLayoutFix: value });
      const next = jest.fn();
      await assertAiCreditAvailable('ai_edit_landing_html')(req, makeRes(), next);
      expect(assertAvailable).toHaveBeenCalledTimes(1);
      expect(req.aiCreditSkipped).toBeUndefined();
    },
  );
});

describe('chargeAiCredit', () => {
  beforeEach(() => {
    consume.mockReset();
    consume.mockResolvedValue(undefined);
  });

  it('lượt thường: trừ 1 credit đúng feature', async () => {
    await chargeAiCredit({ user: { id: 7 }, aiCreditFeature: 'ai_edit_landing_html', aiCreditContext: { p: 1 } });
    expect(consume).toHaveBeenCalledTimes(1);
    expect(consume).toHaveBeenCalledWith(7, expect.objectContaining({ feature: 'ai_edit_landing_html' }));
  });

  it('req.aiCreditSkipped: KHÔNG bao giờ trừ, kể cả khi có feature (chốt thứ hai)', async () => {
    await chargeAiCredit({ user: { id: 7 }, aiCreditFeature: 'ai_edit_landing_html', aiCreditSkipped: true });
    expect(consume).not.toHaveBeenCalled();
  });
});
