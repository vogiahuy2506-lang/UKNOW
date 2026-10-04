import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * D-11 — OCR nạp tài liệu (ảnh / PDF quét) bằng Gemini: đầu ra bị cắt, lỗi Gemini, tệp quá khổ.
 *
 * Mock ở ranh giới: pdf-parse, lõi Gemini, chính sách model, sổ token. `fileExtractor.util.js` chạy thật.
 * Bản cũ: không đặt maxOutputTokens, không đọc finishReason (PDF dài bị cắt im lặng mà tài liệu vẫn `ready`), và mọi lỗi
 * Gemini bị nuốt thành '' nên khách chỉ thấy câu tiếng Anh "Could not extract text from file".
 */
const mockPdfParse = jest.fn();
const mockGenerate = jest.fn();
const mockRecord = jest.fn();

jest.unstable_mockModule('pdf-parse', () => ({ default: (...args) => mockPdfParse(...args) }));
jest.unstable_mockModule('../geminiClient.util.js', () => ({ generateGeminiContent: (...args) => mockGenerate(...args) }));
jest.unstable_mockModule('../../services/ai/aiModelPolicy.service.js', () => ({
  resolveAllowedModel: jest.fn(async () => 'gemini-test'),
}));
jest.unstable_mockModule('../../services/ai/aiUsageMeter.service.js', () => ({ default: { record: (...args) => mockRecord(...args) } }));

const {
  extractTextFromBuffer,
  OcrExtractionError,
  OCR_ERROR_CODES,
  OCR_MAX_OUTPUT_TOKENS,
  OCR_TOTAL_TIMEOUT_MS,
  OCR_MAX_INPUT_BYTES,
  OCR_MAX_PDF_PAGES,
} = await import('../fileExtractor.util.js');

const geminiResult = (overrides = {}) => ({
  text: 'Nội dung đọc được từ tài liệu quét.',
  finishReason: 'STOP',
  usage: { promptTokens: 1000, outputTokens: 500, totalTokens: 1500 },
  modelUsed: 'gemini-test',
  ...overrides,
});

const scannedPdf = () => Buffer.from('%PDF-1.4 scan');
const png = () => Buffer.from('PNG-BYTES');

