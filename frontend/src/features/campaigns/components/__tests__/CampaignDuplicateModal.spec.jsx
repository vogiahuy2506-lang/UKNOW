import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../../i18n';
import CampaignDuplicateModal from '../CampaignDuplicateModal';

/**
 * PLAN_NUT_HANH_DONG_TRONG_SO_DO_CHIEN_DICH_2026-09-16.md — PR-2, Việc 1: tách khỏi
 * Campaigns.jsx (khối :1034 + handleDuplicate :285) thành component dùng chung — refactor thuần.
 *
 * onDone phải nhận ĐÚNG dữ liệu campaign vừa nhân bản (response.data.data — campaign.controller.js
 * :896-900 trả 201 với { data: <campaign đã nhân bản> }), để nơi gọi (builder) đọc id mà không đoán.
 */
const { mockDuplicateCampaign } = vi.hoisted(() => ({ mockDuplicateCampaign: vi.fn() }));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../services/campaignApi.service', () => ({
  default: {
    duplicateCampaign: mockDuplicateCampaign,
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
      <CampaignDuplicateModal {...props} />
    </I18nProvider>
  );
  return props;
}

describe('CampaignDuplicateModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('open=false không render gì', () => {
    renderModal({ open: false });
    expect(screen.queryByText('Nhân bản chiến dịch')).not.toBeInTheDocument();
  });

  it('mở modal → tên mặc định là "<tên gốc> (Bản sao)"', () => {
    renderModal();
    expect(screen.getByPlaceholderText('Nhập tên chiến dịch mới')).toHaveValue('Chiến dịch Thu (Bản sao)');
  });

  it('gửi đúng payload tới đúng id, onDone nhận ĐÚNG dữ liệu response.data.data', async () => {
    const duplicated = { id: 777, campaignName: 'Chiến dịch Thu (Bản sao)', campaignType: 'email', status: 'draft' };
    mockDuplicateCampaign.mockResolvedValue({ data: { data: duplicated } });
    const props = renderModal();

    fireEvent.change(screen.getByPlaceholderText('Nhập tên chiến dịch mới'), {
      target: { value: '  Tên mới có khoảng trắng  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Nhân bản' }));

    await waitFor(() => expect(mockDuplicateCampaign).toHaveBeenCalledTimes(1));
    expect(mockDuplicateCampaign).toHaveBeenCalledWith(55, { campaignName: 'Tên mới có khoảng trắng' });
    await waitFor(() => expect(props.onDone).toHaveBeenCalledWith(duplicated));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('tên rỗng → báo lỗi, KHÔNG gọi API', () => {
    const props = renderModal();
    fireEvent.change(screen.getByPlaceholderText('Nhập tên chiến dịch mới'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Nhân bản' }));
    expect(mockDuplicateCampaign).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('lỗi server → hiện ĐÚNG câu server trả, không phải câu chung; không đóng modal', async () => {
    mockDuplicateCampaign.mockRejectedValue({
      response: { data: { message: 'Không thể nhân bản chiến dịch mua từ marketplace' } },
    });
    const props = renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Nhân bản' }));

    await waitFor(() => expect(mockDuplicateCampaign).toHaveBeenCalledTimes(1));
    const toast = (await import('react-hot-toast')).default;
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Không thể nhân bản chiến dịch mua từ marketplace'));
    expect(props.onClose).not.toHaveBeenCalled();
  });
});
