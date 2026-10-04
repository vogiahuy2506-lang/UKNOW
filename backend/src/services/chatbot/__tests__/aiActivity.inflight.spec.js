import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * D-21 (PLAN_SUA_AI_DOT4 PR-3) — Tóm tắt Hộp thư:
 *  - khoá "đang chạy" theo `userId:dayKey`: bấm đôi = 1 lượt Gemini, 1 credit;
 *  - `findFreshCachedSummary` chỉ ĐỌC cache (route gọi trước cổng credit);
 *  - cắt mỗi tin ≤ 1.000 ký tự + giới hạn 15 tin/hội thoại đẩy xuống SQL;
 *  - parse hỏng KHÔNG log toàn văn hội thoại khách.
 *
 * Giả ranh giới: repository (đúng hình dạng hàng SQL: `khach_nhan`… là chuỗi số, `tin_cuoi` là ISO), lõi Gemini
 * (`generateGeminiText` trả `{ text, usage }`), chính sách model, bộ ghi token.
 */
const mockZaloPersonalRepository = {
  getAiActivityReport: jest.fn(),
  getMessagesForSummary: jest.fn(),
  bulkResumeAiPaused: jest.fn(),
  countStaleAiPausedConversations: jest.fn(),
};
const mockAiActivitySummaryRepository = { findByUserAndDay: jest.fn(), upsertSummary: jest.fn() };
const mockGenerateGeminiText = jest.fn();
const mockRecord = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule('../../../repositories/chatbot/zaloPersonal.repository.js', () => ({ default: mockZaloPersonalRepository }));
jest.unstable_mockModule('../../../repositories/chatbot/aiActivitySummary.repository.js', () => ({ default: mockAiActivitySummaryRepository }));
jest.unstable_mockModule('../../../utils/geminiClient.util.js', () => ({ generateGeminiText: mockGenerateGeminiText }));
jest.unstable_mockModule('../../ai/aiModelPolicy.service.js', () => ({ resolveAllowedModel: jest.fn().mockResolvedValue('gemini-2.5-flash') }));
jest.unstable_mockModule('../../ai/aiUsageMeter.service.js', () => ({ default: { record: mockRecord } }));

const { default: service } = await import('../aiActivity.service.js');

const DATE = '2026-10-03';
const ROW = { id: 1, visitor_name: 'Khách A', tin_cuoi: '2026-10-03T03:00:00.000Z' };
const SUMMARY = [{ conversationId: 1, y_chinh: 'Khách hỏi giá', khach_muon_gi: 'Giá', can_nguoi_that_khong: false }];
const geminiReply = () => ({ text: JSON.stringify(SUMMARY), usage: { totalTokens: 10 } });

