/**
 * PR-7a (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11) — AI landing tạo đúng LOẠI biểu mẫu (`AI_LANDING_FORM_MODE=form`).
 *
 *  - prompt: 1..3 chỗ trống CÓ LOẠI theo ý người dùng (cờ tắt: không đổi — xem aiLandingPage.promptFlagOff.spec.js);
 *  - kiểm sau sinh: 1..3 chỗ trống loại hợp lệ, từ chối loại lạ / `<form>` / >3 / 0;
 *  - nháp: chỗ trống MỚI có loại (không phải consult) gọi `draftForm` SONG SONG, lỗi / hết giờ một nháp chỉ làm mất nháp đó;
 *  - sửa trang: được THÊM chỗ trống (không được bớt / đổi loại), nháp chỉ cho chỗ trống mới;
 *  - kịch bản bằng model giả: bộ câu thử tiếng Việt → loại mong đợi (`inferExpectedFormSlotKinds`), KHÔNG gọi Gemini thật.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { FORM_SLOT_INTENT_RULES, inferExpectedFormSlotKinds } from '../../../utils/landingFormSlotIntent.util.js';

const getContextForLandingAi = jest.fn(async () => '');
const generateWithBudget = jest.fn();
const draftForm = jest.fn();

jest.unstable_mockModule('../businessProfile.service.js', () => ({ default: { getContextForLandingAi } }));
jest.unstable_mockModule('../aiUsageMeter.service.js', () => ({ default: { generateWithBudget } }));
jest.unstable_mockModule('../aiFormDraft.service.js', () => ({ draftForm, default: { draftForm } }));

const { default: aiLandingPageService, buildSlotFormDraftDescription, summarizeBriefForFormDraft } = await import('../aiLandingPage.service.js');

const HEAD =
  '<!DOCTYPE html><html lang="vi"><head><meta name="viewport" content="width=device-width, initial-scale=1"/>'
  + '<script src="https://cdn.tailwindcss.com"></script></head><body>';
const slotHtml = (kind) => (kind === 'bare' ? '<div data-founderai-form-slot></div>' : `<div data-founderai-form-slot="${kind}"></div>`);
/** Trang giả của model: mỗi chỗ trống một <section>; `kinds` có 'bare' = chỗ trống trần (consult). */
const pageWith = (kinds, extra = '') => `${HEAD}<section><h1>Trang</h1></section>${kinds.map((k) => `<section>${slotHtml(k)}</section>`).join('')}${extra}</body></html>`;

const modelReturnsHtml = (html) => {
  generateWithBudget.mockResolvedValue({ text: JSON.stringify({ title: 'Landing thử', html }), blockReason: null, finishReason: 'STOP' });
};
const modelReturnsEdits = (edits) => {
  generateWithBudget.mockResolvedValue({ text: JSON.stringify({ title: 'Landing thử', edits, changeSummary: 'Đã thêm biểu mẫu' }), blockReason: null, finishReason: 'STOP' });
};
const sentPrompt = (call = 0) => generateWithBudget.mock.calls[call][1].parts[0].text;

const fakeDraft = (kind) => ({
  mode: 'create',
  kind,
  title: `Biểu mẫu ${kind} của AI`,
  description: `Mô tả ${kind}`,
  fields: [
    { label: 'Họ và tên', type: 'short_text', required: true, role: 'name' },
    { label: 'Số điện thoại', type: 'phone', required: true, role: 'phone' },
  ],
  settings: { submitButtonText: 'Gửi', successMessage: 'Cảm ơn', notifyOwner: true, consentEnabled: true, sendConfirmation: false },
  bookingConfig: kind === 'booking' ? { enabled: true, weeklySlots: { 1: ['09:00'] } } : null,
  paymentConfig: null,
  needsAttention: kind === 'booking' ? ['booking'] : kind === 'payment' ? ['payment'] : [],
  businessContextUsed: false,
  usage: { creditCost: 1 },
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.AI_LANDING_FORM_MODE = 'form';
  delete process.env.AI_LANDING_EDIT_MODE;
  getContextForLandingAi.mockResolvedValue('');
  draftForm.mockImplementation(async ({ kind }) => fakeDraft(kind));
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  delete process.env.AI_LANDING_FORM_MODE;
  delete process.env.AI_LANDING_EDIT_MODE;
  jest.restoreAllMocks();
});

