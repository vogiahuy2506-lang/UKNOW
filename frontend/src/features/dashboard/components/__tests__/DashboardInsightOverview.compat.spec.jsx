import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DashboardInsightOverview from '../DashboardInsightOverview';

// D-20 (PLAN_SUA_AI_DOT4 PR-3): backend đổi khung JSON nhận xét Dashboard — `conversion_rate.value` do SERVER điền (chuỗi có mẫu số),
// bỏ `benchmark`/`assessment` cho thẻ này, `expected_result` thành tín hiệu định tính. Giao diện phải render CẢ bản mới LẪN bản
// insight đã lưu trước đây trong DB (mọi trường đều chỉ hiện khi có, không trường nào bắt buộc).

vi.mock('../../../../i18n', async () => (await import('../../../../test/realI18n.js')).realI18nModule());

describe('DashboardInsightOverview — tương thích khung JSON cũ và mới', () => {
  it('bản MỚI: conversion_rate chỉ có value + comment, expected_result định tính → render đủ, không lỗi', () => {
    render(
      <DashboardInsightOverview
        insights={{
          overview: 'Chiến dịch email ổn định.',
          key_metrics_analysis: {
            open_rate: { value: '25%', benchmark: 'Mức tham khảo chung ~20%', assessment: 'tốt', comment: 'Khá' },
            conversion_rate: { value: '4 đơn đã mua / 12 tin có người bấm = 33.3%; 4 đơn đã mua / 200 tin đã gửi = 2%', comment: 'Phễu cuối còn yếu.' },
          },
          action_plan: [{ priority: 1, action: 'Thử tiêu đề mới', expected_result: 'Tỉ lệ mở nhích lên rõ rệt ở lần gửi kế', timeline: '7 ngày' }],
          charts: {},
          notes: [],
        }}
      />
    );

    expect(screen.getByText(/4 đơn đã mua \/ 12 tin có người bấm = 33\.3%; 4 đơn đã mua \/ 200 tin đã gửi = 2%/)).toBeTruthy();
    expect(screen.getByText('Phễu cuối còn yếu.')).toBeTruthy();
    expect(screen.getByText('Tỉ lệ mở nhích lên rõ rệt ở lần gửi kế')).toBeTruthy();
    // Chỉ thẻ Mở / Gửi có "Tham chiếu" — thẻ chuyển đổi không còn benchmark.
    expect(screen.getAllByText(/Tham chiếu/)).toHaveLength(1);
  });

  it('bản CŨ đã lưu: conversion_rate đủ 4 trường do model tự điền + expected_result dạng số → vẫn hiện nguyên', () => {
    render(
      <DashboardInsightOverview
        insights={{
          overview: 'Bản lưu cũ.',
          key_metrics_analysis: {
            conversion_rate: { value: '3.2%', benchmark: 'Chuẩn ngành ~2%', assessment: 'trung bình', comment: 'Cần cải thiện' },
          },
          action_plan: [{ priority: 1, action: 'Tăng tần suất', expected_result: 'Tăng 20% doanh thu', timeline: '30 ngày' }],
          charts: {},
          notes: [],
        }}
      />
    );

    expect(screen.getByText('3.2%')).toBeTruthy();
    expect(screen.getByText('Chuẩn ngành ~2%')).toBeTruthy();
    expect(screen.getByText('trung bình')).toBeTruthy();
    expect(screen.getByText('Tăng 20% doanh thu')).toBeTruthy();
  });

  it('khung lỗi parseFailed (không key_metrics_analysis) → nhánh "Tóm tắt", không ném lỗi', () => {
    render(
      <DashboardInsightOverview
        insights={{
          parseFailed: true,
          overview: 'Không nhận được nội dung từ Gemini.',
          charts: {},
          notes: ['Không parse được JSON đầy đủ từ AI. Bạn vui lòng bấm phân tích lại; lượt này không bị tính credit.'],
        }}
      />
    );

    expect(screen.getByText('Không nhận được nội dung từ Gemini.')).toBeTruthy();
  });
});
