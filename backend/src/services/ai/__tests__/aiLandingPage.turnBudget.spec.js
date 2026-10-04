import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-9 (B-4 / B-20) — ngân sách TỔNG của một lượt sinh / sửa landing, huỷ khi người dùng đóng kết nối, tiến độ cho luồng NDJSON.
 * Tách riêng khỏi aiLandingPage.service.spec.js (file đó đã rất lớn).
 */

const getContextForLandingAi = jest.fn(async () => '');
const generateWithBudget = jest.fn();

jest.unstable_mockModule('../businessProfile.service.js', () => ({
  default: { getContextForLandingAi },
}));

jest.unstable_mockModule('../aiUsageMeter.service.js', () => ({
  default: { generateWithBudget },
}));

const { default: aiLandingPageService, EDIT_TIME_BUDGET_MS } = await import('../aiLandingPage.service.js');
const { LANDING_TURN_TOTAL_MS } = await import('../../../utils/landingTurnBudget.util.js');
const { createClientAbortError } = await import('../../../utils/aiAbort.util.js');

const GOOD_PAGE =
  '<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>' +
  '<title>T</title><script src="https://cdn.tailwindcss.com"></script></head><body><h1>Khoá học</h1>' +
  '<form data-founderai-capture>' +
  '<input type="text" name="name" /><input type="email" name="email" /><input type="tel" name="phone" />' +
  '<label><input type="checkbox" name="marketingConsent" /> Đồng ý nhận thông tin</label>' +
  '<button type="submit">Đăng ký</button></form></body></html>';

const FAKE_URL = 'https://fake.cdn.com/bia.png';
const withFakeImage = (html) => html.replace('<h1>', `<img src="${FAKE_URL}" alt=""><h1>`);

const genResponse = (html) => ({
  text: JSON.stringify({ title: 'T', html }),
  blockReason: null,
  finishReason: 'STOP',
});
const patchResponse = (edits) => ({
  text: JSON.stringify({ title: 'T', edits, changeSummary: 'Đã đổi nút' }),
  blockReason: null,
  finishReason: 'STOP',
});
const BUTTON_EDIT = { find: '<button type="submit">Đăng ký</button>', replace: '<button type="submit">Gửi ngay</button>' };

/** Đồng hồ giả: mỗi lời gọi Gemini "tốn" `msPerCall` mili giây. */
function useFakeClock(msPerCall) {
  let now = 1_000_000;
  const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
  generateWithBudget.mockImplementation(async () => {
    now += msPerCall;
    return genResponse(GOOD_PAGE);
  });
  return { get now() { return now; }, advance: (ms) => { now += ms; }, restore: () => nowSpy.mockRestore() };
}

