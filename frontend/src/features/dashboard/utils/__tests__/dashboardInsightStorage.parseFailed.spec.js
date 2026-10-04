import { describe, expect, it } from 'vitest';
import { isInsightPayloadUsable, normalizeDashboardInsightForUi } from '../dashboardInsightStorage.util';

/**
 * D-10 (PLAN_SUA_AI_DOT4 PR-3): backend gắn `parseFailed: true` vào khung lỗi khi Gemini trả JSON không đọc được.
 * Bộ dò chuỗi cũ ("Không parse được JSON từ Gemini") chỉ biết bản tiếng Việt — khung tiếng Anh ("Failed to parse JSON…")
 * từng bị coi là bản phân tích dùng được (overview ≥ 5 ký tự).
 */
describe('isInsightPayloadUsable — khung lỗi parseFailed', () => {
  const failureFrameEn = {
    parseFailed: true,
    overview: 'Failed to parse JSON from Gemini. Raw output (may be truncated):\nxyz',
    charts: {},
    notes: ['Could not parse the complete JSON from the AI. Please run the analysis again; this attempt is not charged.'],
  };

  it('khung lỗi tiếng Anh có cờ → không dùng được', () => {
    expect(isInsightPayloadUsable(failureFrameEn)).toBe(false);
  });

  it('cờ vẫn sống sau chuẩn hoá cho UI', () => {
    const normalized = normalizeDashboardInsightForUi(failureFrameEn);
    expect(normalized.parseFailed).toBe(true);
    expect(isInsightPayloadUsable(normalized)).toBe(false);
  });

  it('khung lỗi tiếng Việt CŨ (không cờ, chỉ có chuỗi) vẫn bị loại — tương thích bản lưu cũ', () => {
    expect(isInsightPayloadUsable({
      overview: 'Không parse được JSON từ Gemini. Bản thô (có thể cắt):\n{',
      charts: {},
      notes: ['Không parse được JSON đầy đủ. Kiểm tra GEMINI_MODEL (khuyến nghị: gemini-2.5-flash) và GEMINI_API_KEY.'],
    })).toBe(false);
  });

  it('bản phân tích thật (không cờ) vẫn dùng được', () => {
    expect(isInsightPayloadUsable({
      overview: 'Chiến dịch email hiệu quả ổn định.',
      key_metrics_analysis: { open_rate: { value: '25%' } },
    })).toBe(true);
  });
});