describe('prompt SINH khi cờ BẬT — chỗ trống CÓ LOẠI theo ý người dùng', () => {
  it('thay "ĐÚNG MỘT chỗ trống trần" bằng 1..3 chỗ trống có loại + bảng loại booking / payment / survey / consult', async () => {
    modelReturnsHtml(pageWith(['bare']));
    await aiLandingPageService.generate({ userId: 1, prompt: 'landing khoá học' });
    const prompt = sentPrompt();

    expect(prompt).not.toContain('ĐÚNG MỘT chỗ trống');
    expect(prompt).not.toContain('data-founderai-capture');
    expect(prompt).not.toContain('Sinh viên / Học sinh'); // rule 9 (trường nghề nghiệp của form viết tay) không chen vào
    expect(prompt).toMatch(/từ 1 đến 3 CHỖ TRỐNG/);
    expect(prompt).toContain('<div data-founderai-form-slot="LOẠI"></div>');
    for (const kind of ['booking', 'payment', 'survey', 'consult']) {
      expect(prompt).toContain(`   - ${kind} (`);
    }
    // dấu hiệu theo luật của user: đặt lịch/hẹn/khám/lịch tư vấn → booking; thu tiền/đặt cọc/giữ chỗ/thanh toán/mua → payment; khảo sát/góp ý/đánh giá → survey
    for (const phrase of ['đặt lịch', 'đặt hẹn', 'lịch khám', 'lịch tư vấn', 'thu tiền', 'đặt cọc', 'giữ chỗ', 'thanh toán', '"mua"', 'khảo sát', 'góp ý', 'đánh giá']) {
      expect(prompt).toContain(phrase);
    }
    expect(prompt).toMatch(/consult[^\n]*CHỈ viết thẻ TRẦN <div data-founderai-form-slot><\/div>/);
    expect(prompt).toMatch(/KHÔNG viết bất kỳ thẻ <form>/);
  });

  it('mọi cụm từ trong bảng luật đều có mặt trong prompt (prompt và đáp án của bộ câu thử cùng một nguồn)', async () => {
    modelReturnsHtml(pageWith(['bare']));
    await aiLandingPageService.generate({ userId: 1, prompt: 'landing khoá học' });
    const prompt = sentPrompt();
    for (const kind of ['booking', 'payment', 'survey']) {
      for (const phrase of FORM_SLOT_INTENT_RULES[kind].phrases) expect(prompt).toContain(`"${phrase}"`);
    }
  });
});

describe('kiểm sau sinh khi cờ BẬT — 1..3 chỗ trống có loại hợp lệ', () => {
  const run = () => aiLandingPageService.generate({ userId: 1, prompt: 'landing khoá học' });

  it.each([
    [['bare']],
    [['booking']],
    [['bare', 'booking']],
    [['bare', 'booking', 'payment']],
    [['payment', 'survey', 'blank']],
  ])('%j → chấp nhận, giữ nguyên html', async (kinds) => {
    const html = pageWith(kinds);
    modelReturnsHtml(html);
    const result = await run();
    expect(result.html).toBe(html);
  });

  it('0 chỗ trống → 422 "thiếu chỗ trống"', async () => {
    modelReturnsHtml(pageWith([]));
    await expect(run()).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/không tạo chỗ trống/) });
  });

  it('4 chỗ trống → 422 nêu số 4 và trần 3', async () => {
    modelReturnsHtml(pageWith(['bare', 'booking', 'payment', 'survey']));
    await expect(run()).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/4 chỗ trống.*tối đa 3/) });
  });

  it('loại LẠ (="contact") → 422 nêu loại không hợp lệ (không gộp vào "sai dạng")', async () => {
    modelReturnsHtml(pageWith(['booking', 'contact']));
    await expect(run()).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/loại không hợp lệ.*"contact"/) });
  });

  it('chỗ trống có nội dung con → 422 "sai dạng"; <form data-founderai-capture> lọt vào → 422', async () => {
    modelReturnsHtml(`${HEAD}<section><div data-founderai-form-slot="booking"><p>x</p></div></section></body></html>`);
    await expect(run()).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/sai dạng/) });

    modelReturnsHtml(pageWith(['booking'], '<form data-founderai-capture><input name="email"></form>'));
    await expect(run()).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/vẫn tự viết <form>/) });
  });
});

