/**
 * Tests cho tính năng người dùng tự chọn tốc độ gửi Zalo cá nhân (2 mức: safe, fast; mức very_fast
 * "Rất nhanh" 30–60 giây đã bỏ 20/10/2026).
 * Yêu cầu:
 * - Hiện đúng mức hiện tại.
 * - Ô chọn chỉ có 2 lựa chọn (safe, fast), không còn very_fast.
 * - Bấm Lưu → gọi updateSendSpeed(accountId, sendSpeed) với TÊN mức.
 * - Nick đang ở custom (gồm cặp 30–60s cũ còn sót) → hiện dòng chỉ đọc "Tuỳ chỉnh (do quản trị đặt)", vẫn cho chọn lại 1 trong 2 mức.
 * - Hiện dòng nhỏ "Áp dụng cho các lượt gửi tiếp theo."
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
    updateSendSpeed: vi.fn(),
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
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

const renderWithAccount = async (acc) => {
  zaloSettingsApiService.listAccounts.mockResolvedValue({
    data: { data: { items: [acc] } },
  });
  render(<ZaloSettings />);
  await waitFor(() => expect(screen.getByText('Nick bán hàng')).toBeInTheDocument());
};

describe('ZaloSettings — Tốc độ gửi Zalo cá nhân (PR-2)', () => {
  it('tài khoản ở mức safe → select hiện safe, không có cảnh báo', async () => {
    await renderWithAccount(makeAccount({ sendSpeed: 'safe' }));

    const select = screen.getByLabelText('zaloSettings.sendSpeed:');
    expect(select.value).toBe('safe');
    expect(screen.queryByText('zaloSettings.sendSpeedFastWarning')).not.toBeInTheDocument();
    expect(screen.getByText('zaloSettings.sendSpeedAppliedNextRunHint')).toBeInTheDocument();
  });

  it('tài khoản ở mức fast → select hiện fast, hiện cảnh báo vàng', async () => {
    await renderWithAccount(makeAccount({ sendSpeed: 'fast' }));

    const select = screen.getByLabelText('zaloSettings.sendSpeed:');
    expect(select.value).toBe('fast');
    expect(screen.getByText('zaloSettings.sendSpeedFastWarning')).toBeInTheDocument();
  });

  it('ô Tốc độ gửi chỉ có đúng 2 lựa chọn safe và fast, không còn very_fast', async () => {
    await renderWithAccount(makeAccount({ sendSpeed: 'safe' }));

    const select = screen.getByLabelText('zaloSettings.sendSpeed:');
    const values = Array.from(select.querySelectorAll('option')).map((o) => o.value);
    expect(values).toEqual(['safe', 'fast']);
    expect(screen.queryByText('zaloSettings.sendSpeedVeryFast')).not.toBeInTheDocument();
  });

  it('chọn fast rồi bấm Lưu → gọi updateSendSpeed với TÊN mức fast', async () => {
    zaloSettingsApiService.updateSendSpeed.mockResolvedValueOnce({ data: { success: true } });
    await renderWithAccount(makeAccount({ sendSpeed: 'safe' }));

    const select = screen.getByLabelText('zaloSettings.sendSpeed:');
    fireEvent.change(select, { target: { value: 'fast' } });

    // Tìm nút Lưu tương ứng với sendSpeed
    const saveButtons = screen.getAllByText('common.save');
    // Nút Lưu thứ 2 là của sendSpeed (nút 1 là của sendLimit)
    const saveSpeedBtn = saveButtons[saveButtons.length - 1];
    fireEvent.click(saveSpeedBtn);

    await waitFor(() => {
      expect(zaloSettingsApiService.updateSendSpeed).toHaveBeenCalledWith('7', 'fast');
    });
  });

  it('nick ở mức custom → hiện dòng chỉ đọc "Tuỳ chỉnh (do quản trị đặt)", vẫn cho chọn lại 1 trong 2 mức', async () => {
    await renderWithAccount(makeAccount({ sendSpeed: 'custom' }));

    // Hiện text chỉ đọc "Tuỳ chỉnh (do quản trị đặt)" — ghim riêng dòng <p>, vì <option> custom
    // cũng mang đúng chữ này nên đếm getAllByText >= 1 vẫn xanh khi dòng chỉ đọc bị xoá.
    const customElements = screen.getAllByText('zaloSettings.sendSpeedCustom');
    expect(customElements.map((el) => el.tagName)).toEqual(expect.arrayContaining(['OPTION', 'P']));

    const select = screen.getByLabelText('zaloSettings.sendSpeed:');
    expect(select.value).toBe('custom');

    // Nút Lưu bị disabled khi chưa chọn mức chuẩn
    const saveButtons = screen.getAllByText('common.save');
    const saveSpeedBtn = saveButtons[saveButtons.length - 1];
    expect(saveSpeedBtn).toBeDisabled();

    // Vẫn cho chọn lại 1 trong 2 mức (vd chọn fast)
    fireEvent.change(select, { target: { value: 'fast' } });
    expect(select.value).toBe('fast');
    expect(saveSpeedBtn).not.toBeDisabled();
    // Đã chọn mức chuẩn: option custom biến mất, dòng chỉ đọc vẫn nói mức đang chạy thật.
    expect(screen.getByText('zaloSettings.sendSpeedCustom').tagName).toBe('P');
  });
});
