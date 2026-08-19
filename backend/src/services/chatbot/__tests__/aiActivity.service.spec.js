import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockZaloPersonalRepository = {
  getAiActivityReport: jest.fn(),
  getMessagesForSummary: jest.fn(),
  bulkResumeAiPaused: jest.fn(),
  countStaleAiPausedConversations: jest.fn(),
};

const mockAiActivitySummaryRepository = {
  findByUserAndDay: jest.fn(),
  upsertSummary: jest.fn(),
};

const mockGenerateGeminiText = jest.fn();
const mockResolveAllowedModel = jest.fn().mockResolvedValue('gemini-2.5-flash');
const mockAiUsageMeter = {
  record: jest.fn().mockResolvedValue(undefined),
};

jest.unstable_mockModule('../../../repositories/chatbot/zaloPersonal.repository.js', () => ({
  default: mockZaloPersonalRepository,
}));

jest.unstable_mockModule('../../../repositories/chatbot/aiActivitySummary.repository.js', () => ({
  default: mockAiActivitySummaryRepository,
}));

jest.unstable_mockModule('../../../utils/geminiClient.util.js', () => ({
  generateGeminiText: mockGenerateGeminiText,
}));

jest.unstable_mockModule('../../ai/aiModelPolicy.service.js', () => ({
  resolveAllowedModel: mockResolveAllowedModel,
}));

jest.unstable_mockModule('../../ai/aiUsageMeter.service.js', () => ({
  default: mockAiUsageMeter,
}));

const { default: aiActivityService } = await import('../aiActivity.service.js');

