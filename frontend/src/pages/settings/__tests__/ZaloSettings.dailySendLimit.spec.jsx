/**
 * LENH_GIAO_GIOI_HAN_GUI_THEO_NGAY tiếp nối 2026-09-23, PR-4 (Zalo). Trước bản này ZaloSettings.jsx
 * không có handler lưu nào cho `userDailySendLimit` — chỉ liệt kê/xoá/đặt mặc định/đăng nhập QR.
 * Body PATCH .../send-limit PHẢI luôn có field này (backend `body(...).exists()`), ô trống = gửi
 * `null` tường minh, KHÔNG được gửi body rỗng.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ZaloSettings from '../ZaloSettings';
import zaloSettingsApiService from '../../../features/settings/services/zaloSettingsApi.service';

vi.mock('../../../stores/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 1, name: 'Admin', role: 'owner' },
  }),
}));

vi.mock('../../../i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
}));

vi.mock('../../../features/settings/services/zaloSettingsApi.service', () => ({
  default: {
    listAccounts: vi.fn(),
    deleteAccount: vi.fn(),
    setDefaultAccount: vi.fn(),
    createLoginQr: vi.fn(),
    restoreSession: vi.fn(),
    retryRestore: vi.fn(),
    getLoginQrStatus: vi.fn(),
    updateSendLimit: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const account = (over = {}) => ({
  id: 7,
  displayName: 'Nick chăm sóc',
  status: 'connected',
  isActive: true,
  zaloPhone: '0901111111',
  userDailySendLimit: 60,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  zaloSettingsApiService.listAccounts.mockResolvedValue({
    data: { data: { items: [account()] } },
  });
});

const renderAndWait = async () => {
  render(<ZaloSettings />);
  await waitFor(() => expect(screen.getByText('Nick chăm sóc')).toBeInTheDocument());
};

describe('ZaloSettings — ô Giới hạn gửi/ngày tại chỗ trên từng dòng (PR-4)', () => {
  it('tài khoản đã có giới hạn 60 → ô nhập hiện đúng 60', async () => {
    await renderAndWait();
    expect(screen.getByDisplayValue('60')).toBeInTheDocument();
  });

  it('bấm Lưu → gọi updateSendLimit(accountId, 60) — body LUÔN có field, không rỗng', async () => {
    zaloSettingsApiService.updateSendLimit.mockResolvedValueOnce({ data: { success: true } });
    await renderAndWait();

    fireEvent.click(screen.getAllByText('common.save')[0]);

    await waitFor(() => expect(zaloSettingsApiService.updateSendLimit).toHaveBeenCalledWith('7', 60));
  });

  it('sửa thành 80 rồi Lưu → gọi đúng giá trị mới', async () => {
    zaloSettingsApiService.updateSendLimit.mockResolvedValueOnce({ data: { success: true } });
    await renderAndWait();

    fireEvent.change(screen.getByDisplayValue('60'), { target: { value: '80' } });
    fireEvent.click(screen.getAllByText('common.save')[0]);

    await waitFor(() => expect(zaloSettingsApiService.updateSendLimit).toHaveBeenCalledWith('7', 80));
  });

  it('xoá trắng ô rồi Lưu → gọi updateSendLimit(accountId, null) tường minh (KHÔNG bỏ field)', async () => {
    zaloSettingsApiService.updateSendLimit.mockResolvedValueOnce({ data: { success: true } });
    await renderAndWait();

    fireEvent.change(screen.getByDisplayValue('60'), { target: { value: '' } });
    fireEvent.click(screen.getAllByText('common.save')[0]);

    await waitFor(() => expect(zaloSettingsApiService.updateSendLimit).toHaveBeenCalledWith('7', null));
  });

  it.each(['0', '-5', '1.5'])('nhập %p → chặn ở form, KHÔNG gọi API', async (badValue) => {
    await renderAndWait();

    fireEvent.change(screen.getByDisplayValue('60'), { target: { value: badValue } });
    fireEvent.click(screen.getAllByText('common.save')[0]);

    expect(zaloSettingsApiService.updateSendLimit).not.toHaveBeenCalled();
  });

  it('nhập 150 → vẫn lưu được (chính sách sếp chốt), có dòng cảnh báo', async () => {
    zaloSettingsApiService.updateSendLimit.mockResolvedValueOnce({ data: { success: true } });
    await renderAndWait();

    fireEvent.change(screen.getByDisplayValue('60'), { target: { value: '150' } });
    expect(screen.getByText('zaloSettings.dailySendLimitHighWarning')).toBeInTheDocument();

    fireEvent.click(screen.getAllByText('common.save')[0]);
    await waitFor(() => expect(zaloSettingsApiService.updateSendLimit).toHaveBeenCalledWith('7', 150));
  });

  it('tài khoản chưa có giới hạn (null) → ô nhập rỗng, không hiện "null"', async () => {
    zaloSettingsApiService.listAccounts.mockResolvedValueOnce({
      data: { data: { items: [account({ userDailySendLimit: null })] } },
    });
    render(<ZaloSettings />);
    await waitFor(() => expect(screen.getByText('Nick chăm sóc')).toBeInTheDocument());

    const input = document.getElementById('send-limit-7');
    expect(input.value).toBe('');
  });
});
