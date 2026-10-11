/**
 * PLAN_DANG_XUAT_ZALO_AN_HOI_THOAI 11/10/2026 — nút "Đăng xuất" trên thẻ tài khoản Zalo.
 *
 * Đăng xuất ≠ Xoá: hội thoại của tài khoản ẩn khỏi Hộp thư cho tới khi chính tài khoản Zalo đó quét QR lại. Nút chỉ hiện khi
 * status ∈ {connected, needs_reauth, disconnected} và không readOnly; tài khoản `logged_out` chỉ còn "Kết nối lại" (QR) + Xoá.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import toast from 'react-hot-toast';
import ZaloSettings from '../ZaloSettings';
import zaloSettingsApiService from '../../../features/settings/services/zaloSettingsApi.service';

vi.mock('../../../stores/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 1, name: 'Admin', role: 'owner' },
  }),
}));

vi.mock('../../../i18n', () => ({
  useI18n: () => ({
    t: (key, params) => (params ? `${key}|${JSON.stringify(params)}` : key),
  }),
}));

vi.mock('../../../features/settings/services/zaloSettingsApi.service', () => ({
  default: {
    listAccounts: vi.fn(),
    deleteAccount: vi.fn(),
    logoutAccount: vi.fn(),
    setDefaultAccount: vi.fn(),
    createLoginQr: vi.fn(),
    restoreSession: vi.fn(),
    retryRestore: vi.fn(),
    getLoginQrStatus: vi.fn(),
    updateSendLimit: vi.fn(),
    updateSendSpeed: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

const ACCOUNTS = [
  { id: 1, displayName: 'Nick Connected', status: 'connected', isActive: true, zaloPhone: '0901111111' },
  { id: 2, displayName: 'Nick Needs Reauth', status: 'needs_reauth', isActive: true, zaloPhone: '0902222222' },
  { id: 3, displayName: 'Nick Disconnected', status: 'disconnected', isActive: true, zaloPhone: '0903333333' },
  { id: 4, displayName: 'Nick Logged Out', status: 'logged_out', isActive: true, zaloPhone: '0904444444' },
];

/** Thẻ tài khoản chứa tên hiển thị (h3 → khối thẻ ngoài cùng của dòng). */
const cardOf = (name) => screen.getByText(name).closest('div.rounded-xl');

beforeEach(() => {
  vi.clearAllMocks();
  zaloSettingsApiService.listAccounts.mockResolvedValue({ data: { data: { items: ACCOUNTS } } });
  zaloSettingsApiService.logoutAccount.mockResolvedValue({ data: { success: true } });
});

