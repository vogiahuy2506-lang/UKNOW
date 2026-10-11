/**
 * Nút "Quét QR" ở đầu trang Zalo (11/10/2026) — đồng bộ với Telegram/WhatsApp, nơi nút chính nằm trên đầu trang.
 * Nó PHẢI là lối vào thứ hai của đúng luồng cũ: cùng handler `handleConnectByQr` với nút "Tạo QR đăng nhập"
 * trong thẻ bên dưới (gọi `createLoginQr`), và cùng điều kiện hiện (gói không có kênh Zalo -> `readOnly` -> không có).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import ZaloSettings from '../ZaloSettings';
import zaloSettingsApiService from '../../../features/settings/services/zaloSettingsApi.service';

vi.mock('../../../stores/authStore', () => ({
  useAuthStore: () => ({ user: { id: 1, name: 'Admin', role: 'owner' } }),
}));

vi.mock('../../../i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
}));

vi.mock('../../../features/settings/services/zaloSettingsApi.service', () => ({
  default: {
    listAccounts: vi.fn(),
    createLoginQr: vi.fn(),
    getLoginQrStatus: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  zaloSettingsApiService.listAccounts.mockResolvedValue({ data: { data: { items: [] } } });
});

const renderLoaded = async (props = {}) => {
  render(<ZaloSettings {...props} />);
  await waitFor(() => expect(zaloSettingsApiService.listAccounts).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByText('zaloSettings.noAccounts')).toBeInTheDocument());
};

describe('ZaloSettings — nút Quét QR ở đầu trang', () => {
  it('bấm "Quét QR" gọi createLoginQr đúng một lần, giống nút "Tạo QR đăng nhập" trong thẻ', async () => {
    zaloSettingsApiService.createLoginQr.mockRejectedValue({ response: { data: { message: 'loi-qr' } } });
    await renderLoaded();

    fireEvent.click(screen.getByRole('button', { name: 'zaloSettings.scanQr' }));

    await waitFor(() => expect(zaloSettingsApiService.createLoginQr).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('loi-qr'));

    // Nút trong thẻ vẫn còn và cùng đi về một handler.
    fireEvent.click(screen.getByRole('button', { name: 'zaloSettings.createQrLogin' }));
    await waitFor(() => expect(zaloSettingsApiService.createLoginQr).toHaveBeenCalledTimes(2));
  });

  it('đang tạo QR thì nút đầu trang bị khoá và đổi nhãn (không bấm đúp)', async () => {
    zaloSettingsApiService.createLoginQr.mockReturnValue(new Promise(() => {}));
    await renderLoaded();

    fireEvent.click(screen.getByRole('button', { name: 'zaloSettings.scanQr' }));

    await waitFor(() => {
      const busy = screen.getAllByRole('button', { name: 'zaloSettings.creatingQr' });
      expect(busy.length).toBeGreaterThan(0);
      busy.forEach((btn) => expect(btn).toBeDisabled());
    });
    expect(zaloSettingsApiService.createLoginQr).toHaveBeenCalledTimes(1);
  });

  it('readOnly (gói không có kênh Zalo): không có nút Quét QR ở đầu trang, vẫn có Làm mới', async () => {
    await renderLoaded({ readOnly: true });

    expect(screen.queryByRole('button', { name: 'zaloSettings.scanQr' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'zaloSettings.createQrLogin' })).toBeNull();
    expect(screen.getByRole('button', { name: 'common.refresh' })).toBeInTheDocument();
  });

  it('"Làm mới" tải lại danh sách và giữ nguyên nhãn khi đang tải', async () => {
    await renderLoaded();
    const callsBefore = zaloSettingsApiService.listAccounts.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'common.refresh' }));

    await waitFor(() => expect(zaloSettingsApiService.listAccounts.mock.calls.length).toBeGreaterThan(callsBefore));
    expect(screen.getByRole('button', { name: 'common.refresh' })).toBeInTheDocument();
  });
});
