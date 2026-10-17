/**
 * PLAN_ZALO_TU_DONG_DONG_Y_KET_BAN_2026-10-17 Việc 8 — công tắc "Tự động đồng ý lời mời kết bạn" trên từng nick Zalo cá nhân.
 * Yêu cầu:
 * - Hiện đúng trạng thái hiện tại từ backend (autoAcceptFriendRequests) và dòng gợi ý trần/giờ yên lặng.
 * - Bấm công tắc là LƯU NGAY (không có nút Lưu): gọi updateAutoAcceptFriends(accountId, !hiện tại) với boolean tường minh,
 *   rồi tải lại danh sách (fetchAccounts), toast thành công.
 * - Khoá công tắc trong lúc đang lưu (không gửi hai lần), lỗi từ server hiện nguyên thông báo, không tải lại danh sách.
 * - Chế độ chỉ xem (gói không có kênh Zalo): công tắc bị khoá, bấm không gọi API.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
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
    updateSendSpeed: vi.fn(),
    updateAutoAcceptFriends: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const makeAccount = (over = {}) => ({
  id: 7,
  displayName: 'Nick bán hàng',
  status: 'connected',
  isActive: true,
  zaloPhone: '0901234567',
  sendSpeed: 'safe',
  autoAcceptFriendRequests: false,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

const renderWithAccount = async (acc, props = {}) => {
  zaloSettingsApiService.listAccounts.mockResolvedValue({
    data: { data: { items: [acc] } },
  });
  render(<ZaloSettings {...props} />);
  await waitFor(() => expect(screen.getByText('Nick bán hàng')).toBeInTheDocument());
};

const getSwitch = () => screen.getByRole('switch', { name: 'zaloSettings.autoAcceptFriends' });

describe('ZaloSettings — Tự động đồng ý lời mời kết bạn', () => {
  it('nick chưa bật -> công tắc tắt (aria-checked=false), hiện dòng gợi ý, không có nút Lưu riêng', async () => {
    await renderWithAccount(makeAccount({ autoAcceptFriendRequests: false }));

    expect(getSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('zaloSettings.autoAcceptFriendsHint')).toBeInTheDocument();
    // Chỉ có 2 nút Lưu (giới hạn gửi/ngày + tốc độ gửi): công tắc lưu ngay nên không thêm nút Lưu.
    expect(screen.getAllByText('common.save')).toHaveLength(2);
  });

  it('nick đã bật -> công tắc bật (aria-checked=true)', async () => {
    await renderWithAccount(makeAccount({ autoAcceptFriendRequests: true }));

    expect(getSwitch()).toHaveAttribute('aria-checked', 'true');
  });

  it('thiếu trường từ backend cũ -> coi là tắt', async () => {
    const acc = makeAccount();
    delete acc.autoAcceptFriendRequests;
    await renderWithAccount(acc);

    expect(getSwitch()).toHaveAttribute('aria-checked', 'false');
  });

  it('bấm công tắc đang tắt -> gọi updateAutoAcceptFriends(id, true), tải lại danh sách, toast thành công', async () => {
    zaloSettingsApiService.updateAutoAcceptFriends.mockResolvedValueOnce({ data: { success: true } });
    await renderWithAccount(makeAccount({ autoAcceptFriendRequests: false }));
    expect(zaloSettingsApiService.listAccounts).toHaveBeenCalledTimes(1);

    // Sau khi lưu, danh sách tải lại trả về trạng thái mới.
    zaloSettingsApiService.listAccounts.mockResolvedValue({
      data: { data: { items: [makeAccount({ autoAcceptFriendRequests: true })] } },
    });
    fireEvent.click(getSwitch());

    await waitFor(() => {
      expect(zaloSettingsApiService.updateAutoAcceptFriends).toHaveBeenCalledWith('7', true);
    });
    await waitFor(() => expect(zaloSettingsApiService.listAccounts).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(getSwitch()).toHaveAttribute('aria-checked', 'true'));
    expect(toast.success).toHaveBeenCalledWith('zaloSettings.autoAcceptFriendsEnabledSuccess');
  });

  it('bấm công tắc đang bật -> gọi updateAutoAcceptFriends(id, false) với boolean false tường minh', async () => {
    zaloSettingsApiService.updateAutoAcceptFriends.mockResolvedValueOnce({ data: { success: true } });
    await renderWithAccount(makeAccount({ autoAcceptFriendRequests: true }));

    fireEvent.click(getSwitch());

    await waitFor(() => {
      expect(zaloSettingsApiService.updateAutoAcceptFriends).toHaveBeenCalledWith('7', false);
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('zaloSettings.autoAcceptFriendsDisabledSuccess');
    });
  });

  it('đang lưu -> công tắc bị khoá, bấm lần nữa không gọi API thêm; lưu xong mở khoá', async () => {
    let finishSave;
    zaloSettingsApiService.updateAutoAcceptFriends.mockImplementationOnce(
      () => new Promise((resolve) => { finishSave = resolve; })
    );
    await renderWithAccount(makeAccount({ autoAcceptFriendRequests: false }));

    fireEvent.click(getSwitch());
    await waitFor(() => expect(getSwitch()).toBeDisabled());
    fireEvent.click(getSwitch());
    expect(zaloSettingsApiService.updateAutoAcceptFriends).toHaveBeenCalledTimes(1);

    finishSave({ data: { success: true } });
    await waitFor(() => expect(getSwitch()).not.toBeDisabled());
  });

  it('lỗi từ server -> toast.error nguyên thông báo, KHÔNG tải lại danh sách, công tắc mở khoá lại', async () => {
    zaloSettingsApiService.updateAutoAcceptFriends.mockRejectedValueOnce({
      response: { data: { message: 'Tài khoản Zalo này chưa được giao cho bạn.' } },
    });
    await renderWithAccount(makeAccount({ autoAcceptFriendRequests: false }));

    fireEvent.click(getSwitch());

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Tài khoản Zalo này chưa được giao cho bạn.');
    });
    expect(zaloSettingsApiService.listAccounts).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    await waitFor(() => expect(getSwitch()).not.toBeDisabled());
    expect(getSwitch()).toHaveAttribute('aria-checked', 'false');
  });

  it('lỗi không có thông báo từ server -> dùng chữ dự phòng', async () => {
    zaloSettingsApiService.updateAutoAcceptFriends.mockRejectedValueOnce(new Error('Network Error'));
    await renderWithAccount(makeAccount());

    fireEvent.click(getSwitch());

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('zaloSettings.autoAcceptFriendsSaveFailed');
    });
  });

  it('chế độ chỉ xem (gói không có kênh Zalo) -> công tắc bị khoá, bấm không gọi API', async () => {
    await renderWithAccount(makeAccount({ autoAcceptFriendRequests: false }), { readOnly: true });

    expect(getSwitch()).toBeDisabled();
    fireEvent.click(getSwitch());
    expect(zaloSettingsApiService.updateAutoAcceptFriends).not.toHaveBeenCalled();
  });
});