describe('nháp biểu mẫu theo chỗ trống (generate)', () => {
  it('chỗ trống trần + booking + payment → draftForm CHỈ cho booking và payment (consult giữ đường leadFormConfig), formDrafts đúng slotIndex/kind', async () => {
    modelReturnsHtml(pageWith(['bare', 'booking', 'payment']));
    const result = await aiLandingPageService.generate({
      userId: 7,
      actorUserId: 9,
      prompt: 'Tạo landing đã làm giàu\n\nTạo toàn bộ nội dung hiển thị bằng tiếng Việt.',
      userRequest: 'landing phòng khám nha khoa, khách đặt lịch khám và đặt cọc 200k',
      contentLocale: 'vi',
    });

    expect(draftForm).toHaveBeenCalledTimes(2);
    const calls = draftForm.mock.calls.map(([arg]) => arg);
    expect(calls.map((c) => c.kind).sort()).toEqual(['booking', 'payment']);
    for (const call of calls) {
      expect(call).toMatchObject({ ownerId: 7, actorUserId: 9, mode: 'create', feature: 'landing_page', locale: 'vi' });
      expect(call.description).toContain('landing phòng khám nha khoa, khách đặt lịch khám và đặt cọc 200k');
      expect(call.description).toContain('Landing thử'); // tiêu đề trang
      expect(call.description.length).toBeLessThanOrEqual(1000);
      expect(Number.isFinite(call.timeoutMs) && call.timeoutMs > 0 && call.timeoutMs <= 25000).toBe(true);
    }

    expect(result.formDrafts.map((d) => [d.slotIndex, d.kind])).toEqual([[1, 'booking'], [2, 'payment']]);
    const [booking, payment] = result.formDrafts;
    expect(Object.keys(booking).sort()).toEqual(['bookingConfig', 'description', 'fields', 'kind', 'needsAttention', 'settings', 'slotIndex', 'title']);
    expect(booking.title).toBe('Biểu mẫu booking của AI');
    expect(booking.needsAttention).toEqual(['booking']);
    expect(payment.needsAttention).toEqual(['payment']);
    expect(JSON.stringify(result.formDrafts)).not.toContain('paymentConfig');
    expect(result.html).toBe(pageWith(['bare', 'booking', 'payment']));
  });

  it('các nháp chạy SONG SONG: cả hai lời gọi draftForm đã bắt đầu trước khi cái nào xong', async () => {
    modelReturnsHtml(pageWith(['booking', 'survey']));
    const releases = [];
    draftForm.mockImplementation(({ kind }) => new Promise((resolve) => {
      releases.push(() => resolve(fakeDraft(kind)));
    }));

    const pending = aiLandingPageService.generate({ userId: 1, prompt: 'landing khảo sát và đặt lịch' });
    for (let i = 0; i < 50 && releases.length < 2; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => { setImmediate(resolve); });
    }
    expect(releases).toHaveLength(2); // cả hai đã được gọi mà chưa cái nào trả về → chạy song song, không tuần tự
    releases.forEach((release) => release());
    const result = await pending;
    expect(result.formDrafts.map((d) => d.kind)).toEqual(['booking', 'survey']);
  });

  it('một nháp LỖI → bỏ nháp đó, nháp còn lại vẫn có; lượt không hỏng', async () => {
    modelReturnsHtml(pageWith(['booking', 'payment']));
    draftForm.mockImplementation(async ({ kind }) => {
      if (kind === 'booking') throw new Error('Gemini 503');
      return fakeDraft(kind);
    });
    const result = await aiLandingPageService.generate({ userId: 1, prompt: 'landing đặt lịch và thu cọc' });
    expect(result.html).toBe(pageWith(['booking', 'payment']));
    expect(result.formDrafts.map((d) => d.kind)).toEqual(['payment']);
  });

  it('tất cả nháp lỗi → formDrafts rỗng, html vẫn trả bình thường', async () => {
    modelReturnsHtml(pageWith(['booking', 'payment']));
    draftForm.mockRejectedValue(new Error('hết token AI'));
    const result = await aiLandingPageService.generate({ userId: 1, prompt: 'landing đặt lịch và thu cọc' });
    expect(result.formDrafts).toEqual([]);
    expect(result.title).toBe('Landing thử');
  });

  it('nháp trả sai loại / thiếu trường → bỏ nháp đó', async () => {
    modelReturnsHtml(pageWith(['booking', 'survey']));
    draftForm.mockImplementation(async ({ kind }) => (kind === 'booking' ? { ...fakeDraft('survey') } : { ...fakeDraft('survey'), fields: undefined }));
    const result = await aiLandingPageService.generate({ userId: 1, prompt: 'landing' });
    expect(result.formDrafts).toEqual([]);
  });

  it('một nháp QUÁ HẠN chót → bỏ nháp đó, không treo lượt', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
    try {
      modelReturnsHtml(pageWith(['booking', 'payment']));
      draftForm.mockImplementation(({ kind }) => (kind === 'booking' ? new Promise(() => {}) : Promise.resolve(fakeDraft(kind))));
      let finished = false;
      const pending = aiLandingPageService.generate({ userId: 1, prompt: 'landing', streamed: 1, deadlineAtMs: Date.now() + 240000 })
        .finally(() => { finished = true; });
      for (let i = 0; i < 60 && !finished; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => { setImmediate(resolve); });
        // eslint-disable-next-line no-await-in-loop
        await jest.advanceTimersByTimeAsync(1000);
      }
      expect(finished).toBe(true);
      const result = await pending;
      expect(result.formDrafts.map((d) => d.kind)).toEqual(['payment']);
    } finally {
      jest.useRealTimers();
    }
  });

  it('chỉ có chỗ trống consult (trần hoặc ="consult") → KHÔNG gọi draftForm, formDrafts rỗng', async () => {
    modelReturnsHtml(pageWith(['bare', 'consult']));
    const result = await aiLandingPageService.generate({ userId: 1, prompt: 'trang giới thiệu công ty' });
    expect(draftForm).not.toHaveBeenCalled();
    expect(result.formDrafts).toEqual([]);
  });

  it('hết ngân sách lượt (còn dưới 6 giây sau chừa) → bỏ qua nháp, KHÔNG gọi model, lượt vẫn thành công', async () => {
    modelReturnsHtml(pageWith(['booking']));
    const result = await aiLandingPageService.generate({ userId: 1, prompt: 'landing', deadlineAtMs: Date.now() + 9000 });
    expect(draftForm).not.toHaveBeenCalled();
    expect(result.formDrafts).toEqual([]);
  });

  it('khách đã đóng kết nối (signal đã huỷ) → không gọi draftForm; signal được truyền cho draftForm khi còn sống', async () => {
    modelReturnsHtml(pageWith(['booking']));
    const aborted = new AbortController();
    aborted.abort();
    const skipped = await aiLandingPageService.generate({ userId: 1, prompt: 'landing', signal: aborted.signal });
    expect(draftForm).not.toHaveBeenCalled();
    expect(skipped.formDrafts).toEqual([]);

    const live = new AbortController();
    modelReturnsHtml(pageWith(['booking']));
    await aiLandingPageService.generate({ userId: 1, prompt: 'landing', signal: live.signal });
    expect(draftForm.mock.calls[0][0].signal).toBe(live.signal);
  });

  it('cờ TẮT → không gọi draftForm, kết quả không có khoá formDrafts (đường form viết tay y như cũ)', async () => {
    delete process.env.AI_LANDING_FORM_MODE;
    const captureHtml =
      `${HEAD}<form data-founderai-capture><input type="text" name="name" /><input type="email" name="email" /><input type="tel" name="phone" />`
      + '<label><input type="checkbox" name="marketingConsent" /> Đồng ý</label><button type="submit">Đăng ký</button></form></body></html>';
    modelReturnsHtml(captureHtml);
    const result = await aiLandingPageService.generate({ userId: 1, prompt: 'landing đặt lịch' });
    expect(draftForm).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty('formDrafts');
  });
});

