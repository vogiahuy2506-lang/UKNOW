import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CampaignSchedulesTable from '../CampaignSchedulesTable';
import viTranslations from '../../../../i18n/vi';

// Helper get nested translation
const getNestedTranslation = (obj, path) =>
  path.split('.').reduce((acc, part) => acc?.[part], obj);

const mockT = (key) => {
  const val = getNestedTranslation(viTranslations, key);
  return typeof val === 'string' ? val : key;
};

vi.mock('../../../../i18n', () => ({
  useI18n: () => ({ t: mockT }),
}));

describe('CampaignSchedulesTable — Bảng lịch chạy đã thiết lập (bật/tắt rõ ràng, canEdit)', () => {
  let onToggleSchedule;
  let onOpenScheduleDetailModal;
  let onDeleteSchedule;
  let isCampaignRunningById;

  beforeEach(() => {
    onToggleSchedule = vi.fn();
    onOpenScheduleDetailModal = vi.fn();
    onDeleteSchedule = vi.fn();
    isCampaignRunningById = vi.fn(() => false);
  });

  const renderComponent = (schedules = [], customProps = {}) => {
    const defaultProps = {
      schedules,
      filteredSchedules: schedules,
      scheduledCampaignSearch: '',
      onScheduledCampaignSearchChange: vi.fn(),
      isCampaignRunningById,
      getWeeklyDayLabel: (val) => `Thứ ${val}`,
      getWeeklyDayFromCron: () => '1',
      getScheduleTypeLabel: (type) =>
        type === 'daily' ? 'Hàng ngày' : type === 'once' ? 'Một lần' : type,
      getScheduleStatusClassName: (s) => (s.enabled ? 'badge-success' : 'badge-gray'),
      getScheduleStatusLabel: (s) => (s.enabled ? 'Đang bật' : 'Đã tắt'),
      isReadonlyOnceSchedule: (s) => Boolean(s.isReadonly),
      onOpenScheduleDetailModal,
      onDeleteSchedule,
      onToggleSchedule,
      canEdit: true,
      ...customProps,
    };

    return render(
      <MemoryRouter>
        <CampaignSchedulesTable {...defaultProps} />
      </MemoryRouter>
    );
  };

  it('hiển thị đầy đủ các cột mới: Lần chạy gần nhất, Lần chạy tiếp, Bật/Tắt (thay thế cột cron thô)', () => {
    const schedules = [
      {
        id: 1,
        scheduleName: 'Lịch sáng',
        campaignName: 'Chiến dịch Chào thu',
        campaignId: 101,
        scheduleType: 'daily',
        cronExpression: '0 9 * * *',
        enabled: true,
        lastRunAt: '2026-09-11T09:00:00Z',
        nextRunAt: '2026-09-12T09:00:00Z',
        runCount: 3,
      },
    ];

    renderComponent(schedules);

    // Có cột Lần chạy gần nhất, Lần chạy tiếp, Bật/Tắt
    expect(screen.getByText('Lần chạy gần nhất')).toBeInTheDocument();
    expect(screen.getByText('Lần chạy tiếp')).toBeInTheDocument();
    expect(screen.getByText('Bật/Tắt')).toBeInTheDocument();

    // Không còn cột Cron thô trên header bảng
    expect(screen.queryByRole('columnheader', { name: 'Cron' })).not.toBeInTheDocument();
  });

  it('badge trạng thái là thẻ hiển thị (span), không còn là nút bấm', () => {
    const schedules = [
      {
        id: 1,
        scheduleName: 'Lịch sáng',
        campaignName: 'Chiến dịch A',
        campaignId: 101,
        scheduleType: 'daily',
        enabled: true,
      },
    ];

    renderComponent(schedules);

    const badge = screen.getByText('Đang bật');
    expect(badge.tagName).toBe('SPAN');
    expect(badge.closest('button')).toBeNull();
  });

  it('lịch đang bật: công tắc checked, aria-label "Tắt lịch", bấm công tắc hoặc nút Thao tác đều gọi onToggleSchedule', () => {
    const schedules = [
      {
        id: 1,
        scheduleName: 'Lịch sáng',
        campaignName: 'Chiến dịch A',
        campaignId: 101,
        scheduleType: 'daily',
        enabled: true,
        lastRunAt: '2026-09-11T09:00:00Z',
        nextRunAt: '2026-09-12T09:00:00Z',
        runCount: 5,
      },
    ];

    renderComponent(schedules);

    const switchBtn = screen.getByRole('switch');
    expect(switchBtn).toHaveAttribute('aria-checked', 'true');
    expect(switchBtn).toHaveAttribute('aria-label', 'Tắt lịch');
    expect(screen.getByText('Bật')).toBeInTheDocument();

    // Nút Thao tác có chữ "Tắt lịch"
    const actionToggleBtn = screen.getByRole('button', { name: 'Tắt lịch' });
    expect(actionToggleBtn).toBeInTheDocument();

    // Bấm công tắc
    fireEvent.click(switchBtn);
    expect(onToggleSchedule).toHaveBeenCalledWith(1, true);

    // Bấm nút trong cột Thao tác
    fireEvent.click(actionToggleBtn);
    expect(onToggleSchedule).toHaveBeenCalledWith(1, true);

    // Lần chạy gần nhất hiện số lần chạy
    expect(screen.getByText(/5 lần/)).toBeInTheDocument();
  });

  it('lịch đang tắt: công tắc unchecked, aria-label "Bật lịch", Lần chạy tiếp hiện "—"', () => {
    const schedules = [
      {
        id: 2,
        scheduleName: 'Lịch chiều',
        campaignName: 'Chiến dịch B',
        campaignId: 102,
        scheduleType: 'daily',
        enabled: false,
        lastRunAt: null,
        nextRunAt: '2026-09-12T15:00:00Z',
        runCount: 0,
      },
    ];

    renderComponent(schedules);

    const switchBtn = screen.getByRole('switch');
    expect(switchBtn).toHaveAttribute('aria-checked', 'false');
    expect(switchBtn).toHaveAttribute('aria-label', 'Bật lịch');
    expect(screen.getByText('Tắt')).toBeInTheDocument();

    // Nút Thao tác có chữ "Bật lịch"
    const actionToggleBtn = screen.getByRole('button', { name: 'Bật lịch' });
    expect(actionToggleBtn).toBeInTheDocument();

    // Bấm công tắc
    fireEvent.click(switchBtn);
    expect(onToggleSchedule).toHaveBeenCalledWith(2, false);

    // Khi lịch tắt → Lần chạy tiếp phải hiện "—"
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('lịch bị khoá (một lần đã xong/dừng): công tắc disabled + tooltip lý do, nút Thao tác disabled', () => {
    const schedules = [
      {
        id: 3,
        scheduleName: 'Lịch 1 lần đã xong',
        campaignName: 'Chiến dịch C',
        campaignId: 103,
        scheduleType: 'once',
        enabled: false,
        isReadonly: true,
        lastRunAt: '2026-09-10T10:00:00Z',
        runCount: 1,
      },
    ];

    renderComponent(schedules);

    const switchBtn = screen.getByRole('switch');
    expect(switchBtn).toBeDisabled();

    // Container switch có tooltip giải thích
    const switchWrapper = switchBtn.closest('[title]');
    expect(switchWrapper).toHaveAttribute(
      'title',
      'Lịch chạy một lần đã hoàn thành, tạo lịch mới nếu muốn chạy lại'
    );

    // Nút thao tác cũng bị disabled
    const actionToggleBtn = screen.getByRole('button', { name: 'Bật lịch' });
    expect(actionToggleBtn).toBeDisabled();
    expect(actionToggleBtn).toHaveAttribute(
      'title',
      'Lịch chạy một lần đã hoàn thành, tạo lịch mới nếu muốn chạy lại'
    );

    // Bấm vào không kích hoạt onToggleSchedule
    fireEvent.click(switchBtn);
    fireEvent.click(actionToggleBtn);
    expect(onToggleSchedule).not.toHaveBeenCalled();
  });

  it('lịch đang tắt mà chiến dịch đang chạy: công tắc có tooltip giải thích', () => {
    isCampaignRunningById.mockImplementation((id) => id === 104);

    const schedules = [
      {
        id: 4,
        scheduleName: 'Lịch chiến dịch đang chạy',
        campaignName: 'Chiến dịch D',
        campaignId: 104,
        scheduleType: 'daily',
        enabled: false,
        isReadonly: false,
        lastRunAt: null,
      },
    ];

    renderComponent(schedules);

    const switchBtn = screen.getByRole('switch');
    const switchWrapper = switchBtn.closest('[title]');
    expect(switchWrapper).toHaveAttribute(
      'title',
      'Không thể bật lịch khi chiến dịch đang chạy'
    );

    const actionToggleBtn = screen.getByRole('button', { name: 'Bật lịch' });
    expect(actionToggleBtn).toHaveAttribute(
      'title',
      'Không thể bật lịch khi chiến dịch đang chạy'
    );
  });

  it('canEdit = false: không có role="switch", không có nút xoá hoặc nút bật/tắt trong Thao tác', () => {
    const schedules = [
      {
        id: 5,
        scheduleName: 'Lịch của nhân viên view-only',
        campaignName: 'Chiến dịch E',
        campaignId: 105,
        scheduleType: 'daily',
        enabled: true,
        lastRunAt: null,
      },
    ];

    renderComponent(schedules, { canEdit: false });

    // Không có switch toggle
    expect(screen.queryByRole('switch')).toBeNull();

    // Không có nút Tắt lịch / Bật lịch
    expect(screen.queryByRole('button', { name: 'Tắt lịch' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bật lịch' })).toBeNull();

    // Không có nút Xoá
    expect(screen.queryByTitle('Xóa lịch')).toBeNull();

    // Nút Xem chi tiết vẫn có
    expect(screen.getByTitle('Xem chi tiết')).toBeInTheDocument();
  });
});
