import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../../i18n';
import CampaignShareModal from '../CampaignShareModal';

/**
 * PLAN_NUT_HANH_DONG_TRONG_SO_DO_CHIEN_DICH_2026-09-16.md — PR-2, Việc 1: tách khỏi
 * Campaigns.jsx (khối :1169 + handleShare :259) thành component dùng chung. Giữ nguyên 3 trường
 * (email, shareType, canRun) và luật hiện có — refactor thuần, test này canh hành vi KHÔNG đổi.
 */
const { mockShareCampaign } = vi.hoisted(() => ({ mockShareCampaign: vi.fn() }));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../services/campaignApi.service', () => ({
  default: {
    shareCampaign: mockShareCampaign,
  },
}));

function renderModal(overrides = {}) {
  const props = {
    campaign: { id: 55, campaignName: 'Chiến dịch Thu' },
    open: true,
    onClose: vi.fn(),
    onDone: vi.fn(),
    ...overrides,
  };
  render(
    <I18nProvider>
      <CampaignShareModal {...props} />
    </I18nProvider>
  );
  return props;
}

describe('CampaignShareModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('open=false không render gì', () => {
    renderModal({ open: false });
    expect(screen.queryByText('Chia sẻ chiến dịch')).not.toBeInTheDocument();
  });

  it('gửi đúng payload 3 trường (email, shareType, canRun) tới đúng id chiến dịch', async () => {
    mockShareCampaign.mockResolvedValue({ data: { success: true } });
    const props = renderModal();

    fireEvent.change(screen.getByPlaceholderText('email@example.com'), {
      target: { value: 'ban@vidu.com' },
    });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'edit' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Chia sẻ' }));

    await waitFor(() => expect(mockShareCampaign).toHaveBeenCalledTimes(1));
    expect(mockShareCampaign).toHaveBeenCalledWith(55, {
      recipientEmail: 'ban@vidu.com',
      shareType: 'edit',
      canRun: true,
    });
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(props.onDone).toHaveBeenCalledTimes(1);
  });

  it('email rỗng → báo lỗi, KHÔNG gọi API', () => {
    const props = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Chia sẻ' }));
    expect(mockShareCampaign).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('email sai định dạng (thiếu @) → báo lỗi, KHÔNG gọi API', () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText('email@example.com'), {
      target: { value: 'khong-phai-email' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Chia sẻ' }));
    expect(mockShareCampaign).not.toHaveBeenCalled();
  });

  it('lỗi server → hiện ĐÚNG câu server trả (err.response.data.message), không phải câu chung', async () => {
    mockShareCampaign.mockRejectedValue({
      response: { data: { message: 'Chiến dịch này không thuộc quyền quản lý của bạn' } },
    });
    const props = renderModal();

    fireEvent.change(screen.getByPlaceholderText('email@example.com'), {
      target: { value: 'ban@vidu.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Chia sẻ' }));

    await waitFor(() => expect(mockShareCampaign).toHaveBeenCalledTimes(1));
    const toast = (await import('react-hot-toast')).default;
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Chiến dịch này không thuộc quyền quản lý của bạn'));
    // Lỗi thì KHÔNG đóng modal — người dùng còn sửa lại được.
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('mở lại modal (đổi campaign) → form reset về mặc định, không giữ dữ liệu lần trước', () => {
    const { rerender } = render(
      <I18nProvider>
        <CampaignShareModal campaign={{ id: 55, campaignName: 'A' }} open onClose={vi.fn()} />
      </I18nProvider>
    );
    fireEvent.change(screen.getByPlaceholderText('email@example.com'), {
      target: { value: 'con-lai@vidu.com' },
    });

    rerender(
      <I18nProvider>
        <CampaignShareModal campaign={{ id: 55, campaignName: 'A' }} open={false} onClose={vi.fn()} />
      </I18nProvider>
    );
    rerender(
      <I18nProvider>
        <CampaignShareModal campaign={{ id: 66, campaignName: 'B' }} open onClose={vi.fn()} />
      </I18nProvider>
    );

    expect(screen.getByPlaceholderText('email@example.com')).toHaveValue('');
  });
});
