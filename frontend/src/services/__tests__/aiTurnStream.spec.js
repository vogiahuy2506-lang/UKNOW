import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * PR-9 (B-4) — helper đọc phản hồi LUỒNG NDJSON của lượt sinh / sửa landing.
 * Chạy trên `api` THẬT (interceptor Bearer, làm mới token khi 401, toast hết hạn mức) với adapter giả: adapter tự gọi
 * `config.onDownloadProgress` như XHR thật khi byte tới. axios.post (refreshAccessToken dùng axios thô) được mock như
 * api.retry401Dedupe.spec.js.
 */
const mockAxiosPost = vi.fn();
vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: { ...actual.default, post: (...args) => mockAxiosPost(...args) },
  };
});

const mockToastCustom = vi.fn();
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { custom: (...args) => mockToastCustom(...args), error: vi.fn(), success: vi.fn(), dismiss: vi.fn() }),
}));

let postAiTurn;
let readCompleteLines;
let newAiRequestId;
let AI_STREAM_INTERRUPTED_CODE;

const NDJSON = 'application/x-ndjson; charset=utf-8';
const line = (obj) => `${JSON.stringify(obj)}\n`;

/** Adapter giả cho một phản hồi 200: phát `chunks` qua onDownloadProgress (tích luỹ như responseText), rồi trả nguyên thân. */
function streamingAdapter({ chunks = [], body, contentType = NDJSON, calls = [] }) {
  return async (config) => {
    calls.push({
      authorization: config.headers?.Authorization,
      accept: config.headers?.Accept ?? config.headers?.get?.('Accept'),
      data: config.data,
      timeout: config.timeout,
      responseType: config.responseType,
    });
    let acc = '';
    for (const chunk of chunks) {
      acc += chunk;
      config.onDownloadProgress?.({ event: { target: { responseText: acc } } });
    }
    return { data: body ?? acc, status: 200, statusText: 'OK', headers: { 'content-type': contentType }, config };
  };
}

