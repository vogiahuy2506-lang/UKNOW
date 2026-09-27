/**
 * Dải nhắc TRONG APP khi món mua thêm sắp hết hạn (feat/banner-mua-them-sap-het-han, mục 2).
 * Store thật; chỉ mock topup.service (ranh giới API).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../i18n', async () => (await import('../../../test/realI18n.js')).realI18nModule());

const mockGetExpiring = vi.fn();
vi.mock('../../../services/topup.service', () => ({
  getExpiringTopupItems: mockGetExpiring,
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => mockNavigate,
}));

const { useAuthStore } = await import('../../../stores/authStore');
const { default: TopupExpiringBanner } = await import('../TopupExpiringBanner');

const setState = (activeContext = { type: 'self' }) => {
  useAuthStore.setState({ user: { id: 7, username: 'chu' }, isAuthenticated: true, activeContext });
};
const renderBanner = () => render(<MemoryRouter><TopupExpiringBanner /></MemoryRouter>);
const banner = () => screen.queryByTestId('topup-expiring-banner');
const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString();
const expectedDate = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  mockGetExpiring.mockResolvedValue({ data: { success: true, result: { items: [] } } });
});

describe('điều kiện hiện dải', () => {
  it('có món sắp hết hạn → hiện đúng chữ tiếng Việt thật, gọi API trong waitFor', async () => {
    setState();
    mockGetExpiring.mockResolvedValue({
      data: { success: true, result: { items: [{ itemKey: 'employees', qty: 2, cycleEnd: daysFromNow(5) }] } },
    });
    renderBanner();

    await waitFor(() => expect(mockGetExpiring).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId('topup-expiring-banner')).toBeInTheDocument();
    expect(banner()).toHaveTextContent(`2 slot nhân viên sẽ hết hạn ngày ${expectedDate(5)}`);
    expect(screen.getByRole('button', { name: 'Gia hạn' })).toBeInTheDocument();
  });

  it('nhiều món → nối bằng dấu phẩy, ngày lấy mốc SỚM NHẤT (món đầu tiên trong danh sách backend trả)', async () => {
    setState();
    mockGetExpiring.mockResolvedValue({
      data: {
        success: true,
        result: {
          items: [
            { itemKey: 'employees', qty: 2, cycleEnd: daysFromNow(3) },
            { itemKey: 'storage_gb', qty: 5, cycleEnd: daysFromNow(6) },
          ],
        },
      },
    });
    renderBanner();

    expect(await screen.findByTestId('topup-expiring-banner')).toBeInTheDocument();
    expect(banner()).toHaveTextContent(`2 slot nhân viên, 5 GB dung lượng lưu trữ sẽ hết hạn ngày ${expectedDate(3)}`);
  });

  it('danh sách rỗng → KHÔNG hiện', async () => {
    setState();
    renderBanner();
    await waitFor(() => expect(mockGetExpiring).toHaveBeenCalledTimes(1));
    expect(banner()).not.toBeInTheDocument();
  });

  it('nhân viên (activeContext employee) → KHÔNG hiện và KHÔNG gọi API', async () => {
    setState({ type: 'employee', ownerId: 10, permissions: {} });
    mockGetExpiring.mockResolvedValue({
      data: { success: true, result: { items: [{ itemKey: 'employees', qty: 1, cycleEnd: daysFromNow(2) }] } },
    });
    renderBanner();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockGetExpiring).not.toHaveBeenCalled();
    expect(banner()).not.toBeInTheDocument();
  });

  it('API lỗi → không sập trang, dải không hiện', async () => {
    setState();
    mockGetExpiring.mockRejectedValue(new Error('network'));
    renderBanner();
    await waitFor(() => expect(mockGetExpiring).toHaveBeenCalledTimes(1));
    expect(banner()).not.toBeInTheDocument();
  });
});

describe('tắt dải', () => {
  it('bấm tắt → ẩn ngay, nhớ theo ngày hôm nay (localStorage)', async () => {
    setState();
    mockGetExpiring.mockResolvedValue({
      data: { success: true, result: { items: [{ itemKey: 'chatbots', qty: 1, cycleEnd: daysFromNow(4) }] } },
    });
    const user = userEvent.setup();
    renderBanner();
    await screen.findByTestId('topup-expiring-banner');

    await user.click(screen.getByRole('button', { name: 'Đóng thông báo' }));

    expect(banner()).not.toBeInTheDocument();
    const todayKey = new Date().toISOString().slice(0, 10);
    expect(window.localStorage.getItem(`founder_ai_topup_expiring_dismissed:${todayKey}`)).toBe('1');
  });

  it('đã tắt hôm nay từ trước → vào lại KHÔNG hiện (dù vẫn gọi API để giữ đơn giản)', async () => {
    const todayKey = new Date().toISOString().slice(0, 10);
    window.localStorage.setItem(`founder_ai_topup_expiring_dismissed:${todayKey}`, '1');
    setState();
    mockGetExpiring.mockResolvedValue({
      data: { success: true, result: { items: [{ itemKey: 'chatbots', qty: 1, cycleEnd: daysFromNow(4) }] } },
    });
    renderBanner();

    await waitFor(() => expect(mockGetExpiring).toHaveBeenCalledTimes(1));
    expect(banner()).not.toBeInTheDocument();
  });

  it('khoá tắt của HÔM QUA không ảnh hưởng hôm nay → vẫn hiện lại', async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    window.localStorage.setItem(`founder_ai_topup_expiring_dismissed:${yesterday}`, '1');
    setState();
    mockGetExpiring.mockResolvedValue({
      data: { success: true, result: { items: [{ itemKey: 'chatbots', qty: 1, cycleEnd: daysFromNow(4) }] } },
    });
    renderBanner();

    expect(await screen.findByTestId('topup-expiring-banner')).toBeInTheDocument();
  });

  it('localStorage ném lỗi (đọc lẫn ghi) → dải vẫn hiện, bấm tắt không làm sập trang', async () => {
    setState();
    mockGetExpiring.mockResolvedValue({
      data: { success: true, result: { items: [{ itemKey: 'chatbots', qty: 1, cycleEnd: daysFromNow(4) }] } },
    });
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const user = userEvent.setup();
    try {
      renderBanner();
      expect(await screen.findByTestId('topup-expiring-banner')).toBeInTheDocument();
      await expect(user.click(screen.getByRole('button', { name: 'Đóng thông báo' }))).resolves.not.toThrow();
    } finally {
      getSpy.mockRestore();
      setSpy.mockRestore();
    }
  });
});

describe('nút Gia hạn', () => {
  it('bấm Gia hạn → điều hướng /app/topup', async () => {
    setState();
    mockGetExpiring.mockResolvedValue({
      data: { success: true, result: { items: [{ itemKey: 'employees', qty: 1, cycleEnd: daysFromNow(2) }] } },
    });
    const user = userEvent.setup();
    renderBanner();
    await screen.findByTestId('topup-expiring-banner');

    await user.click(screen.getByRole('button', { name: 'Gia hạn' }));

    expect(mockNavigate).toHaveBeenCalledWith('/app/topup');
  });
});
