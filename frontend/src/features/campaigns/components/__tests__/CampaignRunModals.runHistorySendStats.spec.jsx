/**
 * PLAN_THAM_CHIEU_KHOI_VA_RUN_BO_CHAM_2026-10-19, PR-2 Việc 2.2 — bảng "Lịch sử chạy" trong modal chi tiết lịch:
 * cột thành công / lỗi đọc `run.sendStats` (số gửi thật từ bảng tin) khi có, lui về bộ đếm campaign_runs khi
 * không có; lượt đang chạy mà tổng người nhận = 0 hiện "—" thay vì 0 (bộ đếm chưa kịp lưu, không phải "không có ai").
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import CampaignRunModals from '../CampaignRunModals';
import viTranslations from '../../../../i18n/vi';

const mockT = (key, params = {}) => {
  const val = key.split('.').reduce((acc, part) => acc?.[part], viTranslations);
  if (typeof val !== 'string') return key;
  return val.replace(/\{(\w+)\}/g, (_, name) => (params[name] ?? `{${name}}`));
};
vi.mock('../../../../i18n', () => ({ useI18n: () => ({ t: mockT }) }));

const schedule = {
  id: 9,
  scheduleName: 'Lịch hằng ngày',
  campaignName: 'Chiến dịch A',
  scheduleType: 'daily',
  cronExpression: '0 6 * * *',
  enabled: true,
  runCount: 3,
};

const baseRun = {
  startedAt: '2026-10-19T00:00:00.000Z',
  completedAt: null,
  errorMessage: null,
  totalRecipients: 0,
  successfulSends: 0,
  skippedSends: 0,
  failedSends: 0,
};

const renderHistory = (scheduleRuns) => render(
  <CampaignRunModals
    weeklyDayOptions={[]}
    showScheduleDetailModal
    selectedSchedule={schedule}
    closeScheduleDetailModal={vi.fn()}
    getWeeklyDayLabel={() => ''}
    getWeeklyDayFromCron={() => '1'}
    getScheduleTypeLabel={() => 'Hằng ngày'}
    getScheduleStatusClassName={() => 'badge-success'}
    getScheduleStatusLabel={() => 'Đang bật'}
    scheduleRuns={scheduleRuns}
    handleToggleSchedule={vi.fn()}
    isReadonlyOnceSchedule={() => false}
  />,
);

/** Các ô <td> của hàng dữ liệu thứ `index` trong bảng lịch sử (bỏ hàng tiêu đề). */
const rowCells = (index) => {
  const rows = screen.getAllByRole('row');
  return within(rows[index + 1]).getAllByRole('cell').map((cell) => cell.textContent.trim());
};

// Cột: 0 bắt đầu, 1 trạng thái, 2 người nhận, 3 thành công, 4 bỏ qua, 5 lỗi, 6 hoàn tất.
describe('modal chi tiết lịch — bảng lịch sử chạy đọc sendStats (PR-2 Việc 2.2)', () => {
  it('có sendStats → cột thành công/lỗi hiện số gửi thật, KHÔNG hiện bộ đếm campaign_runs đang bằng 0', () => {
    renderHistory([
      { ...baseRun, id: 476, status: 'completed', totalRecipients: 0, successfulSends: 0, failedSends: 0, sendStats: { sent: 315, failed: 4 } },
    ]);

    const cells = rowCells(0);
    expect(cells[3]).toBe('315');
    expect(cells[5]).toBe('4');
  });

  it('không có sendStats (API cũ / lỗi đọc) → lui về successfulSends / failedSends', () => {
    renderHistory([
      { ...baseRun, id: 1, status: 'completed', totalRecipients: 20, successfulSends: 18, failedSends: 2 },
    ]);

    const cells = rowCells(0);
    expect(cells[2]).toBe('20');
    expect(cells[3]).toBe('18');
    expect(cells[5]).toBe('2');
  });

  it('lượt đang chạy mà totalRecipients = 0 → hiện "—" ở cột người nhận, không hiện 0', () => {
    renderHistory([{ ...baseRun, id: 2, status: 'running', totalRecipients: 0, sendStats: { sent: 12, failed: 0 } }]);

    const cells = rowCells(0);
    expect(cells[2]).toBe('—');
    // Số thật vẫn hiện ở cột thành công.
    expect(cells[3]).toBe('12');
  });

  it('lượt đang chạy đã có totalRecipients → hiện số; lượt đã xong với total = 0 → vẫn hiện 0 (không phải "—")', () => {
    renderHistory([
      { ...baseRun, id: 3, status: 'running', totalRecipients: 40 },
      { ...baseRun, id: 4, status: 'completed', totalRecipients: 0 },
    ]);

    expect(rowCells(0)[2]).toBe('40');
    expect(rowCells(1)[2]).toBe('0');
  });
});