describe('mô tả đưa cho nháp', () => {
  it('buildSlotFormDraftDescription: có loại + tên trang + câu của người dùng, làm phẳng xuống dòng, không quá 1000 ký tự', () => {
    const text = buildSlotFormDraftDescription({
      kind: 'booking',
      title: 'Nha khoa A',
      userRequest: `đặt lịch\nkhám răng\t${'x'.repeat(5000)}`,
      briefSummary: 'Sản phẩm / dịch vụ: Niềng răng. Mục tiêu trang: lead.',
    });
    expect(text.length).toBeLessThanOrEqual(1000);
    expect(text).toContain('Đặt lịch hẹn');
    expect(text).toContain('"Nha khoa A"');
    expect(text).toContain('đặt lịch khám răng');
    expect(text).toContain('Niềng răng');
    expect(text).not.toMatch(/[\n\t]/);
  });

  it('summarizeBriefForFormDraft: lấy tên sản phẩm + mục tiêu từ khối LANDING_BRIEF; không có thì rỗng', () => {
    const ctx = ['=== LANDING_BRIEF DATA ===', 'productMode: other', 'selectedProduct.name: """Khoá IELTS"""', 'pageGoal: event', '=== END ==='].join('\n');
    expect(summarizeBriefForFormDraft(ctx)).toBe('Sản phẩm / dịch vụ: Khoá IELTS. Mục tiêu trang: event.');
    expect(summarizeBriefForFormDraft(null)).toBe('');
    expect(summarizeBriefForFormDraft('không có gì')).toBe('');
  });
});