describe('PR-9 — generate(): trần tổng, signal, tiến độ', () => {
  let logSpy;
  beforeEach(() => {
    jest.clearAllMocks();
    generateWithBudget.mockReset();
    getContextForLandingAi.mockResolvedValue('');
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('B-20: không truyền deadline → lời gọi Gemini mang totalTimeoutMs = LANDING_TURN_TOTAL_MS và signal', async () => {
    generateWithBudget.mockResolvedValue(genResponse(GOOD_PAGE));
    const ctrl = new AbortController();
    await aiLandingPageService.generate({ userId: 1, prompt: 'landing', signal: ctrl.signal });
    const opts = generateWithBudget.mock.calls[0][1];
    expect(opts.totalTimeoutMs).toBeGreaterThan(LANDING_TURN_TOTAL_MS - 2000);
    expect(opts.totalTimeoutMs).toBeLessThanOrEqual(LANDING_TURN_TOTAL_MS);
    expect(opts.signal).toBe(ctrl.signal);
    // Đồng hồ MỖI lượt thử vẫn còn (chặn một lượt treo ăn hết ngân sách).
    expect(opts.timeoutMs).toBe(120000);
  });

  it('B-20: lượt SINH LẠI (ảnh bịa) nhận ngân sách CÒN LẠI — không phải trọn ngân sách lần nữa', async () => {
    const clock = useFakeClock(0);
    try {
      const deadlineAtMs = clock.now + 200_000;
      generateWithBudget
        .mockImplementationOnce(async () => { clock.advance(150_000); return genResponse(withFakeImage(GOOD_PAGE)); })
        .mockImplementationOnce(async () => { clock.advance(10_000); return genResponse(GOOD_PAGE); });
      await aiLandingPageService.generate({ userId: 1, prompt: 'landing', deadlineAtMs });
      expect(generateWithBudget).toHaveBeenCalledTimes(2);
      expect(generateWithBudget.mock.calls[0][1].totalTimeoutMs).toBe(200_000);
      // Còn 200 − 150 = 50 giây (không phải 200 giây): tổng hai lượt không bao giờ vượt hạn chót.
      expect(generateWithBudget.mock.calls[1][1].totalTimeoutMs).toBe(50_000);
    } finally {
      clock.restore();
    }
  });

  it('hạn chót đã qua → totalTimeoutMs vẫn > 0 (lõi Gemini tự báo hết giờ, không phải âm / NaN)', async () => {
    generateWithBudget.mockResolvedValue(genResponse(GOOD_PAGE));
    await aiLandingPageService.generate({ userId: 1, prompt: 'landing', deadlineAtMs: Date.now() - 5000 });
    expect(generateWithBudget.mock.calls[0][1].totalTimeoutMs).toBeGreaterThan(0);
  });

  it('tiến độ: generating ở lượt đầu; fixing khi sinh lại vì ảnh bịa', async () => {
    generateWithBudget
      .mockResolvedValueOnce(genResponse(withFakeImage(GOOD_PAGE)))
      .mockResolvedValueOnce(genResponse(GOOD_PAGE));
    const stages = [];
    await aiLandingPageService.generate({ userId: 1, prompt: 'landing', onStage: (s) => stages.push(s) });
    expect(stages).toEqual(['generating', 'fixing']);
  });

  it('người dùng đóng kết nối giữa lượt đầu → ném AI_CLIENT_ABORTED, KHÔNG sinh lại, log clientClosed=1', async () => {
    const ctrl = new AbortController();
    generateWithBudget.mockImplementation(async () => {
      ctrl.abort();
      throw createClientAbortError();
    });
    const err = await aiLandingPageService
      .generate({ userId: 1, prompt: 'landing', signal: ctrl.signal, streamed: 1 })
      .catch((e) => e);
    expect(err.code).toBe('AI_CLIENT_ABORTED');
    expect(generateWithBudget).toHaveBeenCalledTimes(1);
    const done = logSpy.mock.calls.map((c) => c[0]).find((l) => typeof l === 'string' && l.startsWith('[LandingAI] done'));
    expect(done).toContain('outcome=error');
    expect(done).toContain('streamed=1');
    expect(done).toContain('clientClosed=1');
    expect(done).toContain('dedup=0');
    expect(done).toContain('errorCode=AI_CLIENT_ABORTED');
  });

  it('lượt luồng thành công: log done mang streamed=1 clientClosed=0 dedup=0', async () => {
    generateWithBudget.mockResolvedValue(genResponse(GOOD_PAGE));
    await aiLandingPageService.generate({ userId: 1, prompt: 'landing', streamed: 1 });
    const done = logSpy.mock.calls.map((c) => c[0]).find((l) => typeof l === 'string' && l.startsWith('[LandingAI] done'));
    expect(done).toContain('streamed=1 clientClosed=0 dedup=0');
  });

  it('đường JSON cũ (không streamed): log done KHÔNG có ba trường mới (định dạng dòng log giữ nguyên)', async () => {
    generateWithBudget.mockResolvedValue(genResponse(GOOD_PAGE));
    await aiLandingPageService.generate({ userId: 1, prompt: 'landing' });
    const done = logSpy.mock.calls.map((c) => c[0]).find((l) => typeof l === 'string' && l.startsWith('[LandingAI] done'));
    expect(done).not.toMatch(/streamed=|clientClosed=|dedup=/);
  });
});

describe('PR-9 — editHtml(): ngân sách theo luồng, huỷ, tiến độ', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    generateWithBudget.mockReset();
    getContextForLandingAi.mockResolvedValue('');
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('lượt vá nhận totalTimeoutMs (hạn chót tổng) + signal; đường JSON cũ (không timeBudgetMs): timeoutMs ≤ 85 giây', async () => {
    generateWithBudget.mockResolvedValue(patchResponse([BUTTON_EDIT]));
    const ctrl = new AbortController();
    await aiLandingPageService.editHtml({ userId: 1, currentHtml: GOOD_PAGE, instruction: 'đổi nút', signal: ctrl.signal });
    const opts = generateWithBudget.mock.calls[0][1];
    expect(opts.signal).toBe(ctrl.signal);
    expect(opts.totalTimeoutMs).toBeGreaterThan(LANDING_TURN_TOTAL_MS - 2000);
    expect(opts.timeoutMs).toBeLessThanOrEqual(EDIT_TIME_BUDGET_MS);
  });

  it('đường luồng (timeBudgetMs = trần tổng): lượt vá được dùng ngân sách 240 giây, không bị bó 85 giây', async () => {
    generateWithBudget.mockResolvedValue(patchResponse([BUTTON_EDIT]));
    await aiLandingPageService.editHtml({
      userId: 1, currentHtml: GOOD_PAGE, instruction: 'đổi nút', timeBudgetMs: LANDING_TURN_TOTAL_MS,
    });
    expect(generateWithBudget.mock.calls[0][1].timeoutMs).toBeGreaterThan(EDIT_TIME_BUDGET_MS);
  });

  it('vá hỏng sau lượt đầu chậm (100 giây): đường luồng VẪN rơi xuống viết lại cả trang, đường JSON cũ thì không đủ giờ', async () => {
    const run = async (extra) => {
      const clock = useFakeClock(0);
      try {
        generateWithBudget
          .mockReset()
          .mockImplementationOnce(async () => { clock.advance(100_000); return { text: 'không phải JSON', blockReason: null, finishReason: 'STOP' }; })
          .mockImplementation(async () => {
            clock.advance(20_000);
            return { text: JSON.stringify({ title: 'T', html: GOOD_PAGE.replace('Khoá học', 'Khoá học mới'), changeSummary: 'x' }), blockReason: null, finishReason: 'STOP' };
          });
        const stages = [];
        const result = await aiLandingPageService
          .editHtml({ userId: 1, currentHtml: GOOD_PAGE, instruction: 'đổi', onStage: (s) => stages.push(s), ...extra })
          .catch((e) => e);
        return { result, stages, calls: generateWithBudget.mock.calls.length };
      } finally {
        clock.restore();
      }
    };

    const stream = await run({ timeBudgetMs: LANDING_TURN_TOTAL_MS });
    expect(stream.calls).toBe(2);
    expect(stream.result.html).toContain('Khoá học mới');
    expect(stream.stages).toEqual(['generating', 'fixing']);

    const legacy = await run({});
    expect(legacy.calls).toBe(1);
    expect(legacy.result.code).toBe('LANDING_PATCH_FAILED');
  });

  it('người dùng đóng kết nối giữa lượt vá → ném AI_CLIENT_ABORTED, KHÔNG rơi xuống viết lại cả trang (đỡ một lượt Gemini vô ích)', async () => {
    generateWithBudget.mockImplementation(async () => { throw createClientAbortError(); });
    const err = await aiLandingPageService
      .editHtml({ userId: 1, currentHtml: GOOD_PAGE, instruction: 'đổi nút' })
      .catch((e) => e);
    expect(err.code).toBe('AI_CLIENT_ABORTED');
    expect(generateWithBudget).toHaveBeenCalledTimes(1);
  });

  it('hết giờ (AbortError KHÔNG phải do client) vẫn là "vá hỏng timeout" như cũ', async () => {
    generateWithBudget.mockImplementation(async () => { throw Object.assign(new Error('hết giờ'), { name: 'AbortError' }); });
    const err = await aiLandingPageService
      .editHtml({ userId: 1, currentHtml: GOOD_PAGE, instruction: 'đổi nút', autoLayoutFix: true })
      .catch((e) => e);
    expect(err.code).toBe('LANDING_PATCH_FAILED');
  });
});