describe('aiActivity.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getActivityReport', () => {
    it('tính toán đúng số liệu thống kê và ghép summary cache', async () => {
      mockZaloPersonalRepository.getAiActivityReport.mockResolvedValue([
        {
          id: 1,
          visitor_name: 'Nguyễn Văn A',
          external_id: 'user_1',
          id_zalo_setting: 10,
          khach_nhan: '5',
          ai_tra_loi: '4',
          nguoi_tra_loi: '1',
          chua_doc: '1',
          tin_dau: '2026-08-19T08:00:00.000Z',
          tin_cuoi: '2026-08-19T09:30:00.000Z',
          ai_paused: false,
          ai_paused_at: null,
        },
        {
          id: 2,
          visitor_name: 'Trần Thị B',
          external_id: 'user_2',
          id_zalo_setting: 10,
          khach_nhan: '2',
          ai_tra_loi: '0',
          nguoi_tra_loi: '2',
          chua_doc: '0',
          tin_dau: '2026-08-19T07:00:00.000Z',
          tin_cuoi: '2026-08-19T07:15:00.000Z',
          ai_paused: true,
          ai_paused_at: '2026-08-19T07:15:00.000Z',
        },
      ]);

      mockAiActivitySummaryRepository.findByUserAndDay.mockResolvedValue({
        payload: [
          {
            conversationId: 1,
            y_chinh: 'Khách hỏi giá khoá học',
            khach_muon_gi: 'Báo giá chi tiết',
            can_nguoi_that_khong: false,
          },
        ],
        updated_at: '2026-08-19T10:00:00.000Z',
      });

      mockZaloPersonalRepository.countStaleAiPausedConversations.mockResolvedValue(1);

      const res = await aiActivityService.getActivityReport({
        userId: 100,
        date: '2026-08-19',
      });

      expect(res.date).toBe('2026-08-19');
      expect(res.dayKey).toBe('20260819');
      expect(res.conversations).toHaveLength(2);
      expect(res.stats.totalConversations).toBe(2);
      expect(res.stats.totalKhachNhan).toBe(7);
      expect(res.stats.totalAiTraLoi).toBe(4);
      expect(res.stats.totalNguoiTraLoi).toBe(3);
      expect(res.stats.totalChuaDoc).toBe(1);
      expect(res.stats.totalAiPaused).toBe(1);
      expect(res.stats.stalePausedCount).toBe(1);

      expect(res.conversations[0].summary).toEqual({
        conversationId: 1,
        y_chinh: 'Khách hỏi giá khoá học',
        khach_muon_gi: 'Báo giá chi tiết',
        can_nguoi_that_khong: false,
      });
      expect(res.conversations[1].summary).toBeNull();
    });
  });

  describe('resumeAllAi', () => {
    it('gọi bulkResumeAiPaused và trả về số lượng bật lại', async () => {
      mockZaloPersonalRepository.bulkResumeAiPaused.mockResolvedValue(3);
      const res = await aiActivityService.resumeAllAi({ userId: 100 });
      expect(res.resumedCount).toBe(3);
      expect(mockZaloPersonalRepository.bulkResumeAiPaused).toHaveBeenCalledWith(100);
    });
  });

  describe('summarizeDailyActivity', () => {
    it('trả cache nếu mốc tin mới nhất không đổi', async () => {
      mockZaloPersonalRepository.getAiActivityReport.mockResolvedValue([
        {
          id: 1,
          tin_cuoi: '2026-08-19T09:00:00.000Z',
        },
      ]);

      const cachedSummary = [
        {
          conversationId: 1,
          y_chinh: 'Đã tư vấn xong',
          khach_muon_gi: 'Mua gói tháng',
          can_nguoi_that_khong: false,
        },
      ];

      mockAiActivitySummaryRepository.findByUserAndDay.mockResolvedValue({
        last_message_at: '2026-08-19T09:00:00.000Z',
        payload: cachedSummary,
        updated_at: '2026-08-19T09:05:00.000Z',
      });

      const res = await aiActivityService.summarizeDailyActivity({
        userId: 100,
        date: '2026-08-19',
      });

      expect(res.cached).toBe(true);
      expect(res.summaries).toEqual(cachedSummary);
      expect(mockGenerateGeminiText).not.toHaveBeenCalled();
    });

    it('gọi Gemini và lưu cache mới khi có tin nhắn mới', async () => {
      mockZaloPersonalRepository.getAiActivityReport.mockResolvedValue([
        {
          id: 1,
          visitor_name: 'Nguyễn Văn A',
          tin_cuoi: '2026-08-19T10:00:00.000Z',
        },
      ]);

      // Cache cũ lúc 09:00, tin mới lúc 10:00
      mockAiActivitySummaryRepository.findByUserAndDay.mockResolvedValue({
        last_message_at: '2026-08-19T09:00:00.000Z',
        payload: [],
      });

      mockZaloPersonalRepository.getMessagesForSummary.mockResolvedValue([
        {
          id_conversation: 1,
          role: 'visitor',
          content: 'Em muốn gọi tư vấn trực tiếp',
          source: null,
          created_at: '2026-08-19T09:55:00.000Z',
        },
        {
          id_conversation: 1,
          role: 'agent',
          content: 'Dạ anh đợi chút bên em liên hệ nhé',
          source: 'ai_auto_reply',
          created_at: '2026-08-19T09:56:00.000Z',
        },
      ]);

      const geminiOutput = [
        {
          conversationId: 1,
          y_chinh: 'Khách muốn gặp nhân viên gọi điện tư vấn trực tiếp',
          khach_muon_gi: 'Tư vấn qua điện thoại',
          can_nguoi_that_khong: true,
          ly_do_can_nguoi: 'Khách yêu cầu gọi điện',
        },
      ];

      mockGenerateGeminiText.mockResolvedValue({
        text: JSON.stringify(geminiOutput),
        usage: { promptTokens: 100, completionTokens: 50 },
      });

      mockAiActivitySummaryRepository.upsertSummary.mockResolvedValue({ id: 1 });

      const res = await aiActivityService.summarizeDailyActivity({
        userId: 100,
        date: '2026-08-19',
      });

      expect(res.cached).toBe(false);
      expect(res.summaries).toHaveLength(1);
      expect(res.summaries[0].can_nguoi_that_khong).toBe(true);
      expect(mockGenerateGeminiText).toHaveBeenCalledTimes(1);
      expect(mockAiUsageMeter.record).toHaveBeenCalledTimes(1);
      expect(mockAiActivitySummaryRepository.upsertSummary).toHaveBeenCalledWith(
        100,
        '20260819',
        '2026-08-19T10:00:00.000Z',
        geminiOutput
      );
    });

    it('ném lỗi 502 khi Gemini trả JSON hỏng', async () => {
      mockZaloPersonalRepository.getAiActivityReport.mockResolvedValue([
        {
          id: 1,
          visitor_name: 'Nguyễn Văn A',
          tin_cuoi: '2026-08-19T10:00:00.000Z',
        },
      ]);

      mockAiActivitySummaryRepository.findByUserAndDay.mockResolvedValue(null);

      mockZaloPersonalRepository.getMessagesForSummary.mockResolvedValue([
        {
          id_conversation: 1,
          role: 'visitor',
          content: 'Xin chào',
          source: null,
          created_at: '2026-08-19T09:55:00.000Z',
        },
      ]);

      mockGenerateGeminiText.mockResolvedValue({
        text: 'This is not json',
        usage: { promptTokens: 100, completionTokens: 50 },
      });

      await expect(
        aiActivityService.summarizeDailyActivity({
          userId: 100,
          date: '2026-08-19',
        })
      ).rejects.toMatchObject({
        status: 502,
        message: expect.stringContaining('không hợp lệ'),
      });
    });

    it('ném lỗi 502 khi Gemini trả mảng rỗng', async () => {
      mockZaloPersonalRepository.getAiActivityReport.mockResolvedValue([
        {
          id: 1,
          visitor_name: 'Nguyễn Văn A',
          tin_cuoi: '2026-08-19T10:00:00.000Z',
        },
      ]);

      mockAiActivitySummaryRepository.findByUserAndDay.mockResolvedValue(null);

      mockZaloPersonalRepository.getMessagesForSummary.mockResolvedValue([
        {
          id_conversation: 1,
          role: 'visitor',
          content: 'Xin chào',
          source: null,
          created_at: '2026-08-19T09:55:00.000Z',
        },
      ]);

      mockGenerateGeminiText.mockResolvedValue({
        text: '[]',
        usage: { promptTokens: 100, completionTokens: 50 },
      });

      await expect(
        aiActivityService.summarizeDailyActivity({
          userId: 100,
          date: '2026-08-19',
        })
      ).rejects.toMatchObject({
        status: 502,
        message: expect.stringContaining('không thể trích xuất tóm tắt'),
      });
    });
  });
});