describe('sửa trang (editHtml) khi cờ BẬT', () => {
  const current = `${HEAD}<section><div data-founderai-form-slot="booking"></div></section><section id="cta"><h2>Mua ngay</h2></section></body></html>`;
  const addPayment = [{
    find: '<section id="cta"><h2>Mua ngay</h2></section>',
    replace: '<section id="cta"><h2>Mua ngay</h2></section><section><div data-founderai-form-slot="payment"></div></section>',
  }];
  const edit = (overrides = {}) => aiLandingPageService.editHtml({
    userId: 3, currentHtml: current, instruction: 'thêm form thu cọc giữ chỗ', ...overrides,
  });

  it('prompt có luật 2e (giữ nguyên chỗ trống, chỉ THÊM khi người dùng xin, bảng loại) — cả đường vá lẫn viết lại', async () => {
    modelReturnsEdits([]);
    await edit();
    const patchPrompt = sentPrompt();
    expect(patchPrompt).toMatch(/2e\) BIỂU MẪU CỦA TRANG/);
    expect(patchPrompt).toMatch(/NÓI RÕ muốn THÊM một biểu mẫu mới/);
    expect(patchPrompt).toContain('<div data-founderai-form-slot="LOẠI"></div>');
    expect(patchPrompt).toContain('   - booking (');
    expect(patchPrompt).toMatch(/2c\) TRANG ĐANG CÓ CHỖ TRỐNG CHỜ BIỂU MẪU/); // luật 2c cũ vẫn còn
    expect(patchPrompt).toMatch(/\n2e\) [\s\S]*\n3\) Trả về JSON/);

    generateWithBudget.mockClear();
    process.env.AI_LANDING_EDIT_MODE = 'full';
    generateWithBudget.mockResolvedValue({ text: JSON.stringify({ title: 'T', html: current }), finishReason: 'STOP' });
    await edit();
    expect(sentPrompt()).toMatch(/2e\) BIỂU MẪU CỦA TRANG/);
  });

  it('trang CHƯA có chỗ trống nào vẫn có luật 2e (người dùng xin "thêm form đặt lịch" lần đầu)', async () => {
    modelReturnsEdits([]);
    await aiLandingPageService.editHtml({ userId: 3, currentHtml: `${HEAD}<section>x</section></body></html>`, instruction: 'thêm form đặt lịch' });
    expect(sentPrompt()).toMatch(/2e\) BIỂU MẪU CỦA TRANG/);
    expect(sentPrompt()).not.toMatch(/2c\) TRANG ĐANG CÓ CHỖ TRỐNG/);
  });

  it('lượt tự sửa hiển thị (miễn phí) KHÔNG có luật 2e và không bao giờ gọi draftForm', async () => {
    modelReturnsEdits([]);
    await edit({ autoLayoutFix: true, layoutFindingsCount: 1 });
    expect(sentPrompt()).not.toMatch(/2e\) BIỂU MẪU CỦA TRANG/);
    expect(draftForm).not.toHaveBeenCalled();
  });

  it('AI THÊM chỗ trống payment → chốt sửa cho qua; draftForm CHỈ cho chỗ trống mới (payment, slotIndex 1), booking cũ không soạn lại', async () => {
    modelReturnsEdits(addPayment);
    const result = await edit({ userRequest: 'thêm form thu cọc giữ chỗ 300k', contentLocale: 'vi' });
    expect(result.html).toContain('data-founderai-form-slot="payment"');
    expect(draftForm).toHaveBeenCalledTimes(1);
    expect(draftForm.mock.calls[0][0]).toMatchObject({ ownerId: 3, kind: 'payment', feature: 'landing_page', mode: 'create' });
    expect(draftForm.mock.calls[0][0].description).toContain('thêm form thu cọc giữ chỗ 300k');
    expect(result.formDrafts.map((d) => [d.slotIndex, d.kind])).toEqual([[1, 'payment']]);
  });

  it('AI chèn chỗ trống MỚI ĐỨNG TRƯỚC chỗ trống cũ cùng loại khác → slotIndex tính theo HTML mới, chỗ trống cũ không bị soạn lại', async () => {
    modelReturnsEdits([{
      find: '<section><div data-founderai-form-slot="booking"></div></section>',
      replace: '<section><div data-founderai-form-slot="survey"></div></section><section><div data-founderai-form-slot="booking"></div></section>',
    }]);
    const result = await edit({ instruction: 'thêm khảo sát lên trên form đặt lịch' });
    expect(result.formDrafts.map((d) => [d.slotIndex, d.kind])).toEqual([[0, 'survey']]);
    expect(draftForm.mock.calls.map(([a]) => a.kind)).toEqual(['survey']);
  });

  it('sửa màu / chữ mà giữ nguyên chỗ trống → formDrafts rỗng, không gọi draftForm', async () => {
    modelReturnsEdits([{ find: '<h2>Mua ngay</h2>', replace: '<h2>Mua liền tay</h2>' }]);
    const result = await edit({ instruction: 'đổi chữ nút' });
    expect(draftForm).not.toHaveBeenCalled();
    expect(result.formDrafts).toEqual([]);
  });

  it('AI BỚT chỗ trống cũ → 422 "mất hoặc sửa sai chỗ trống"', async () => {
    modelReturnsEdits([{ find: '<section><div data-founderai-form-slot="booking"></div></section>', replace: '' }]);
    await expect(edit({ instruction: 'đổi màu' })).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/chỗ trống chờ Biểu mẫu/) });
    expect(draftForm).not.toHaveBeenCalled();
  });

  it('AI đổi loại chỗ trống cũ (booking → trần) → 422 dù tổng số không đổi', async () => {
    modelReturnsEdits([{ find: '<div data-founderai-form-slot="booking"></div>', replace: '<div data-founderai-form-slot></div>' }]);
    await expect(edit({ instruction: 'đổi màu' })).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/chỗ trống chờ Biểu mẫu/) });
  });

  it('AI thêm chỗ trống KÈM <form> tự viết, hoặc thêm loại lạ, hoặc thêm 4 chỗ trống → 422', async () => {
    modelReturnsEdits([{
      find: '<h2>Mua ngay</h2>',
      replace: '<h2>Mua ngay</h2><div data-founderai-form-slot="payment"></div><form action="#"><input name="x"></form>',
    }]);
    await expect(edit()).rejects.toMatchObject({ status: 422 });

    modelReturnsEdits([{ find: '<h2>Mua ngay</h2>', replace: '<h2>Mua ngay</h2><div data-founderai-form-slot="contact"></div>' }]);
    await expect(edit()).rejects.toMatchObject({ status: 422 });

    const four = ['payment', 'survey', 'blank', 'booking'].map((k) => `<div data-founderai-form-slot="${k}"></div>`).join('');
    modelReturnsEdits([{ find: '<h2>Mua ngay</h2>', replace: `<h2>Mua ngay</h2>${four}` }]);
    await expect(edit()).rejects.toMatchObject({ status: 422 });
  });

  it('cờ TẮT: thêm chỗ trống khi trang đã có chỗ trống → 422 (so đa tập như PR-6); không gọi draftForm', async () => {
    delete process.env.AI_LANDING_FORM_MODE;
    modelReturnsEdits(addPayment);
    await expect(edit()).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/chỗ trống chờ Biểu mẫu/) });
    expect(draftForm).not.toHaveBeenCalled();
    expect(sentPrompt()).not.toMatch(/2e\) BIỂU MẪU CỦA TRANG/);
  });
});

