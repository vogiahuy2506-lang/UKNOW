/**
 * Thẻ "3 bước bắt đầu" (PLAN_ONBOARDING_ZALO_VA_THE_3_BUOC_2026-10-27, Việc 2).
 *
 * Từ điển thật (vi) để thấy đúng câu chữ khách đọc; chỉ giả API + store (id người dùng). Việc "nhân viên không thấy thẻ,
 * không gọi API" nằm ở nơi gắn thẻ — xem pages/__tests__/AiHomePage.gettingStarted.spec.jsx.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../../i18n', async () => (await import('../../../../test/realI18n.js')).realI18nModule());

let mockUser = { id: 7 };
vi.mock('../../../../stores/authStore', () => ({
  useAuthStore: (selector) => selector({ user: mockUser }),
}));

vi.mock('../../services/dashboardApi.service', () => ({
  default: { getGettingStarted: vi.fn() },
}));

const dashboardApiService = (await import('../../services/dashboardApi.service')).default;
const { default: GettingStartedCard } = await import('../GettingStartedCard');

const DONE_KEY = (id) => `fa_getting_started_done:${id}`;
const DISMISSED_KEY = (id) => `fa_getting_started_dismissed:${id}`;

const reply = (flags) => ({
  data: {
    success: true,
    data: { channelConnected: false, hasCustomers: false, hasSentMessage: false, ...flags },
  },
});

const renderCard = () => render(<MemoryRouter><GettingStartedCard /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  mockUser = { id: 7 };
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GettingStartedCard — hiển thị theo tiến độ', () => {
  it('xong 1/3: thấy "1/3", bước 1 có dấu ✓ (không còn là link), bước 2–3 là link đúng đường dẫn', async () => {
    dashboardApiService.getGettingStarted.mockResolvedValue(reply({ channelConnected: true }));
    renderCard();

    const card = await screen.findByTestId('getting-started-card');
    expect(within(card).getByText('Bắt đầu với Founder AI')).toBeInTheDocument();
    expect(screen.getByTestId('getting-started-progress')).toHaveTextContent('1/3');

    const step1 = screen.getByTestId('getting-started-step-1');
    expect(step1).toHaveAttribute('data-done', 'true');
    expect(within(step1).getByText('Đã xong')).toBeInTheDocument();
    expect(within(step1).queryByRole('link')).toBeNull();

    const step2 = screen.getByTestId('getting-started-step-2');
    expect(step2).toHaveAttribute('data-done', 'false');
    expect(within(step2).getByRole('link', { name: /Thêm khách hàng/ })).toHaveAttribute('href', '/app/customers');

    const step3 = screen.getByTestId('getting-started-step-3');
    expect(within(step3).getByRole('link', { name: /Gửi chiến dịch đầu tiên/ })).toHaveAttribute('href', '/app/campaigns/simple');
  });

  it('chưa xong bước nào: "0/3", bước 1 dẫn thẳng tới thẻ Zalo của Quản lý kênh', async () => {
    dashboardApiService.getGettingStarted.mockResolvedValue(reply({}));
    renderCard();

    await screen.findByTestId('getting-started-card');
    expect(screen.getByTestId('getting-started-progress')).toHaveTextContent('0/3');
    expect(within(screen.getByTestId('getting-started-step-1')).getByRole('link', { name: /Kết nối kênh gửi/ }))
      .toHaveAttribute('href', '/app/settings/channels#zalo');
  });

  it('có bản dịch en cho mọi khoá của thẻ (t() không trả nguyên khoá)', async () => {
    const { makeT } = await import('../../../../test/realI18n.js');
    const tEn = makeT(null, 'en');
    const tVi = makeT(null, 'vi');
    ['title', 'progress', 'step1', 'step2', 'step3', 'done', 'dismiss', 'dismissLabel'].forEach((key) => {
      expect(tVi(`gettingStarted.${key}`)).not.toBe(`gettingStarted.${key}`);
      expect(tEn(`gettingStarted.${key}`)).not.toBe(`gettingStarted.${key}`);
    });
    expect(tEn('gettingStarted.progress', { done: 2, total: 3 })).toBe('2/3 steps');
  });
});

describe('GettingStartedCard — đủ 3/3', () => {
  it('API trả 3/3: không vẽ gì + ghi cờ done; mở lại (mount mới) thì KHÔNG gọi API nữa', async () => {
    dashboardApiService.getGettingStarted.mockResolvedValue(reply({ channelConnected: true, hasCustomers: true, hasSentMessage: true }));
    const first = renderCard();

    await waitFor(() => expect(window.localStorage.getItem(DONE_KEY(7))).toBe('1'));
    expect(screen.queryByTestId('getting-started-card')).toBeNull();
    expect(dashboardApiService.getGettingStarted).toHaveBeenCalledTimes(1);

    first.unmount();
    renderCard();
    await Promise.resolve();
    expect(screen.queryByTestId('getting-started-card')).toBeNull();
    expect(dashboardApiService.getGettingStarted).toHaveBeenCalledTimes(1);
  });

  it('cờ done của NGƯỜI KHÁC trên cùng trình duyệt không che thẻ của người này', async () => {
    window.localStorage.setItem(DONE_KEY(99), '1');
    dashboardApiService.getGettingStarted.mockResolvedValue(reply({ hasCustomers: true }));
    renderCard();

    expect(await screen.findByTestId('getting-started-card')).toBeInTheDocument();
    expect(dashboardApiService.getGettingStarted).toHaveBeenCalledTimes(1);
  });
});

describe('GettingStartedCard — nút Ẩn', () => {
  it('bấm Ẩn: thẻ biến mất + ghi cờ dismissed; mount mới không gọi API', async () => {
    dashboardApiService.getGettingStarted.mockResolvedValue(reply({ channelConnected: true }));
    const user = userEvent.setup();
    const first = renderCard();

    await user.click(await screen.findByRole('button', { name: 'Ẩn thẻ bắt đầu' }));

    expect(screen.queryByTestId('getting-started-card')).toBeNull();
    expect(window.localStorage.getItem(DISMISSED_KEY(7))).toBe('1');
    expect(window.localStorage.getItem(DONE_KEY(7))).toBeNull();

    first.unmount();
    renderCard();
    await Promise.resolve();
    expect(screen.queryByTestId('getting-started-card')).toBeNull();
    expect(dashboardApiService.getGettingStarted).toHaveBeenCalledTimes(1);
  });
});

describe('GettingStartedCard — lỗi / dữ liệu lạ: không vẽ gì, không ném lỗi', () => {
  it('API lỗi (mạng, 403, 404, 500) → không vẽ thẻ', async () => {
    dashboardApiService.getGettingStarted.mockRejectedValue({ response: { status: 500 } });
    renderCard();

    await waitFor(() => expect(dashboardApiService.getGettingStarted).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(screen.queryByTestId('getting-started-card')).toBeNull();
    expect(window.localStorage.getItem(DONE_KEY(7))).toBeNull();
  });

  it.each([
    ['không có thân', undefined],
    ['thiếu một cờ', { data: { data: { channelConnected: true, hasCustomers: false } } }],
    ['cờ không phải boolean', { data: { data: { channelConnected: 'yes', hasCustomers: 1, hasSentMessage: null } } }],
    ['data rỗng', { data: { success: true } }],
  ])('phản hồi %s → không vẽ thẻ và không ghi cờ', async (_name, response) => {
    dashboardApiService.getGettingStarted.mockResolvedValue(response);
    renderCard();

    await waitFor(() => expect(dashboardApiService.getGettingStarted).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(screen.queryByTestId('getting-started-card')).toBeNull();
    expect(window.localStorage.getItem(DONE_KEY(7))).toBeNull();
  });

  it('đang chờ API → chưa vẽ gì', () => {
    dashboardApiService.getGettingStarted.mockReturnValue(new Promise(() => {}));
    renderCard();

    expect(screen.queryByTestId('getting-started-card')).toBeNull();
  });

  it('chưa biết người dùng (store chưa nạp) → không gọi API, không vẽ', () => {
    mockUser = null;
    renderCard();

    expect(dashboardApiService.getGettingStarted).not.toHaveBeenCalled();
    expect(screen.queryByTestId('getting-started-card')).toBeNull();
  });
});

describe('GettingStartedCard — localStorage hỏng (chế độ riêng tư / chặn dữ liệu trang)', () => {
  it('đọc cờ ném lỗi = coi như chưa có cờ: vẫn gọi API và vẽ thẻ', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    dashboardApiService.getGettingStarted.mockResolvedValue(reply({ channelConnected: true }));
    renderCard();

    expect(await screen.findByTestId('getting-started-card')).toBeInTheDocument();
    expect(dashboardApiService.getGettingStarted).toHaveBeenCalledTimes(1);
  });

  it('ghi cờ ném lỗi: bấm Ẩn vẫn ẩn thẻ trong phiên này, không hỏng trang', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    dashboardApiService.getGettingStarted.mockResolvedValue(reply({ channelConnected: true }));
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Ẩn thẻ bắt đầu' }));

    expect(screen.queryByTestId('getting-started-card')).toBeNull();
  });

  it('ghi cờ done ném lỗi: 3/3 vẫn không vẽ thẻ, không ném lỗi', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    dashboardApiService.getGettingStarted.mockResolvedValue(reply({ channelConnected: true, hasCustomers: true, hasSentMessage: true }));
    renderCard();

    await waitFor(() => expect(dashboardApiService.getGettingStarted).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(screen.queryByTestId('getting-started-card')).toBeNull();
  });
});
