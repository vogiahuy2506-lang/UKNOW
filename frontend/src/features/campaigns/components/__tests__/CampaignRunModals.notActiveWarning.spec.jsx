/**
 * Lệnh giao 21/09/2026 (lịch chạy không được chết im lặng), PR-1 Việc 1.3.
 * Popup "Lịch chạy đã thiết lập" mở từ nút "Lịch" trên dòng chiến dịch KHÔNG đọc campaignStatus nên sếp
 * thấy hai lịch xanh mướt "Đang bật" trên một chiến dịch Nháp. Và bảng lượt chạy của popup chi tiết lịch
 * chỉ có chữ "Thất bại", không nói vì sao.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CampaignRunModals from '../CampaignRunModals';
import { isReadonlyOnceSchedule } from '../../utils/campaignRunSchedule.helpers';
import viTranslations from '../../../../i18n/vi';

const mockT = (key, params = {}) => {
  const val = key.split('.').reduce((acc, part) => acc?.[part], viTranslations);
  if (typeof val !== 'string') return key;
  return val.replace(/\{(\w+)\}/g, (_, name) => (params[name] ?? `{${name}}`));
};
vi.mock('../../../../i18n', () => ({ useI18n: () => ({ t: mockT }) }));

const baseProps = {
  closeCampaignSchedulesSummaryModal: vi.fn(),
  handleToggleSchedule: vi.fn(),
  isReadonlyOnceSchedule,
  getScheduleStatusClassName: (s) => (s.enabled ? 'badge-success' : 'badge-gray'),
  getScheduleStatusLabel: (s) => (s.enabled ? 'Đang bật' : 'Đang tắt'),
  getWeeklyDayLabel: (v) => `Thứ ${v}`,
  getWeeklyDayFromCron: () => '2',
  getScheduleTypeLabel: (type) => type,
  canEditSchedules: true,
};

const schedule = (over = {}) => ({
  id: 177, campaignId: 395, scheduleName: 'Nhắc lịch', scheduleType: 'daily', cronExpression: '0 9 * * *',
  enabled: true, runCount: 0, campaignStatus: 'draft', ...over,
});

const renderSummary = (schedules) => render(
  <CampaignRunModals
    {...baseProps}
    campaignSchedulesModalCampaign={{ id: 395, campaignName: 'Nhắc lịch hội thảo 23/9' }}
    allSchedules={schedules}
  />,
);

describe('popup "Lịch chạy đã thiết lập" — cảnh báo chiến dịch chưa hoạt động', () => {
  it('chiến dịch Nháp → mỗi lịch có cảnh báo vàng nói "Nháp", không nói "tạm dừng"', () => {
    renderSummary([schedule({ id: 177 }), schedule({ id: 178 })]);
    const warnings = screen.getAllByText('Chiến dịch đang ở trạng thái Nháp — lịch này sẽ không gửi');
    expect(warnings).toHaveLength(2);
    expect(warnings[0].className).toContain('text-amber-600');
    expect(screen.queryByText(/tạm dừng/i)).not.toBeInTheDocument();
  });

  it('chiến dịch Tạm dừng → nói "Tạm dừng"', () => {
    renderSummary([schedule({ campaignStatus: 'paused' })]);
    expect(screen.getByText('Chiến dịch đang ở trạng thái Tạm dừng — lịch này sẽ không gửi')).toBeInTheDocument();
  });

  it('chiến dịch đang hoạt động, hoặc lịch chưa có campaignStatus → không cảnh báo', () => {
    renderSummary([schedule({ id: 1, campaignStatus: 'active' }), schedule({ id: 2, campaignStatus: undefined })]);
    expect(screen.queryByText(/lịch này sẽ không gửi/)).not.toBeInTheDocument();
  });
});

describe('popup chi tiết lịch — lượt chạy failed phải nói vì sao', () => {
  const renderDetail = (runs) => render(
    <CampaignRunModals
      {...baseProps}
      showScheduleDetailModal
      selectedSchedule={schedule({ campaignStatus: 'active' })}
      closeScheduleDetailModal={vi.fn()}
      scheduleRuns={runs}
    />,
  );

  it('lượt failed có error_message → hiện lý do ngay dưới badge "Thất bại"', () => {
    renderDetail([{
      id: 1, status: 'failed', startedAt: '2026-09-21T00:30:00Z', completedAt: '2026-09-21T00:30:00Z',
      totalRecipients: 0, successfulSends: 0, skippedSends: 0, failedSends: 0,
      errorMessage: 'Chỉ có thể chạy chiến dịch đang hoạt động',
    }]);
    expect(screen.getByText('Chỉ có thể chạy chiến dịch đang hoạt động')).toBeInTheDocument();
  });

  it('lượt completed / running không hiện dòng lý do, kể cả khi có errorMessage cũ', () => {
    renderDetail([
      { id: 2, status: 'completed', startedAt: '2026-09-21T00:30:00Z', errorMessage: 'lỗi cũ' },
      { id: 3, status: 'running', startedAt: '2026-09-21T00:31:00Z', errorMessage: 'lỗi cũ' },
    ]);
    expect(screen.queryByText('lỗi cũ')).not.toBeInTheDocument();
  });

  it('lượt failed không có errorMessage → không có dòng rỗng', () => {
    renderDetail([{ id: 4, status: 'failed', startedAt: '2026-09-21T00:30:00Z' }]);
    expect(document.querySelector('p.text-red-600')).toBeNull();
  });
});