/**
 * Bộ câu thử (tiếng Việt) → loại chỗ trống MONG ĐỢI. Model giả trả đúng trang theo bảng này; test kiểm cả chuỗi
 * prompt → chốt sau sinh → nháp → formDrafts mà KHÔNG gọi Gemini thật.
 */
const QUESTION_SET = [
  ['làm landing phòng khám nha khoa cho khách đặt lịch khám', ['booking']],
  ['landing khoá học IELTS thu cọc giữ chỗ 500k', ['payment']],
  ['trang khảo sát hài lòng sau sự kiện', ['survey']],
  ['landing spa có form tư vấn và đặt lịch', ['consult', 'booking']],
  ['landing bán khoá học online', ['payment']],
  ['landing tuyển dụng nhân viên bán hàng', ['consult']],
  ['trang giới thiệu công ty', ['consult']],
  ['landing workshop miễn phí đăng ký tham dự', ['consult']],
  ['landing khuyến mãi mùa hè', ['consult']],
  ['landing đặt lịch tư vấn miễn phí', ['booking']],
  ['landing khám sức khoẻ: đặt cọc giữ lịch và đặt lịch khám', ['booking', 'payment']],
  ['landing cho khách mua ngay và để lại thông tin liên hệ', ['consult', 'payment']],
];