describe('fileExtractor OCR — đầu ra bị cắt không được lưu thành tài liệu "ready"', () => {
  beforeEach(() => {
    mockPdfParse.mockReset().mockResolvedValue({ text: '', numpages: 3 });
    mockGenerate.mockReset().mockResolvedValue(geminiResult());
    mockRecord.mockReset().mockResolvedValue(undefined);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('PDF quét: gọi Gemini với maxOutputTokens đặt TƯỜNG MINH (không rơi về mặc định của lõi)', async () => {
    const text = await extractTextFromBuffer(scannedPdf(), 'quet.pdf', { userId: 7 });

    expect(text).toBe('Nội dung đọc được từ tài liệu quét.');
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockGenerate.mock.calls[0][0].maxOutputTokens).toBe(OCR_MAX_OUTPUT_TOKENS);
    expect(Number.isInteger(OCR_MAX_OUTPUT_TOKENS)).toBe(true);
  });

  it('PDF: finishReason MAX_TOKENS → ném OCR_TOO_LONG tiếng Việt bảo tách nhỏ, không trả nội dung cụt', async () => {
    mockGenerate.mockResolvedValue(geminiResult({ text: 'Phần đầu của tài liệu rất dài…', finishReason: 'MAX_TOKENS' }));

    const error = await extractTextFromBuffer(scannedPdf(), 'dai.pdf', { userId: 7 }).catch((e) => e);

    expect(error).toBeInstanceOf(OcrExtractionError);
    expect(error.code).toBe(OCR_ERROR_CODES.TOO_LONG);
    expect(error.status).toBe(422);
    expect(error.message).toMatch(/quá dài/);
    expect(error.message).toMatch(/tách/);
    expect(error.message).not.toMatch(/Could not|MAX_TOKENS/);
  });

  it('MAX_TOKENS vẫn GHI token (Google đã tính tiền lượt này) trước khi báo lỗi', async () => {
    mockGenerate.mockResolvedValue(geminiResult({ finishReason: 'MAX_TOKENS' }));

    await extractTextFromBuffer(scannedPdf(), 'dai.pdf', { userId: 7 }).catch(() => {});

    expect(mockRecord).toHaveBeenCalledTimes(1);
    expect(mockRecord.mock.calls[0][0]).toBe(7);
    expect(mockRecord.mock.calls[0][2]).toMatchObject({ feature: 'kb_ocr' });
  });

  it('ẢNH: finishReason MAX_TOKENS cũng là lỗi', async () => {
    mockGenerate.mockResolvedValue(geminiResult({ finishReason: 'MAX_TOKENS' }));

    await expect(extractTextFromBuffer(png(), 'bang-gia.png', { userId: 7 }))
      .rejects.toMatchObject({ code: OCR_ERROR_CODES.TOO_LONG });
  });

  it('đọc xong bình thường (STOP) → trả chữ như cũ', async () => {
    mockGenerate.mockResolvedValue(geminiResult({ text: '  Bảng giá tháng 10  ', finishReason: 'STOP' }));

    await expect(extractTextFromBuffer(scannedPdf(), 'gia.pdf')).resolves.toBe('Bảng giá tháng 10');
    await expect(extractTextFromBuffer(png(), 'gia.png')).resolves.toBe('  Bảng giá tháng 10  ');
  });

  it('Gemini nói không có chữ (NO_RELEVANT_TEXT_FOUND) → chuỗi rỗng, không phải lỗi', async () => {
    mockGenerate.mockResolvedValue(geminiResult({ text: 'NO_RELEVANT_TEXT_FOUND' }));

    await expect(extractTextFromBuffer(scannedPdf(), 'trang-tri.pdf')).resolves.toBe('');
  });
});

describe('fileExtractor OCR — hạn chót tổng dưới trần 100 giây của Cloudflare (D-09)', () => {
  beforeEach(() => {
    mockPdfParse.mockReset().mockResolvedValue({ text: '', numpages: 3 });
    mockGenerate.mockReset().mockResolvedValue(geminiResult());
    mockRecord.mockReset().mockResolvedValue(undefined);
  });

  it('hằng số hạn chót < 85 giây (chừa chỗ cho chia đoạn + embed + ghi trong cùng một request upload)', () => {
    expect(OCR_TOTAL_TIMEOUT_MS).toBeGreaterThan(0);
    expect(OCR_TOTAL_TIMEOUT_MS).toBeLessThan(85000);
  });

  it.each([
    ['PDF quét', () => extractTextFromBuffer(scannedPdf(), 'quet.pdf')],
    ['ảnh', () => extractTextFromBuffer(png(), 'anh.png')],
  ])('%s: lời gọi Gemini mang ngân sách TỔNG (không rơi về 180 giây mặc định của lõi) và đồng hồ mỗi lượt không dài hơn nó', async (_name, run) => {
    await run();

    const call = mockGenerate.mock.calls[0][0];
    expect(call.totalTimeoutMs).toBe(OCR_TOTAL_TIMEOUT_MS);
    expect(call.timeoutMs).toBeLessThanOrEqual(call.totalTimeoutMs);
  });
});

describe('fileExtractor OCR — lỗi Gemini ra câu tiếng Việt, không nuốt thành chuỗi rỗng', () => {
  beforeEach(() => {
    mockPdfParse.mockReset().mockResolvedValue({ text: '', numpages: 2 });
    mockGenerate.mockReset();
    mockRecord.mockReset().mockResolvedValue(undefined);
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('Google quá tải (503) → OCR_FAILED 503, câu tiếng Việt, KHÔNG lộ câu tiếng Anh của Google', async () => {
    const upstream = Object.assign(new Error('Gemini API lỗi (503): This model is currently experiencing high demand'), { geminiStatus: 503 });
    mockGenerate.mockRejectedValue(upstream);

    const error = await extractTextFromBuffer(png(), 'a.png').catch((e) => e);

    expect(error).toBeInstanceOf(OcrExtractionError);
    expect(error.code).toBe(OCR_ERROR_CODES.FAILED);
    expect(error.status).toBe(503);
    expect(error.message).toMatch(/^AI chưa đọc được chữ/);
    expect(error.message).not.toMatch(/high demand|Gemini API/);
    // Câu gốc vẫn giữ ở cause cho log máy chủ.
    expect(error.cause).toBe(upstream);
  });

  it('PDF: lỗi 400 của Google cũng → OCR_FAILED (không thành "Could not extract text")', async () => {
    mockGenerate.mockRejectedValue(Object.assign(new Error('Gemini API lỗi (400): invalid argument'), { geminiStatus: 400 }));

    await expect(extractTextFromBuffer(scannedPdf(), 'a.pdf')).rejects.toMatchObject({ code: OCR_ERROR_CODES.FAILED });
  });

  it('hết giờ (AI_TIMEOUT) → OCR_TIMEOUT: "quá dài hoặc quá nặng", gợi ý tách tệp', async () => {
    mockGenerate.mockRejectedValue(Object.assign(new Error('AI phản hồi quá lâu.'), { name: 'AbortError', code: 'AI_TIMEOUT' }));

    const error = await extractTextFromBuffer(scannedPdf(), 'nang.pdf').catch((e) => e);

    expect(error.code).toBe(OCR_ERROR_CODES.TIMEOUT);
    expect(error.status).toBe(422);
    expect(error.message).toMatch(/quá dài hoặc quá nặng/);
    expect(error.message).toMatch(/tách/);
  });

  it('lỗi KHÔNG phải OCR (DOCX hỏng) vẫn trả chuỗi rỗng như trước — chỉ lỗi OCR mới được ném', async () => {
    await expect(extractTextFromBuffer(Buffer.from('không phải zip'), 'hong.docx')).resolves.toBe('');
  });
});

describe('fileExtractor OCR — trần tệp/trang chặn TRƯỚC khi tốn lượt Gemini', () => {
  beforeEach(() => {
    mockPdfParse.mockReset().mockResolvedValue({ text: '', numpages: 3 });
    mockGenerate.mockReset().mockResolvedValue(geminiResult());
    mockRecord.mockReset().mockResolvedValue(undefined);
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('ảnh vượt OCR_MAX_INPUT_BYTES → OCR_TOO_LARGE (413) và không gọi Gemini', async () => {
    const error = await extractTextFromBuffer(Buffer.alloc(OCR_MAX_INPUT_BYTES + 1), 'anh-lon.png').catch((e) => e);

    expect(error.code).toBe(OCR_ERROR_CODES.TOO_LARGE);
    expect(error.status).toBe(413);
    expect(error.message).toMatch(/12 MB/);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('PDF quét vượt OCR_MAX_INPUT_BYTES → OCR_TOO_LARGE, không gọi Gemini', async () => {
    await expect(extractTextFromBuffer(Buffer.alloc(OCR_MAX_INPUT_BYTES + 1), 'quet-lon.pdf'))
      .rejects.toMatchObject({ code: OCR_ERROR_CODES.TOO_LARGE });
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('PDF quét quá số trang → OCR_TOO_MANY_PAGES nêu đúng số trang, không gọi Gemini', async () => {
    mockPdfParse.mockResolvedValue({ text: '', numpages: OCR_MAX_PDF_PAGES + 1 });

    const error = await extractTextFromBuffer(scannedPdf(), 'nhieu-trang.pdf').catch((e) => e);

    expect(error.code).toBe(OCR_ERROR_CODES.TOO_MANY_PAGES);
    expect(error.message).toContain(`${OCR_MAX_PDF_PAGES + 1} trang`);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('PDF CÓ chữ (không cần OCR) dài hơn trần trang vẫn đọc bình thường — trần chỉ áp cho đường OCR', async () => {
    mockPdfParse.mockResolvedValue({ text: 'Nội dung PDF có chữ rõ ràng, dài hơn năm mươi ký tự để không rơi sang OCR.', numpages: 500 });

    await expect(extractTextFromBuffer(scannedPdf(), 'sach.pdf')).resolves.toContain('Nội dung PDF có chữ');
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('PDF đúng bằng trần trang vẫn được đọc (biên)', async () => {
    mockPdfParse.mockResolvedValue({ text: '', numpages: OCR_MAX_PDF_PAGES });

    await expect(extractTextFromBuffer(scannedPdf(), 'bien.pdf')).resolves.toBe('Nội dung đọc được từ tài liệu quét.');
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });
});
