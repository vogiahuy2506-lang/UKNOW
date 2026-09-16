import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../../i18n';
import CampaignBuilderToolbar from '../CampaignBuilderToolbar';

/**
 * PLAN_NUT_HANH_DONG_TRONG_SO_DO_CHIEN_DICH_2026-09-16.md — PR-1.
 *
 * Spec của CampaignBuilder mock cả layout, nên KHÔNG canh được nút nào nối vào hàm nào. Đây đúng là
 * chỗ sai thì đắt nhất: "Chạy thử" chỉ chạy trong trình duyệt để xem trước, "Chạy ngay" gửi thật cho
 * khách. Nối nhầm hai cái này là tin đã gửi đi rồi mới biết, test kia vẫn xanh.
 */
function renderToolbar(overrides = {}) {
  const props = {
    onRunNow: vi.fn(),
    onOpenSchedule: vi.fn(),
    canUseServerRunActions: true,
    serverRunActionsDisabledHint: 'Lưu chiến dịch trước đã',
    onRunCampaign: vi.fn(),
    isRunning: false,
    onStopRun: vi.fn(),
    onOpenNameModal: vi.fn(),
    ...overrides,
  };
  render(
    <I18nProvider>
      <CampaignBuilderToolbar {...props} />
    </I18nProvider>
  );
  return props;
}

describe('CampaignBuilderToolbar', () => {
  it('có đủ 5 nút, hai nhãn chạy KHÁC hẳn nhau', () => {
    renderToolbar();
    expect(screen.getByRole('button', { name: 'Chạy ngay' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lên lịch' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chạy thử' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dừng' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeInTheDocument();
    // Không còn nhãn trống nghĩa "Chạy" đứng cạnh "Chạy ngay".
    expect(screen.queryByRole('button', { name: 'Chạy' })).not.toBeInTheDocument();
  });

  it('mỗi nút gọi ĐÚNG hàm của nó — không nút nào nối chéo', () => {
    const props = renderToolbar();

    fireEvent.click(screen.getByRole('button', { name: 'Chạy ngay' }));
    expect(props.onRunNow).toHaveBeenCalledTimes(1);
    expect(props.onRunCampaign).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Chạy thử' }));
    expect(props.onRunCampaign).toHaveBeenCalledTimes(1);
    expect(props.onRunNow).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Lên lịch' }));
    expect(props.onOpenSchedule).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(props.onOpenNameModal).toHaveBeenCalledTimes(1);
  });

  it('chiến dịch chưa lưu lần nào → 2 nút gửi thật vô hiệu kèm tooltip, chạy thử vẫn bấm được', () => {
    const props = renderToolbar({ canUseServerRunActions: false });

    const runNow = screen.getByRole('button', { name: 'Chạy ngay' });
    const schedule = screen.getByRole('button', { name: 'Lên lịch' });
    expect(runNow).toBeDisabled();
    expect(schedule).toBeDisabled();
    expect(runNow).toHaveAttribute('title', 'Lưu chiến dịch trước đã');
    expect(schedule).toHaveAttribute('title', 'Lưu chiến dịch trước đã');

    fireEvent.click(runNow);
    expect(props.onRunNow).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Chạy thử' })).toBeEnabled();
  });

  it('đang chạy thử → khoá "Chạy thử", mở "Dừng"; 2 nút gửi thật không bị khoá theo', () => {
    renderToolbar({ isRunning: true });

    expect(screen.getByRole('button', { name: 'Chạy thử' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Dừng' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Chạy ngay' })).toBeEnabled();
  });
});
