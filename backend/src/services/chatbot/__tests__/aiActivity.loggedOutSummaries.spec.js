import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PLAN_DANG_XUAT_ZALO_AN_HOI_THOAI 11/10/2026 — bản tóm tắt AI đã lưu cache trong ngày có thể chứa hội thoại của tài khoản Zalo
 * mà sau đó người dùng "Đăng xuất" (báo cáo hôm nay không còn hiện hội thoại đó). Cache trả ra PHẢI lọc theo hội thoại còn hiện,
 * nếu không bản tóm tắt nội dung tin nhắn của tài khoản đã đăng xuất vẫn lộ qua nút "Tóm tắt".
 */
const mockZaloPersonalRepository = {
  getAiActivityReport: jest.fn(),
  getMessagesForSummary: jest.fn(),
  bulkResumeAiPaused: jest.fn(),
  countStaleAiPausedConversations: jest.fn(),
};
const mockAiActivitySummaryRepository = { findByUserAndDay: jest.fn(), upsertSummary: jest.fn() };

jest.unstable_mockModule('../../../repositories/chatbot/zaloPersonal.repository.js', () => ({ default: mockZaloPersonalRepository }));
jest.unstable_mockModule('../../../repositories/chatbot/aiActivitySummary.repository.js', () => ({ default: mockAiActivitySummaryRepository }));
jest.unstable_mockModule('../../../utils/geminiClient.util.js', () => ({ generateGeminiText: jest.fn() }));
jest.unstable_mockModule('../../ai/aiModelPolicy.service.js', () => ({ resolveAllowedModel: jest.fn().mockResolvedValue('gemini-2.5-flash') }));
jest.unstable_mockModule('../../ai/aiUsageMeter.service.js', () => ({ default: { record: jest.fn().mockResolvedValue(undefined) } }));

const { default: service } = await import('../aiActivity.service.js');

const DATE = '2026-10-03';
// Hội thoại 1 còn hiện; hội thoại 2 (đã ẩn) KHÔNG nằm trong báo cáo hôm nay nhưng vẫn nằm trong cache tóm tắt.
const VISIBLE_ROW = { id: 1, visitor_name: 'Khách A', tin_cuoi: '2026-10-03T03:00:00.000Z' };
const CACHED = [
  { conversationId: 1, y_chinh: 'Khách A hỏi giá' },
  { conversationId: 2, y_chinh: 'NỘI DUNG CỦA TÀI KHOẢN ĐÃ ĐĂNG XUẤT' },
];
const FRESH_CACHE = {
  last_message_at: '2026-10-03T03:00:00.000Z',
  payload: CACHED,
  updated_at: '2026-10-03T03:05:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockZaloPersonalRepository.getAiActivityReport.mockResolvedValue([VISIBLE_ROW]);
  mockAiActivitySummaryRepository.findByUserAndDay.mockResolvedValue(FRESH_CACHE);
});

describe('aiActivity.service — cache tóm tắt chỉ trả hội thoại còn hiện', () => {
  it('findFreshCachedSummary (đọc cache trước cổng credit)', async () => {
    const out = await service.findFreshCachedSummary({ userId: 7, date: DATE });

    expect(out.cached).toBe(true);
    expect(out.summaries).toEqual([{ conversationId: 1, y_chinh: 'Khách A hỏi giá' }]);
    expect(JSON.stringify(out)).not.toContain('ĐÃ ĐĂNG XUẤT');
  });

  it('summarizeDailyActivity gặp cache còn tươi (chốt chặn thứ hai)', async () => {
    const out = await service.summarizeDailyActivity({ userId: 7, date: DATE });

    expect(out.cached).toBe(true);
    expect(out.summaries.map((s) => s.conversationId)).toEqual([1]);
  });

  it('id lưu dạng chuỗi trong cache vẫn khớp id số của hội thoại', async () => {
    mockAiActivitySummaryRepository.findByUserAndDay.mockResolvedValue({
      ...FRESH_CACHE,
      payload: [{ conversationId: '1', y_chinh: 'a' }, { conversationId: '2', y_chinh: 'b' }],
    });

    const out = await service.findFreshCachedSummary({ userId: 7, date: DATE });

    expect(out.summaries).toEqual([{ conversationId: '1', y_chinh: 'a' }]);
  });
});
