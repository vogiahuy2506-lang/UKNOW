/**
 * Màn Zalo lần đầu (PLAN_ONBOARDING_ZALO_VA_THE_3_BUOC_2026-10-27, Việc 1) — chưa có nick nào thì hiện 4 dòng hướng dẫn
 * và nút THẬT "Thêm tài khoản Zalo đầu tiên" (bài hướng dẫn `zalo-account` đã tả nút này từ trước, code chỉ có chữ).
 * Nút đó phải đi vào ĐÚNG luồng cũ: cùng `handleConnectByQr` với nút "Tạo QR đăng nhập" ở thẻ trên (gọi `createLoginQr`).
 * Dùng từ điển thật để thấy đúng câu chữ khách đọc và bắt khoá thiếu bản dịch (`t()` trả nguyên khoá khi thiếu).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import toast from 'react-hot-toast';
import ZaloSettings from '../ZaloSettings';
import zaloSettingsApiService from '../../../features/settings/services/zaloSettingsApi.service';
import { makeT } from '../../../test/realI18n';

vi.mock('../../../stores/authStore', () => ({
  useAuthStore: () => ({ user: { id: 1, name: 'Admin', role: 'owner' } }),
}));

vi.mock('../../../i18n', async () => (await import('../../../test/realI18n.js')).realI18nModule());

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

const STEP_KEYS = ['firstConnectStep1', 'firstConnectStep2', 'firstConnectStep3', 'firstConnectStep4'];
const tVi = makeT('zaloSettings', 'vi');
const tEn = makeT('zaloSettings', 'en');

beforeEach(() => {
  vi.clearAllMocks();
  zaloSettingsApiService.listAccounts.mockResolvedValue({ data: { data: { items: [] } } });
});

const renderEmpty = async (props = {}) => {
  render(<ZaloSettings {...props} />);
  await waitFor(() => expect(zaloSettingsApiService.listAccounts).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByText('Chưa có tài khoản nào')).toBeInTheDocument());
};

describe('ZaloSettings — lần đầu kết nối Zalo (chưa có tài khoản)', () => {
  it('không readOnly: thấy tiêu đề, đủ 4 dòng hướng dẫn và nút "Thêm tài khoản Zalo đầu tiên"', async () => {
    await renderEmpty();

    const block = screen.getByTestId('zalo-first-connect');
    expect(within(block).getByText('Chưa có tài khoản nào')).toBeInTheDocument();
    const items = within(block).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    STEP_KEYS.forEach((key, index) => {
      expect(items[index]).toHaveTextContent(tVi(key));
    });
    expect(items[0]).toHaveTextContent('Cầm sẵn điện thoại có app Zalo');
    expect(items[3]).toHaveTextContent('Cần kết nối lại');
    expect(within(block).getByRole('button', { name: 'Thêm tài khoản Zalo đầu tiên' })).toBeEnabled();
  });

  it('bấm nút gọi createLoginQr đúng một lần — cùng luồng với nút "Tạo QR đăng nhập" ở thẻ trên', async () => {
    zaloSettingsApiService.createLoginQr.mockRejectedValue({ response: { data: { message: 'loi-qr' } } });
    await renderEmpty();

    fireEvent.click(screen.getByRole('button', { name: 'Thêm tài khoản Zalo đầu tiên' }));

    await waitFor(() => expect(zaloSettingsApiService.createLoginQr).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('loi-qr'));

    // Nút ở thẻ trên vẫn nguyên và đi về cùng một API.
    fireEvent.click(screen.getByRole('button', { name: 'Tạo QR đăng nhập' }));
    await waitFor(() => expect(zaloSettingsApiService.createLoginQr).toHaveBeenCalledTimes(2));
  });

  it('đang tạo QR thì nút mới bị khoá và đổi nhãn (không bấm đúp)', async () => {
    zaloSettingsApiService.createLoginQr.mockReturnValue(new Promise(() => {}));
    await renderEmpty();

    fireEvent.click(screen.getByRole('button', { name: 'Thêm tài khoản Zalo đầu tiên' }));

    await waitFor(() => {
      const busy = within(screen.getByTestId('zalo-first-connect')).getByRole('button', { name: 'Đang tạo QR...' });
      expect(busy).toBeDisabled();
    });
    expect(screen.queryByRole('button', { name: 'Thêm tài khoản Zalo đầu tiên' })).toBeNull();
    expect(zaloSettingsApiService.createLoginQr).toHaveBeenCalledTimes(1);
  });

  it('readOnly (gói không có kênh Zalo): giữ nguyên như cũ — chỉ tiêu đề, KHÔNG hướng dẫn, KHÔNG nút', async () => {
    await renderEmpty({ readOnly: true });

    expect(screen.queryByTestId('zalo-first-connect')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thêm tài khoản Zalo đầu tiên' })).toBeNull();
    expect(screen.queryByRole('listitem')).toBeNull();
    expect(screen.getByText('Chưa có tài khoản nào')).toBeInTheDocument();
  });

  it('đã có tài khoản: không hiện khối hướng dẫn lần đầu', async () => {
    zaloSettingsApiService.listAccounts.mockResolvedValue({
      data: { data: { items: [{ id: 5, displayName: 'Nick A', status: 'connected', isActive: true }] } },
    });
    render(<ZaloSettings />);
    await waitFor(() => expect(screen.getByText('Nick A')).toBeInTheDocument());

    expect(screen.queryByTestId('zalo-first-connect')).toBeNull();
    expect(screen.queryByText('Chưa có tài khoản nào')).toBeNull();
  });

  it('có bản dịch vi và en cho cả 4 dòng + nhãn nút (t() không trả nguyên khoá)', () => {
    [...STEP_KEYS, 'addFirstAccount', 'noAccounts'].forEach((key) => {
      expect(tVi(key)).not.toBe(`zaloSettings.${key}`);
      expect(tEn(key)).not.toBe(`zaloSettings.${key}`);
      expect(tEn(key).length).toBeGreaterThan(0);
    });
    // Dòng cuối nhắc đúng nhãn trạng thái đang hiện trên thẻ tài khoản ở từng ngôn ngữ.
    expect(tVi('firstConnectStep4')).toContain(tVi('needsReauth'));
    expect(tEn('firstConnectStep4')).toContain(tEn('needsReauth'));
  });
});