beforeEach(async () => {
  vi.resetModules();
  mockAxiosPost.mockReset();
  mockAxiosPost.mockResolvedValue({ data: { data: { accessToken: 'new-token' } } });
  mockToastCustom.mockReset();
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('accessToken', 'old-token');
  ({ postAiTurn, readCompleteLines, newAiRequestId, AI_STREAM_INTERRUPTED_CODE } = await import('../aiTurnStream.js'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('readCompleteLines — chỉ đọc dòng ĐÃ ĐỦ', () => {
  it('dòng đứt giữa hai mảnh không bị đọc dở; đủ ở lần sau', () => {
    const full = `${line({ type: 'stage', stage: 'generating' })}${line({ type: 'ping' })}`;
    const cut = full.slice(0, full.length - 8); // đứt trong dòng ping
    const first = readCompleteLines(cut, 0);
    expect(first.lines).toEqual([{ type: 'stage', stage: 'generating' }]);

    const second = readCompleteLines(full, first.next);
    expect(second.lines).toEqual([{ type: 'ping' }]);
    expect(readCompleteLines(full, second.next).lines).toEqual([]);
  });

  it('văn bản ngắn lại (request thử lại từ đầu sau 401) → đọc lại từ đầu, không kẹt ở vị trí cũ', () => {
    const text = line({ type: 'stage', stage: 'fixing' });
    expect(readCompleteLines(text, 9999).lines).toEqual([{ type: 'stage', stage: 'fixing' }]);
  });

  it('dòng hỏng bị bỏ qua, không làm sập các dòng còn lại', () => {
    const text = `${line({ type: 'ping' })}{không phải json\n${line({ type: 'stage', stage: 'fixing' })}`;
    expect(readCompleteLines(text, 0).lines).toEqual([{ type: 'ping' }, { type: 'stage', stage: 'fixing' }]);
  });
});

describe('postAiTurn — backend mới (luồng NDJSON)', () => {
  it('đọc luồng nhiều mảnh (dòng đứt giữa hai mảnh): stage báo đúng thứ tự một lần mỗi stage, bỏ ping, trả result đúng hình dạng cũ', async () => {
    const stageGen = line({ type: 'stage', stage: 'generating' });
    const ping = line({ type: 'ping' });
    const stageFix = line({ type: 'stage', stage: 'fixing' });
    const result = line({ type: 'result', success: true, data: { title: 'T', html: '<div>ok</div>', messageId: 7 } });
    const all = stageGen + ping + stageFix + result;
    // Cắt giữa dòng (không theo ranh giới dòng): 13 ký tự / mảnh.
    const chunks = all.match(/[\s\S]{1,13}/g);

    const onStage = vi.fn();
    const out = await postAiTurn('/ai/generate-landing-html', { prompt: 'p' }, {
      onStage,
      axiosConfig: { adapter: streamingAdapter({ chunks }) },
    });

    expect(onStage.mock.calls.map((c) => c[0])).toEqual(['generating', 'fixing']);
    expect(out).toEqual({ success: true, data: { title: 'T', html: '<div>ok</div>', messageId: 7 } });
    expect(out).not.toHaveProperty('type');
  });

  it('gửi: Bearer (interceptor), Accept xin NDJSON, requestId mới cho MỖI lần gọi, thân giữ nguyên, timeout dài hơn trần server', async () => {
    const calls = [];
    const adapter = streamingAdapter({ body: line({ type: 'result', success: true, data: {} }), calls });
    await postAiTurn('/ai/edit-landing-html', { instruction: 'x', currentHtml: '<p/>' }, { axiosConfig: { adapter } });
    await postAiTurn('/ai/edit-landing-html', { instruction: 'x', currentHtml: '<p/>' }, { axiosConfig: { adapter } });

    expect(calls[0].authorization).toBe('Bearer old-token');
    expect(String(calls[0].accept)).toContain('application/x-ndjson');
    expect(calls[0].timeout).toBeGreaterThanOrEqual(240000);
    expect(calls[0].responseType).toBe('text');
    const bodies = calls.map((c) => JSON.parse(c.data));
    expect(bodies[0]).toMatchObject({ instruction: 'x', currentHtml: '<p/>' });
    expect(bodies[0].requestId).toMatch(/^[A-Za-z0-9_-]{8,80}$/);
    expect(bodies[1].requestId).toMatch(/^[A-Za-z0-9_-]{8,80}$/);
    expect(bodies[0].requestId).not.toBe(bodies[1].requestId);
  });

  it('truyền requestId có sẵn → dùng đúng mã đó (bấm lại cùng một lượt)', async () => {
    const calls = [];
    await postAiTurn('/ai/generate-landing-html', { prompt: 'p' }, {
      requestId: 'req-giu-nguyen-0001',
      axiosConfig: { adapter: streamingAdapter({ body: line({ type: 'result', success: true, data: {} }), calls }) },
    });
    expect(JSON.parse(calls[0].data).requestId).toBe('req-giu-nguyen-0001');
  });

  it('401 → làm mới token → thử lại cùng requestId → vẫn nhận stage + result', async () => {
    const calls = [];
    let attempt = 0;
    const adapter = async (config) => {
      attempt += 1;
      calls.push({ authorization: config.headers?.Authorization, data: config.data });
      if (attempt === 1) {
        throw Object.assign(new Error('unauthorized'), { config, response: { status: 401, data: {}, headers: {}, config } });
      }
      const text = line({ type: 'stage', stage: 'generating' }) + line({ type: 'result', success: true, data: { html: 'sau-refresh' } });
      config.onDownloadProgress?.({ event: { target: { responseText: text.slice(0, 20) } } });
      config.onDownloadProgress?.({ event: { target: { responseText: text } } });
      return { data: text, status: 200, statusText: 'OK', headers: { 'content-type': NDJSON }, config };
    };

    const onStage = vi.fn();
    const out = await postAiTurn('/ai/generate-landing-html', { prompt: 'p' }, { onStage, axiosConfig: { adapter } });

    expect(mockAxiosPost).toHaveBeenCalledTimes(1); // đã làm mới token
    expect(attempt).toBe(2);
    expect(calls[1].authorization).toBe('Bearer new-token');
    expect(JSON.parse(calls[1].data).requestId).toBe(JSON.parse(calls[0].data).requestId); // cùng mã → server chống trừ 2 lần
    expect(onStage).toHaveBeenCalledTimes(1);
    expect(onStage).toHaveBeenCalledWith('generating');
    expect(out).toEqual({ success: true, data: { html: 'sau-refresh' } });
  });

  it('dòng error → ném lỗi hình dạng axios: response.status / response.data (message, code, …) như JSON lỗi cũ', async () => {
    const body = line({ type: 'stage', stage: 'generating' })
      + line({ type: 'error', status: 422, success: false, message: 'AI bịa URL ảnh ngoài hệ thống.', code: 'LANDING_FAKE_IMAGE_URL' });
    const err = await postAiTurn('/ai/generate-landing-html', { prompt: 'p' }, { axiosConfig: { adapter: streamingAdapter({ body }) } })
      .catch((e) => e);

    expect(err.message).toBe('AI bịa URL ảnh ngoài hệ thống.');
    expect(err.response.status).toBe(422);
    expect(err.response.data).toEqual({ success: false, message: 'AI bịa URL ảnh ngoài hệ thống.', code: 'LANDING_FAKE_IMAGE_URL' });
    expect(err.isAxiosError).toBe(true);
  });

  it('luồng đứt giữa chừng (không có result / error) → lỗi AI_STREAM_INTERRUPTED với câu tiếng người', async () => {
    const body = line({ type: 'stage', stage: 'generating' }) + line({ type: 'ping' }) + '{"type":"res';
    const err = await postAiTurn('/ai/generate-landing-html', { prompt: 'p' }, { axiosConfig: { adapter: streamingAdapter({ body }) } })
      .catch((e) => e);
    expect(err.code).toBe(AI_STREAM_INTERRUPTED_CODE);
    expect(err.message).toMatch(/Mất kết nối/);
  });

  it('dòng result nằm trước vài dòng ping thừa → vẫn lấy dòng cuối cùng thuộc loại result/error', async () => {
    const body = line({ type: 'result', success: true, data: { html: 'x' } });
    const out = await postAiTurn('/ai/generate-landing-html', { prompt: 'p' }, { axiosConfig: { adapter: streamingAdapter({ body }) } });
    expect(out.data.html).toBe('x');
  });
});

describe('postAiTurn — backend cũ (JSON một lần): giữ nhánh cũ', () => {
  it('Content-Type JSON + thân chữ → parse JSON, trả nguyên { success, data } như trước', async () => {
    const adapter = streamingAdapter({
      body: JSON.stringify({ success: true, data: { title: 'Cũ', html: '<div>json</div>' } }),
      contentType: 'application/json; charset=utf-8',
    });
    const onStage = vi.fn();
    const out = await postAiTurn('/ai/generate-landing-html', { prompt: 'p' }, { onStage, axiosConfig: { adapter } });
    expect(out).toEqual({ success: true, data: { title: 'Cũ', html: '<div>json</div>' } });
    expect(onStage).not.toHaveBeenCalled();
  });

  it('thân đã là object (mock api.post ở các spec khác) → trả nguyên', async () => {
    const adapter = async (config) => ({ data: { success: true, data: { html: 'obj' } }, status: 200, statusText: 'OK', headers: { 'content-type': 'application/json' }, config });
    const out = await postAiTurn('/ai/edit-landing-html', { instruction: 'x' }, { axiosConfig: { adapter } });
    expect(out).toEqual({ success: true, data: { html: 'obj' } });
  });

  it('lỗi HTTP trước luồng (400 JSON hết suất landing) vẫn đi qua interceptor: toast nâng gói + lỗi có response.data', async () => {
    const adapter = async (config) => {
      throw Object.assign(new Error('Request failed with status code 400'), {
        config,
        response: {
          status: 400,
          data: JSON.stringify({ success: false, message: 'Đã đạt giới hạn landing', limitReached: true, resource: 'landingPages' }),
          headers: { 'content-type': 'application/json' },
          config,
        },
      });
    };
    const err = await postAiTurn('/ai/generate-landing-html', { prompt: 'p' }, { axiosConfig: { adapter } }).catch((e) => e);
    expect(err.response.status).toBe(400);
    expect(err.response.data).toMatchObject({ limitReached: true, resource: 'landingPages' });
    expect(err.message).toBe('Đã đạt giới hạn landing');
    expect(mockToastCustom).toHaveBeenCalledTimes(1);
  });
});

describe('newAiRequestId', () => {
  it('mỗi lần một mã khác nhau, đúng dạng backend nhận (8–80 ký tự [A-Za-z0-9_-])', () => {
    const a = newAiRequestId();
    const b = newAiRequestId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{8,80}$/);
  });

  it('không có crypto.randomUUID (http / trình duyệt cũ) → dự phòng vẫn đúng dạng', () => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
    try {
      const id = newAiRequestId();
      expect(id).toMatch(/^[A-Za-z0-9_-]{8,80}$/);
      expect(newAiRequestId()).not.toBe(id);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
    }
  });
});
