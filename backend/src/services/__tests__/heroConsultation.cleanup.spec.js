import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * D-26 (04/10/2026) — vụn vặt của khung chat tư vấn trang chủ:
 *   (c) bộ đếm dự phòng trong RAM không bao giờ dọn khoá hết hạn → phình khi không có Redis;
 *   (d) log mỗi request (nội dung bảng giá "Plans text"…) làm đầy log docker;
 *   (e) câu lỗi cho khách viết không dấu ("Ban da het luot chat mien phi", "Xin loi, da xay ra loi…").
 * Phần "lưu hội thoại 30 ngày" CỐ Ý không làm (chưa có quyết định của sếp).
 */
const resolveAllowedModel = jest.fn();
const record = jest.fn();
jest.unstable_mockModule('../ai/aiModelPolicy.service.js', () => ({ resolveAllowedModel }));
jest.unstable_mockModule('../ai/aiUsageMeter.service.js', () => ({ default: { record } }));

const { default: heroConsultationService, MEMORY_COUNTERS_SWEEP_THRESHOLD } = await import('../heroConsultation.service.js');

const phanHoiThat = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=UTF-8' },
});
const duocThat = (text) => phanHoiThat(200, {
  candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP', index: 0 }],
  usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 3, totalTokenCount: 12 },
});

// Có ít nhất một chữ cái tiếng Việt mang dấu — câu không dấu ("Ban da het luot...") không bao giờ có.
const CO_DAU = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