describe('ZaloSettings — Đăng xuất Zalo', () => {
  it('nút Đăng xuất hiện với connected / needs_reauth / disconnected, KHÔNG hiện với logged_out', async () => {
    render(<ZaloSettings />);
    await screen.findByText('Nick Logged Out');

    for (const name of ['Nick Connected', 'Nick Needs Reauth', 'Nick Disconnected']) {
      expect(within(cardOf(name)).getByRole('button', { name: /zaloSettings\.logout/ })).toBeTruthy();
    }
    expect(within(cardOf('Nick Logged Out')).queryByRole('button', { name: /zaloSettings\.logout/ })).toBeNull();
  });

  it('logged_out: badge "Đã đăng xuất" + dòng gợi ý; chỉ còn "Kết nối lại" (QR) và Xoá — ẩn "Khôi phục" / "Thử khôi phục lại"', async () => {
    render(<ZaloSettings />);
    await screen.findByText('Nick Logged Out');

    const card = within(cardOf('Nick Logged Out'));
    expect(card.getByText('zaloSettings.loggedOut')).toBeTruthy();
    expect(card.getByText('zaloSettings.loggedOutHint')).toBeTruthy();
    expect(card.getByRole('button', { name: /zaloSettings\.reconnectQr/ })).toBeTruthy();
    expect(card.queryByRole('button', { name: /zaloSettings\.restoreSession/ })).toBeNull();
    expect(card.queryByRole('button', { name: /zaloSettings\.retryRestore/ })).toBeNull();
    expect(card.getByTitle('zaloSettings.delete')).toBeTruthy();
    // Không nhầm với badge "Mất kết nối".
    expect(card.queryByText('zaloSettings.disconnected')).toBeNull();
  });

  it('tài khoản hết phiên (needs_reauth / disconnected) giữ nguyên nút cũ: Thử khôi phục lại + Khôi phục + Kết nối lại', async () => {
    render(<ZaloSettings />);
    await screen.findByText('Nick Logged Out');

    for (const name of ['Nick Needs Reauth', 'Nick Disconnected']) {
      const card = within(cardOf(name));
      expect(card.getByRole('button', { name: /zaloSettings\.retryRestore/ })).toBeTruthy();
      expect(card.getByRole('button', { name: /zaloSettings\.restoreSession/ })).toBeTruthy();
      expect(card.getByRole('button', { name: /zaloSettings\.reconnectQr/ })).toBeTruthy();
    }
  });

  it('bấm Đăng xuất → hỏi xác nhận (tên tài khoản + "dữ liệu không bị xoá"); xác nhận → gọi logoutAccount(id), tải lại, toast thành công', async () => {
    render(<ZaloSettings />);
    await screen.findByText('Nick Connected');
    zaloSettingsApiService.listAccounts.mockClear();

    fireEvent.click(within(cardOf('Nick Connected')).getByRole('button', { name: /zaloSettings\.logout/ }));

    const modal = within(await screen.findByTestId('confirm-modal'));
    expect(modal.getByText(/zaloSettings\.logoutConfirmTitle\|.*Nick Connected/)).toBeTruthy();
    expect(modal.getByText('zaloSettings.logoutConfirmBody')).toBeTruthy();
    expect(zaloSettingsApiService.logoutAccount).not.toHaveBeenCalled();

    fireEvent.click(modal.getByRole('button', { name: 'zaloSettings.logout' }));

    await waitFor(() => expect(zaloSettingsApiService.logoutAccount).toHaveBeenCalledWith('1'));
    await waitFor(() => expect(zaloSettingsApiService.listAccounts).toHaveBeenCalled());
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('zaloSettings.logoutSuccess'));
    // Đăng xuất ≠ Xoá.
    expect(zaloSettingsApiService.deleteAccount).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('confirm-modal')).toBeNull());
  });

  it('huỷ ở hộp xác nhận → không gọi API', async () => {
    render(<ZaloSettings />);
    await screen.findByText('Nick Connected');

    fireEvent.click(within(cardOf('Nick Connected')).getByRole('button', { name: /zaloSettings\.logout/ }));
    const modal = within(await screen.findByTestId('confirm-modal'));
    // `t` mock trả khoá, nên nhãn nút huỷ là khoá `common.cancel`.
    fireEvent.click(modal.getByRole('button', { name: 'common.cancel' }));

    await waitFor(() => expect(screen.queryByTestId('confirm-modal')).toBeNull());
    expect(zaloSettingsApiService.logoutAccount).not.toHaveBeenCalled();
  });

  it('API lỗi → toast báo lỗi (ưu tiên message của server), hộp xác nhận vẫn mở để thử lại', async () => {
    zaloSettingsApiService.logoutAccount.mockRejectedValue({ response: { data: { message: 'Không đủ quyền' } } });
    render(<ZaloSettings />);
    await screen.findByText('Nick Connected');

    fireEvent.click(within(cardOf('Nick Connected')).getByRole('button', { name: /zaloSettings\.logout/ }));
    const modal = within(await screen.findByTestId('confirm-modal'));
    fireEvent.click(modal.getByRole('button', { name: 'zaloSettings.logout' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Không đủ quyền'));
    expect(screen.getByTestId('confirm-modal')).toBeTruthy();
  });

  it('readOnly (gói không có kênh Zalo): không có nút Đăng xuất', async () => {
    render(<ZaloSettings readOnly />);
    await screen.findByText('Nick Connected');

    expect(screen.queryAllByRole('button', { name: /zaloSettings\.logout/ })).toHaveLength(0);
  });
});