describe('bộ câu thử + model giả (không gọi Gemini thật)', () => {
  it.each(QUESTION_SET)('inferExpectedFormSlotKinds(%j) = %j', (question, expected) => {
    expect(inferExpectedFormSlotKinds(question)).toEqual(expected);
  });

  it('không phân biệt cách gõ dấu (NFC / NFD) và hoa thường; "mùa" không bị đọc thành "mua"', () => {
    expect(inferExpectedFormSlotKinds('ĐẶT LỊCH KHÁM'.normalize('NFD'))).toEqual(['booking']);
    expect(inferExpectedFormSlotKinds('khuyến mãi mùa mưa')).toEqual(['consult']);
    expect(inferExpectedFormSlotKinds('')).toEqual(['consult']);
    expect(inferExpectedFormSlotKinds(null)).toEqual(['consult']);
  });

  it.each(QUESTION_SET)('kịch bản %j: model giả đặt đúng loại → qua chốt, nháp đúng loại, câu hỏi nằm trong mô tả nháp', async (question, expected) => {
    const kindsInHtml = expected.map((k) => (k === 'consult' ? 'bare' : k));
    modelReturnsHtml(pageWith(kindsInHtml));

    const result = await aiLandingPageService.generate({ userId: 1, prompt: question, userRequest: question });

    // câu của người dùng đã vào prompt gửi model
    expect(sentPrompt()).toContain(question);
    // chốt sau sinh cho qua; nháp chỉ cho các loại KHÁC consult, đúng thứ tự chỗ trống trong HTML
    const expectedDrafts = expected.map((kind, slotIndex) => [slotIndex, kind]).filter(([, kind]) => kind !== 'consult');
    expect(result.formDrafts.map((d) => [d.slotIndex, d.kind])).toEqual(expectedDrafts);
    expect(draftForm).toHaveBeenCalledTimes(expectedDrafts.length);
    for (const [arg] of draftForm.mock.calls) expect(arg.description).toContain(question);
  });
});
