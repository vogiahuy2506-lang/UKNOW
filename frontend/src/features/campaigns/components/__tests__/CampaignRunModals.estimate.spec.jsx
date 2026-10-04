/**
 * PR-3 ước tính thời gian gửi — hộp "Chạy" và hộp "Đặt lịch" hiện ước tính; 409 SCHEDULE_OVERLAP hiện câu server + gợi ý.
 * Lỗi tải ước tính KHÔNG được chặn nút Chạy / Đặt lịch.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CampaignRunModals from '../CampaignRunModals';
import { ESTIMATE_438 } from '../../utils/__tests__/campaignEstimate.fixtures';
import viTranslations from '../../../../i18n/vi';

const mockT = (key, params = {}) => {
  const val = key.split('.').reduce((acc, part) => acc?.[part], viTranslations);
  if (typeof val !== 'string') return key;
  return val.replace(/\{(\w+)\}/g, (_, name) => (params[name] ?? `{${name}}`));
};
vi.mock('../../../../i18n', () => ({ useI18n: () => ({ t: mockT }) }));

const scheduleForm = {
  scheduleName: 'Lịch 438', scheduleType: 'once', scheduleDate: '2026-10-05', scheduleTime: '06:00', weeklyDay: '1',
  customIntervalDays: '2', delayValue: '30', delayUnit: 'minutes', delayPreviewAt: null, cronExpression: '', enabled: true,
};

const renderRunModal = (props = {}) => {
  const handleRunNow = vi.fn();
  render(
    <CampaignRunModals
      weeklyDayOptions={[]}
      showRunConfirmModal
      closeRunConfirmModal={vi.fn()}
      runConfirmCampaign={{ id: 438, campaignName: 'Chiến dịch 438' }}
      runNameInput="Chiến dịch 438"
      setRunNameInput={vi.fn()}
      shouldShowRunContinuousOptions={false}
      isSubmittingRun={false}
      handleRunNow={handleRunNow}
      stoppingRunIds={new Set()}
      {...props}
    />,
  );
  return { handleRunNow };
};

const renderScheduleModal = (props = {}) => {
  const handleSaveSchedule = vi.fn();
  render(
    <CampaignRunModals
      weeklyDayOptions={[]}
      showScheduleModal
      selectedCampaign={{ id: 438, campaignName: 'Chiến dịch 438', status: 'active' }}
      closeScheduleModal={vi.fn()}
      scheduleForm={scheduleForm}
      setScheduleForm={vi.fn()}
      handleSaveSchedule={handleSaveSchedule}
      stoppingRunIds={new Set()}
      {...props}
    />,
  );
  return { handleSaveSchedule };
};

describe('hộp "Chạy" — ước tính thời gian gửi', () => {
  it('chiến dịch 438: hiện dự kiến xong 08/10 21:25 (khoảng 4 ngày), bảng theo nick và cảnh báo', () => {
    renderRunModal({ runEstimate: { status: 'ready', estimate: ESTIMATE_438 } });
    expect(screen.getByTestId('campaign-estimate-finish')).toHaveTextContent('08/10 21:25');
    expect(screen.getByTestId('campaign-estimate-table')).toHaveTextContent('Nick Minh Zalo');
    expect(screen.getByTestId('campaign-estimate-warnings')).toHaveTextContent('vượt mức khuyến nghị');
  });

  it('ước tính lỗi → câu nhẹ, nút "Xác nhận chạy" VẪN bấm được', () => {
    const { handleRunNow } = renderRunModal({ runEstimate: { status: 'error', estimate: null } });
    expect(screen.getByTestId('campaign-estimate-unavailable')).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: viTranslations.campaignRunModals.confirmingRun });
    expect(confirm).not.toBeDisabled();
    fireEvent.click(confirm);
    expect(handleRunNow).toHaveBeenCalledTimes(1);
  });

  it('đang tải ước tính → nút chạy không bị khoá', () => {
    renderRunModal({ runEstimate: { status: 'loading', estimate: null } });
    expect(screen.getByTestId('campaign-estimate-loading')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: viTranslations.campaignRunModals.confirmingRun })).not.toBeDisabled();
  });

  it('không truyền runEstimate (trang cũ) → không hiện khối nào', () => {
    renderRunModal();
    expect(screen.queryByTestId('campaign-estimate')).not.toBeInTheDocument();
    expect(screen.queryByTestId('campaign-estimate-unavailable')).not.toBeInTheDocument();
  });
});

describe('hộp "Đặt lịch" — ước tính + 409 SCHEDULE_OVERLAP', () => {
  it('hiện ước tính theo giờ nổ đã chọn', () => {
    renderScheduleModal({ scheduleEstimate: { status: 'ready', estimate: ESTIMATE_438 } });
    expect(screen.getByTestId('campaign-estimate-finish')).toHaveTextContent('08/10 21:25');
  });

  it('ước tính lỗi → vẫn bấm được nút tạo lịch', () => {
    const { handleSaveSchedule } = renderScheduleModal({ scheduleEstimate: { status: 'error', estimate: null } });
    expect(screen.getByTestId('campaign-estimate-unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: viTranslations.campaignRunModals.createSchedule }));
    expect(handleSaveSchedule).toHaveBeenCalledTimes(1);
  });

  it('409 SCHEDULE_OVERLAP: hiện NGUYÊN câu của server + 3 gợi ý', () => {
    const serverMessage = 'Lượt chạy lúc 03/10 09:00 dự kiến xong khoảng 06/10 10:00, lịch kế tiếp lúc 04/10 09:00 sẽ bị bỏ qua.';
    renderScheduleModal({
      scheduleFormError: serverMessage,
      scheduleOverlapSuggestions: [
        viTranslations.campaignEstimate.suggestion.use_steps,
        viTranslations.campaignEstimate.suggestion.add_accounts,
        viTranslations.campaignEstimate.suggestion.spread_schedule,
      ],
    });
    expect(screen.getByText(serverMessage)).toBeInTheDocument();
    const list = screen.getByTestId('schedule-overlap-suggestions');
    expect(list.querySelectorAll('li')).toHaveLength(3);
    expect(list).toHaveTextContent('chuỗi tin nhiều bước');
    expect(list).toHaveTextContent('Thêm tài khoản gửi');
    expect(list).toHaveTextContent('Giãn lịch');
  });

  it('lỗi thường (không phải chồng lịch) → không có danh sách gợi ý', () => {
    renderScheduleModal({ scheduleFormError: 'Lỗi khác' });
    expect(screen.queryByTestId('schedule-overlap-suggestions')).not.toBeInTheDocument();
  });

  it('khối lỗi có role="alert" và được cuộn vào tầm nhìn khi lỗi xuất hiện', () => {
    const scrollIntoView = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      renderScheduleModal({ scheduleFormError: 'Lượt chạy lúc 03/10 sẽ chồng lịch kế tiếp.' });
      expect(screen.getByRole('alert')).toHaveTextContent('chồng lịch kế tiếp');
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('không có lỗi → không có khối alert và không cuộn', () => {
    const scrollIntoView = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      renderScheduleModal();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });
});