describe('heroConsultation — bộ đếm RAM dọn khoá hết hạn (D-26c)', () => {
  const T0 = 1_800_000_000_000;
  let now;
  let nowSpy;
  const incr = (i, windowSec) => heroConsultationService.incrWithTtl(`herochat:test:${i}`, windowSec);

  beforeEach(() => {
    heroConsultationService._resetForTests();
    now = T0;
    nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  it('chạm ngưỡng + khoá đã hết hạn → quét sạch, chỉ còn khoá vừa thêm', async () => {
    for (let i = 0; i < MEMORY_COUNTERS_SWEEP_THRESHOLD; i += 1) await incr(i, 10);
    expect(heroConsultationService._memoryCounterSize()).toBe(MEMORY_COUNTERS_SWEEP_THRESHOLD);

    now = T0 + 20_000; // quá hạn 10 giây của mọi khoá
    await incr('moi', 10);

    expect(heroConsultationService._memoryCounterSize()).toBe(1);
  });

  it('dưới ngưỡng thì KHÔNG quét (không tốn công cho người dùng bình thường)', async () => {
    for (let i = 0; i < 50; i += 1) await incr(i, 10);
    now = T0 + 20_000;
    await incr('moi', 10);

    expect(heroConsultationService._memoryCounterSize()).toBe(51);
  });

  it('khoá CÒN HẠN không bị xoá khi quét — bộ đếm vẫn đúng (visitor 5 lượt không về 0 giữa chừng)', async () => {
    for (let i = 0; i < MEMORY_COUNTERS_SWEEP_THRESHOLD; i += 1) await incr(i, 1000);
    expect(await incr(0, 1000)).toBe(2); // khoá 0 vẫn đếm tiếp, không bị reset

    now = T0 + 30_000;
    await incr('moi', 1000); // kích hoạt quét: không khoá nào hết hạn

    expect(heroConsultationService._memoryCounterSize()).toBe(MEMORY_COUNTERS_SWEEP_THRESHOLD + 1);
    expect(await incr(0, 1000)).toBe(3);
  });

  it('quét tối đa mỗi phút một lần: map toàn khoá còn sống bị dội không bị quét O(n) trên MỖI lượt', async () => {
    for (let i = 0; i < MEMORY_COUNTERS_SWEEP_THRESHOLD; i += 1) await incr(i, 10);
    now = T0 + 20_000;
    await incr('a', 10); // quét lần 1 → còn 1 (khoá 'a', hạn tới T0+30s)
    expect(heroConsultationService._memoryCounterSize()).toBe(1);

    for (let i = 0; i < MEMORY_COUNTERS_SWEEP_THRESHOLD; i += 1) await incr(`b${i}`, 10); // hạn tới T0+30s
    expect(heroConsultationService._memoryCounterSize()).toBe(MEMORY_COUNTERS_SWEEP_THRESHOLD + 1);

    now = T0 + 40_000; // mọi khoá đã hết hạn, nhưng mới 20 giây từ lần quét trước (< 1 phút)
    await incr('c', 10);
    expect(heroConsultationService._memoryCounterSize()).toBe(MEMORY_COUNTERS_SWEEP_THRESHOLD + 2);

    now = T0 + 90_000; // đã qua 1 phút
    await incr('d', 10);
    expect(heroConsultationService._memoryCounterSize()).toBe(1);
  });
});

describe('heroConsultation — không log mỗi request, câu lỗi có dấu (D-26d, D-26e)', () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  const originalPublicKey = process.env.GEMINI_API_KEY_PUBLIC;
  let log;
  let warn;
  let error;
  let n = 0;
  const chat = (extra = {}) => heroConsultationService.processChat({
    visitorId: `v_cleanup_${(n += 1)}`, message: 'Chào', ip: `10.3.0.${n}`, ...extra,
  });

  beforeEach(() => {
    heroConsultationService._resetForTests();
    process.env.GEMINI_API_KEY = 'AIza-test';
    delete process.env.GEMINI_API_KEY_PUBLIC;
    resolveAllowedModel.mockReset();
    resolveAllowedModel.mockResolvedValue('gemini-3.5-flash');
    record.mockReset();
    record.mockResolvedValue(undefined);
    global.fetch = jest.fn();
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    error = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    log.mockRestore();
    warn.mockRestore();
    error.mockRestore();
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    if (originalPublicKey === undefined) delete process.env.GEMINI_API_KEY_PUBLIC;
    else process.env.GEMINI_API_KEY_PUBLIC = originalPublicKey;
  });

  it('một lượt tư vấn thành công KHÔNG in dòng log nào (trước: "[HeroConsultation] Plans text: …" mỗi request)', async () => {
    global.fetch.mockResolvedValueOnce(duocThat('Xin chào!'));

    const res = await chat();

    expect(res.success).toBe(true);
    expect(log).not.toHaveBeenCalled();
  });

  it('QUOTA_EXCEEDED (hết lượt của khách) — câu có dấu', async () => {
    global.fetch.mockImplementation(async () => duocThat('ok'));
    const visitorId = 'v_het_luot';
    let res;
    for (let i = 0; i < 6; i += 1) {
      res = await heroConsultationService.processChat({ visitorId, message: 'Chào', ip: `10.4.0.${i}` });
    }

    expect(res.code).toBe('QUOTA_EXCEEDED');
    expect(res.message).toBe('Bạn đã hết lượt chat miễn phí.');
    expect(res.message).toMatch(CO_DAU);
  });

  it('QUOTA_EXCEEDED (hết lượt theo IP trong ngày) — câu có dấu', async () => {
    global.fetch.mockImplementation(async () => duocThat('ok'));
    const ip = '10.5.0.1';
    let res;
    for (let i = 0; i <= heroConsultationService.heroIpDailyCap; i += 1) {
      res = await heroConsultationService.processChat({ visitorId: `v_ip_${i}`, message: 'Chào', ip });
    }

    expect(res.code).toBe('QUOTA_EXCEEDED');
    expect(res.message).toBe('Bạn đã hết lượt chat miễn phí trong ngày.');
  });

  it('SERVICE_UNAVAILABLE (chưa cấu hình khoá) — câu có dấu', async () => {
    delete process.env.GEMINI_API_KEY;

    const res = await chat();

    expect(res.code).toBe('SERVICE_UNAVAILABLE');
    expect(res.message).toMatch(CO_DAU);
    expect(res.message).not.toMatch(/Dich vu|tam thoi|khong kha dung/);
  });

  it('AI_ERROR (Google lỗi) — câu có dấu', async () => {
    global.fetch.mockImplementation(async () => phanHoiThat(400, {
      error: { code: 400, message: 'Invalid argument', status: 'INVALID_ARGUMENT' },
    }));

    const res = await chat();

    expect(res.code).toBe('AI_ERROR');
    expect(res.message).toBe('Xin lỗi, đã xảy ra lỗi. Vui lòng thử lại.');
  });

  it('INVALID_INPUT — câu có dấu, không còn tiếng Anh "visitorId and message are required"', async () => {
    const res = await heroConsultationService.processChat({ visitorId: '', message: 'Chào' });

    expect(res.code).toBe('INVALID_INPUT');
    expect(res.message).toMatch(CO_DAU);
    expect(res.message).not.toMatch(/required/i);
  });
});
