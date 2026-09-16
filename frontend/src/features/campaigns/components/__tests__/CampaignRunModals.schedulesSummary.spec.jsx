/**
 * Phản hồi sếp 14/09: hộp "Lịch chạy đã thiết lập" chỉ hiện nhãn trạng thái, không có nút bật/tắt.
 * `handleToggleSchedule`/`isReadonlyOnceSchedule` đã có sẵn ở `Campaigns.jsx`, hộp chỉ chưa dựng
 * công tắc — test này khoá đúng hành vi công tắc mới trong nhánh `campaignSchedulesModalCampaign`
 * của `CampaignRunModals.jsx` (chưa có spec nào cho file này trước đây).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CampaignRunModals from '../CampaignRunModals';
import { isReadonlyOnceSchedule as realIsReadonlyOnceSchedule } from '../../utils/campaignRunSchedule.helpers';
import viTranslations from '../../../../i18n/vi';

const getNestedTranslation = (obj, path) => path.split('.').reduce((acc, part) => acc?.[part], obj);
const mockT = (key) => {
  const val = getNestedTranslation(viTranslations, key);
  return typeof val === 'string' ? val : key;
};

vi.mock('../../../../i18n', () => ({
  useI18n: () => ({ t: mockT }),
}));

describe('CampaignRunModals — hộp "Lịch chạy đã thiết lập" có công tắc bật/tắt', () => {
  let handleToggleSchedule;

  beforeEach(() => {
    handleToggleSchedule = vi.fn();
  });

  const renderComponent = (schedules, customProps = {}) => {
    const defaultProps = {
      campaignSchedulesModalCampaign: { id: 101, campaignName: 'Chiến dịch A' },
      closeCampaignSchedulesSummaryModal: vi.fn(),
      allSchedules: schedules,
      handleToggleSchedule,
      isReadonlyOnceSchedule: realIsReadonlyOnceSchedule,
      getScheduleStatusClassName: (s) => (s.enabled ? 'badge-success' : 'badge-gray'),
      getScheduleStatusLabel: (s) =>
        realIsReadonlyOnceSchedule(s) ? 'Đã hoàn thành' : s.enabled ? 'Đang bật' : 'Đang tắt',
      getWeeklyDayLabel: (v) => `Thứ ${v}`,
      getWeeklyDayFromCron: () => '2',
      canEditSchedules: true,
      ...customProps,
    };
    return render(<CampaignRunModals {...defaultProps} />);
  };

  it('lịch đang bật, chưa chạy: công tắc bật (checked), bấm gọi handleToggleSchedule(id, true)', () => {
    const schedules = [
      { id: 1, campaignId: 101, scheduleName: 'Lịch sáng', scheduleType: 'daily', cronExpression: '0 9 * * *', enabled: true, runCount: 0 },
    ];
    renderComponent(schedules);

    const switchBtn = screen.getByRole('switch');
    expect(switchBtn).toHaveAttribute('aria-checked', 'true');
    expect(switchBtn).not.toBeDisabled();
    expect(screen.getByText('Đang bật')).toBeInTheDocument();

    fireEvent.click(switchBtn);
    expect(handleToggleSchedule).toHaveBeenCalledTimes(1);
    expect(handleToggleSchedule).toHaveBeenCalledWith(1, true);
  });

  it('lịch đang tắt: công tắc tắt (unchecked), bấm gọi handleToggleSchedule(id, false) để bật lại', () => {
    const schedules = [
      { id: 2, campaignId: 101, scheduleName: 'Lịch chiều', scheduleType: 'daily', cronExpression: '0 15 * * *', enabled: false, runCount: 0 },
    ];
    renderComponent(schedules);

    const switchBtn = screen.getByRole('switch');
    expect(switchBtn).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(switchBtn);
    expect(handleToggleSchedule).toHaveBeenCalledWith(2, false);
  });

  it('lịch một lần ĐÃ HOÀN THÀNH (ca trong ảnh sếp): công tắc disabled + tooltip, nhãn trạng thái vẫn "Đã hoàn thành", bấm không gọi handleToggleSchedule', () => {
    const schedules = [
      { id: 3, campaignId: 101, scheduleName: 'Lịch 1 lần', scheduleType: 'once', cronExpression: '0 8 1 1 *', enabled: false, runCount: 1 },
    ];
    renderComponent(schedules);

    const switchBtn = screen.getByRole('switch');
    expect(switchBtn).toBeDisabled();
    const wrapper = switchBtn.closest('[title]');
    expect(wrapper).toHaveAttribute('title', 'Lịch chạy một lần đã hoàn thành, tạo lịch mới nếu muốn chạy lại');

    // Nhãn trạng thái KHÔNG bị công tắc mới thay đổi.
    expect(screen.getByText('Đã hoàn thành')).toBeInTheDocument();

    fireEvent.click(switchBtn);
    expect(handleToggleSchedule).not.toHaveBeenCalled();
  });

  it('canEditSchedules=false (nhân viên không có quyền tạo chiến dịch): không có công tắc nào trong hộp', () => {
    const schedules = [
      { id: 4, campaignId: 101, scheduleName: 'Lịch sáng', scheduleType: 'daily', enabled: true, runCount: 0 },
      { id: 5, campaignId: 101, scheduleName: 'Lịch 1 lần xong', scheduleType: 'once', enabled: false, runCount: 1 },
    ];
    renderComponent(schedules, { canEditSchedules: false });

    expect(screen.queryByRole('switch')).toBeNull();
    // Phần chữ (tên lịch, trạng thái) vẫn hiện nguyên.
    expect(screen.getByText('Lịch sáng')).toBeInTheDocument();
    expect(screen.getByText('Đang bật')).toBeInTheDocument();
  });

  it('canEditSchedules mặc định true khi không truyền prop (không đổi hành vi nơi khác)', () => {
    const schedules = [
      { id: 6, campaignId: 101, scheduleName: 'Lịch mặc định', scheduleType: 'daily', enabled: true, runCount: 0 },
    ];
    renderComponent(schedules, { canEditSchedules: undefined });
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('không có lịch nào: hiện câu "chưa có lịch", không có công tắc', () => {
    renderComponent([]);
    expect(screen.getByText('Hiện không có lịch chạy nào gắn với chiến dịch này.')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).toBeNull();
  });
});