/** Một lời hứa mở khoá bằng tay — để giữ lượt Gemini "đang chạy" trong khi lượt thứ hai tới. */
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe('aiActivity.service — khoá "đang chạy" (D-21)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockZaloPersonalRepository.getAiActivityReport.mockResolvedValue([ROW]);
    mockAiActivitySummaryRepository.findByUserAndDay.mockResolvedValue(null);
    mockZaloPersonalRepository.getMessagesForSummary.mockResolvedValue([
      { id_conversation: 1, role: 'visitor', content: 'Cho em hỏi giá', source: null, created_at: '2026-10-03T02:50:00.000Z' },
    ]);
    mockAiActivitySummaryRepository.upsertSummary.mockResolvedValue({ id: 1 });
  });

  it('bấm đôi cùng lúc → CHỈ 1 lượt Gemini; lượt đầu cached=false (trừ credit), lượt chờ cached=true (KHÔNG trừ)', async () => {
    const gate = deferred();
    mockGenerateGeminiText.mockReturnValueOnce(gate.promise);

    const first = service.summarizeDailyActivity({ userId: 7, date: DATE });
    // Để lượt đầu chạy tới chỗ gọi Gemini rồi mới bấm lần hai.
    await new Promise((r) => { setImmediate(r); });
    const second = service.summarizeDailyActivity({ userId: 7, date: DATE });
    gate.resolve(geminiReply());

    const [a, b] = await Promise.all([first, second]);

    expect(mockGenerateGeminiText).toHaveBeenCalledTimes(1);
    expect(mockRecord).toHaveBeenCalledTimes(1);
    expect(a.cached).toBe(false);
    expect(b.cached).toBe(true);
    expect(b.deduped).toBe(true);
    expect(b.summaries).toEqual(a.summaries);
  });

  it('ba cú bấm liền → vẫn 1 lượt Gemini; chỉ đúng 1 kết quả cached=false', async () => {
    const gate = deferred();
    mockGenerateGeminiText.mockReturnValueOnce(gate.promise);

    const calls = [
      service.summarizeDailyActivity({ userId: 7, date: DATE }),
      service.summarizeDailyActivity({ userId: 7, date: DATE }),
      service.summarizeDailyActivity({ userId: 7, date: DATE }),
    ];
    await new Promise((r) => { setImmediate(r); });
    gate.resolve(geminiReply());
    const results = await Promise.all(calls);

    expect(mockGenerateGeminiText).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r.cached === false)).toHaveLength(1);
  });

  it('khác người dùng HOẶC khác ngày → khoá khác nhau, mỗi bên một lượt Gemini', async () => {
    const g1 = deferred();
    const g2 = deferred();
    const g3 = deferred();
    mockGenerateGeminiText.mockReturnValueOnce(g1.promise).mockReturnValueOnce(g2.promise).mockReturnValueOnce(g3.promise);

    const p1 = service.summarizeDailyActivity({ userId: 7, date: DATE });
    const p2 = service.summarizeDailyActivity({ userId: 8, date: DATE });
    const p3 = service.summarizeDailyActivity({ userId: 7, date: '2026-10-02' });
    await new Promise((r) => { setImmediate(r); });
    g1.resolve(geminiReply());
    g2.resolve(geminiReply());
    g3.resolve(geminiReply());
    const results = await Promise.all([p1, p2, p3]);

    expect(mockGenerateGeminiText).toHaveBeenCalledTimes(3);
    expect(results.every((r) => r.cached === false)).toBe(true);
  });

  it('lượt đầu xong rồi, cache cũ (có tin mới) → bấm tiếp chạy LẠI bình thường (khoá đã dọn)', async () => {
    mockGenerateGeminiText.mockResolvedValue(geminiReply());

    const a = await service.summarizeDailyActivity({ userId: 7, date: DATE });
    const b = await service.summarizeDailyActivity({ userId: 7, date: DATE });

    expect(a.cached).toBe(false);
    expect(b.cached).toBe(false);
    expect(mockGenerateGeminiText).toHaveBeenCalledTimes(2);
  });

  it('lượt đầu LỖI → lượt chờ nhận cùng lỗi (không gọi Gemini thêm), rồi khoá được dọn để bấm lại chạy được', async () => {
    const gate = deferred();
    mockGenerateGeminiText.mockReturnValueOnce(gate.promise);

    const first = service.summarizeDailyActivity({ userId: 7, date: DATE });
    await new Promise((r) => { setImmediate(r); });
    const second = service.summarizeDailyActivity({ userId: 7, date: DATE });
    const boom = Object.assign(new Error('AI phản hồi quá lâu.'), { code: 'AI_TIMEOUT', status: 503 });
    gate.reject(boom);

    await expect(first).rejects.toBe(boom);
    await expect(second).rejects.toBe(boom);
    expect(mockGenerateGeminiText).toHaveBeenCalledTimes(1);

    mockGenerateGeminiText.mockResolvedValueOnce(geminiReply());
    const retry = await service.summarizeDailyActivity({ userId: 7, date: DATE });
    expect(retry.cached).toBe(false);
    expect(mockGenerateGeminiText).toHaveBeenCalledTimes(2);
  });
});

describe('aiActivity.service.findFreshCachedSummary — chỉ đọc cache (D-21)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockZaloPersonalRepository.getAiActivityReport.mockResolvedValue([ROW]);
  });

  it('cache còn tươi → trả cached:true, KHÔNG đọc tin nhắn, KHÔNG gọi Gemini', async () => {
    mockAiActivitySummaryRepository.findByUserAndDay.mockResolvedValue({
      last_message_at: '2026-10-03T03:00:00.000Z',
      payload: SUMMARY,
      updated_at: '2026-10-03T03:05:00.000Z',
    });

    const out = await service.findFreshCachedSummary({ userId: 7, date: DATE });

    expect(out).toEqual({ date: DATE, dayKey: '20261003', summaries: SUMMARY, cached: true, updatedAt: '2026-10-03T03:05:00.000Z' });
    expect(mockZaloPersonalRepository.getMessagesForSummary).not.toHaveBeenCalled();
    expect(mockGenerateGeminiText).not.toHaveBeenCalled();
  });

  it('có tin MỚI hơn mốc lưu → null (phải sinh lại, qua cổng credit)', async () => {
    mockAiActivitySummaryRepository.findByUserAndDay.mockResolvedValue({
      last_message_at: '2026-10-03T02:59:59.000Z',
      payload: SUMMARY,
    });
    expect(await service.findFreshCachedSummary({ userId: 7, date: DATE })).toBeNull();
  });

  it('chưa có cache / cache rỗng / ngày không có hội thoại → null', async () => {
    mockAiActivitySummaryRepository.findByUserAndDay.mockResolvedValue(null);
    expect(await service.findFreshCachedSummary({ userId: 7, date: DATE })).toBeNull();

    mockAiActivitySummaryRepository.findByUserAndDay.mockResolvedValue({ last_message_at: '2026-10-03T03:00:00.000Z', payload: [] });
    expect(await service.findFreshCachedSummary({ userId: 7, date: DATE })).toBeNull();

    mockZaloPersonalRepository.getAiActivityReport.mockResolvedValue([]);
    expect(await service.findFreshCachedSummary({ userId: 7, date: DATE })).toBeNull();
  });
});

