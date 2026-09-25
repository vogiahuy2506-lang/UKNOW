/**
 * PR-2 share notification (2026-09-25) — Unit test toast messages cho CampaignShareModal.
 *
 * Phân nhánh:
 *   - share 100% với user đã có tài khoản → toast "Đã chia sẻ và gửi email thông báo"
 *   - share 100% với email ngoài → toast "Đã lưu quyền chia sẻ... Hệ thống sẽ gửi email mời..."
 *   - share thành công 1 phần (1 existing + 1 fail) → toast có "{succeeded}/{total}"
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../../i18n';
import CampaignShareModal from '../CampaignShareModal';

const { mockShareCampaign, mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockShareCampaign: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: (...args) => mockToastSuccess(...args),
    error: (...args) => mockToastError(...args),
  },
}));

vi.mock('../../services/campaignApi.service', () => ({
  default: {
    shareCampaign: mockShareCampaign,
  },
}));

function renderModal() {
  return render(
    <I18nProvider>
      <CampaignShareModal
        campaign={{ id: 55, campaignName: 'Chiến dịch Thu' }}
        open
        onClose={vi.fn()}
        onDone={vi.fn()}
      />
    </I18nProvider>
  );
}

function setEmailAndSubmit(email) {
  // EmailTagsInput dùng input có placeholder "Nhập email và nhấn Enter để thêm..."
  const input = screen.getByPlaceholderText(/nhập email/i);
  fireEvent.change(input, { target: { value: email } });
  fireEvent.keyDown(input, { key: 'Enter' });
  // Click submit (button có thể là "Chia sẻ" hoặc "Chia sẻ (N)")
  const btn = screen.getByRole('button', { name: /^ch(ia|ẩ) s(ẻ|e)/i });
  fireEvent.click(btn);
}

describe('CampaignShareModal — toast theo nhánh (PR-2)', () => {
  beforeEach(() => {
    mockToastSuccess.mockClear();
    mockToastError.mockClear();
    mockShareCampaign.mockReset();
  });

  it('toast "Đã chia sẻ và gửi email thông báo" khi toàn bộ recipient là user đã có tài khoản', async () => {
    mockShareCampaign.mockResolvedValue({
      data: {
        success: true,
        data: {
          share: { id: 1 },
          recipient: { id: 99, name: 'Existing', email: 'existing@x.com' },
          isExistingUser: true,
          notificationSent: true,
        },
      },
    });
    renderModal();
    setEmailAndSubmit('existing@x.com');
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
    const msg = mockToastSuccess.mock.calls[0][0];
    expect(msg).toMatch(/Đã chia sẻ và gửi email thông báo/i);
  });

  it('toast "Đã lưu quyền chia sẻ..." khi toàn bộ recipient ngoài hệ thống', async () => {
    mockShareCampaign.mockResolvedValue({
      data: {
        success: true,
        data: {
          share: { id: 2, status: 'pending' },
          recipient: null,
          isExistingUser: false,
          notificationSent: true,
        },
      },
    });
    renderModal();
    setEmailAndSubmit('pending@x.com');
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
    const msg = mockToastSuccess.mock.calls[0][0];
    expect(msg).toMatch(/Hệ thống sẽ gửi email mời người nhận đăng ký/i);
  });

  it('toast mixed khi 1 share success (existing) + 1 fail', async () => {
    mockShareCampaign
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: { share: { id: 1 }, recipient: { id: 1 }, isExistingUser: true, notificationSent: true },
        },
      })
      .mockRejectedValueOnce(new Error('Lỗi 500'));
    renderModal();
    const input = screen.getByPlaceholderText(/nhập email/i);
    fireEvent.change(input, { target: { value: 'a@x.com' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.change(input, { target: { value: 'b@x.com' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const btn = screen.getByRole('button', { name: /^ch(ia|ẩ) s(ẻ|e)/i });
    fireEvent.click(btn);
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
    const successMsg = mockToastSuccess.mock.calls[0][0];
    expect(successMsg).toMatch(/Đã chia sẻ cho 1\/2/);
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  });

  it('shareCampaign được gọi với payload đúng (recipientEmail, shareType, canRun)', async () => {
    mockShareCampaign.mockResolvedValue({
      data: {
        success: true,
        data: { share: {}, recipient: null, isExistingUser: false, notificationSent: true },
      },
    });
    renderModal();
    setEmailAndSubmit('payload-check@x.com');
    await waitFor(() => expect(mockShareCampaign).toHaveBeenCalled());
    const [campaignId, payload] = mockShareCampaign.mock.calls[0];
    expect(campaignId).toBe(55);
    expect(payload.recipientEmail).toBe('payload-check@x.com');
    expect(payload.shareType).toBe('view');
    expect(payload.canRun).toBe(false);
  });
});