describe('aiActivity.service — cắt tin trong SQL + prompt (D-21)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockZaloPersonalRepository.getAiActivityReport.mockResolvedValue([ROW]);
    mockAiActivitySummaryRepository.findByUserAndDay.mockResolvedValue(null);
    mockAiActivitySummaryRepository.upsertSummary.mockResolvedValue({ id: 1 });
  });

  it('truyền trần 15 tin/hội thoại và 1.000 ký tự/tin xuống repository (SQL cắt, không kéo cả ngày về)', async () => {
    mockZaloPersonalRepository.getMessagesForSummary.mockResolvedValue([
      { id_conversation: 1, role: 'visitor', content: 'xin chào', source: null, created_at: '2026-10-03T02:50:00.000Z' },
    ]);
    mockGenerateGeminiText.mockResolvedValue(geminiReply());

    await service.summarizeDailyActivity({ userId: 7, date: DATE });

    expect(mockZaloPersonalRepository.getMessagesForSummary).toHaveBeenCalledWith(expect.objectContaining({
      conversationIds: [1],
      userId: 7,
      limitPerConversation: 15,
      maxContentChars: 1000,
    }));
  });

  it('tin dài 5.000 ký tự lọt từ repository (mock/đường khác) vẫn bị cắt còn 1.000 khi đưa vào prompt', async () => {
    mockZaloPersonalRepository.getMessagesForSummary.mockResolvedValue([
      { id_conversation: 1, role: 'visitor', content: `ĐẦU${'a'.repeat(5000)}CUỐI`, source: null, created_at: '2026-10-03T02:50:00.000Z' },
    ]);
    mockGenerateGeminiText.mockResolvedValue(geminiReply());

    await service.summarizeDailyActivity({ userId: 7, date: DATE });

    const { prompt } = mockGenerateGeminiText.mock.calls[0][0];
    const line = prompt.split('\n').find((l) => l.startsWith('[Khách]: ĐẦU'));
    expect(line).toBeDefined();
    expect(line.length).toBe('[Khách]: '.length + 1000);
    expect(prompt).not.toContain('CUỐI');
  });
});

describe('aiActivity.service — parse hỏng không log toàn văn (D-21)', () => {
  it('log chỉ có độ dài + finishReason, KHÔNG chứa nội dung hội thoại khách', async () => {
    jest.clearAllMocks();
    mockZaloPersonalRepository.getAiActivityReport.mockResolvedValue([ROW]);
    mockAiActivitySummaryRepository.findByUserAndDay.mockResolvedValue(null);
    mockZaloPersonalRepository.getMessagesForSummary.mockResolvedValue([
      { id_conversation: 1, role: 'visitor', content: 'xin chào', source: null, created_at: '2026-10-03T02:50:00.000Z' },
    ]);
    mockGenerateGeminiText.mockResolvedValue({
      text: 'Nguyễn Văn Bí Mật SĐT 0912345678 hỏi {giá',
      finishReason: 'MAX_TOKENS',
      usage: { totalTokens: 10 },
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(service.summarizeDailyActivity({ userId: 7, date: DATE })).rejects.toMatchObject({ status: 422 });

    const logged = errorSpy.mock.calls.flat().map(String).join(' ');
    expect(logged).toContain('JSON parse failed');
    expect(logged).toContain('finishReason=MAX_TOKENS');
    expect(logged).toMatch(/độ dài \d+ ký tự/);
    // Cả `err.message` của V8 cũng không được vào log: nó chèn đoạn ĐẦU của chuỗi ("Nguyễn Văn B"...).
    expect(logged).not.toContain('Nguyễn');
    expect(logged).not.toContain('Bí Mật');
    expect(logged).not.toContain('0912345678');
    errorSpy.mockRestore();
  });
});
