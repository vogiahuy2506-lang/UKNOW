/**
 * TiktokBusinessSettings.spec.jsx
 *
 * Test cho component TikTok tab ở ChannelSettings. Pattern copy từ
 * `TelegramSettings.spec.jsx` (vitest + @testing-library/react + I18nProvider).
 *
 * Coverage:
 * - Render: loading → empty state → list accounts
 * - 3 bẫy OAuth notice: region (Bẫy 14), personal (Bẫy 16), dm_privacy (Bẫy 15)
 * - Action: refresh + delete (confirm dialog)
 * - AccountStatus pill: 3 trạng thái (connected / expired / expiring)
 * - URL params từ OAuth callback: đọc rồi clear
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../../../i18n';

const listAccountsMock = vi.fn();
const refreshAccountMock = vi.fn();
const deleteAccountMock = vi.fn();

vi.mock('../../../features/settings/services/tiktokBusinessApi.service', () => ({
  default: {
    listAccounts: (...args) => listAccountsMock(...args),
    refreshAccount: (...args) => refreshAccountMock(...args),
    deleteAccount: (...args) => deleteAccountMock(...args),
    testSend: vi.fn(),
    // `startConnect` mới thay thế `getConnectUrl` cũ (BE đổi từ
    // `res.redirect()` sang `res.json({ auth_url })` để gắn được Bearer token
    // qua axios interceptor — xem commit fix).
    startConnect: vi.fn(),
  },
}));

const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

const importComponent = () =>
  import('../TiktokBusinessSettings.jsx').then((m) => m.default);

const renderSettings = async () => {
  const TiktokBusinessSettings = await importComponent();
  return render(
    <I18nProvider>
      <MemoryRouter>
        <TiktokBusinessSettings />
      </MemoryRouter>
    </I18nProvider>
  );
};

const fakeAccount = (overrides = {}) => ({
  id: 1,
  business_id: 'biz_abc',
  display_name: 'My TikTok Shop',
  region: 'APAC',
  role: 'business_account',
  is_active: true,
  has_access_token: true,
  has_refresh_token: true,
  access_token_expires_at: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(), // 5 ngày
  ...overrides,
});

describe('TiktokBusinessSettings — render', () => {
  beforeEach(() => {
    listAccountsMock.mockReset();
    refreshAccountMock.mockReset();
    deleteAccountMock.mockReset();
    // Reset URL params
    window.history.replaceState({}, '', '/');
  });

  it('Loading → empty state khi không có account', async () => {
    listAccountsMock.mockResolvedValueOnce({ data: { data: [] } });
    await renderSettings();
    await waitFor(() => expect(listAccountsMock).toHaveBeenCalled());
    expect(await screen.findByText(/Chưa có tài khoản TikTok Business/)).toBeInTheDocument();
  });

  it('List accounts với status pill + nút action', async () => {
    listAccountsMock.mockResolvedValueOnce({
      data: { data: [fakeAccount(), fakeAccount({ id: 2, business_id: 'biz_def', display_name: 'Shop 2' })] },
    });
    await renderSettings();
    expect(await screen.findByText('My TikTok Shop')).toBeInTheDocument();
    expect(screen.getByText('Shop 2')).toBeInTheDocument();
    // 2 nút "Làm mới" + 2 nút "Ngắt"
    expect(screen.getAllByText(/Làm mới/)).toHaveLength(2);
    expect(screen.getAllByText(/Ngắt/)).toHaveLength(2);
  });

  it('Hiển thị 2 notice thường trực: rate limit + region', async () => {
    listAccountsMock.mockResolvedValueOnce({ data: { data: [] } });
    await renderSettings();
    expect(await screen.findByText(/Giới hạn gửi tự động/)).toBeInTheDocument();
    expect(screen.getByText(/Region hỗ trợ/)).toBeInTheDocument();
  });
});

describe('TiktokBusinessSettings — 3 bẫy OAuth', () => {
  beforeEach(() => {
    listAccountsMock.mockReset().mockResolvedValue({ data: { data: [] } });
  });

  it('Bẫy 14: error=region_unsupported → notice hồng', async () => {
    window.history.replaceState({}, '', '/?error=region_unsupported&reason=EEA');
    await renderSettings();
    expect(await screen.findByText(/Region chưa hỗ trợ/)).toBeInTheDocument();
    // URL params đã clear
    expect(window.location.search).toBe('');
  });

  it('Bẫy 16: error=personal_account → notice hướng dẫn switch', async () => {
    window.history.replaceState({}, '', '/?error=personal_account');
    await renderSettings();
    expect(await screen.findByText(/Cần tài khoản Business/)).toBeInTheDocument();
    expect(screen.getByText(/Switch to Business Account/)).toBeInTheDocument();
  });

  it('Bẫy 15: hint=check_dm_privacy → notice xanh hướng dẫn DM = Everyone', async () => {
    window.history.replaceState({}, '', '/?hint=check_dm_privacy');
    await renderSettings();
    expect(await screen.findByText(/Kiểm tra DM Privacy/)).toBeInTheDocument();
    expect(screen.getByText(/Everyone/)).toBeInTheDocument();
  });

  // BE chỉ gắn được tài khoản vào chatbot khi chủ workspace có chatbot đang bật.
  // Không có → redirect kèm auto_reply=no_chatbot; nếu không cảnh báo, người dùng
  // thấy "đã kết nối" nhưng tin nhắn đến không ai trả lời.
  it('auto_reply=no_chatbot → cảnh báo chưa có chatbot để bot trả lời', async () => {
    window.history.replaceState({}, '', '/?success=connected&auto_reply=no_chatbot');
    await renderSettings();
    expect(await screen.findByText(/chưa có chatbot đang bật/i)).toBeInTheDocument();
    expect(window.location.search).toBe('');
  });

  it('auto_reply=no_chatbot ưu tiên hơn hint DM privacy (thứ chặn bot trả lời)', async () => {
    window.history.replaceState({}, '', '/?hint=check_dm_privacy&auto_reply=no_chatbot');
    await renderSettings();
    expect(await screen.findByText(/chưa có chatbot đang bật/i)).toBeInTheDocument();
    expect(screen.queryByText(/Kiểm tra DM Privacy/)).not.toBeInTheDocument();
  });
});

describe('TiktokBusinessSettings — actions', () => {
  beforeEach(() => {
    listAccountsMock.mockReset().mockResolvedValue({ data: { data: [fakeAccount()] } });
    refreshAccountMock.mockReset();
    deleteAccountMock.mockReset();
    // Confirm dialog OK
    window.confirm = vi.fn(() => true);
  });

  it('Bấm "Làm mới" gọi refreshAccount', async () => {
    refreshAccountMock.mockResolvedValueOnce({ data: { success: true } });
    const user = userEvent.setup();
    await renderSettings();
    const refreshBtn = await screen.findByText('Làm mới');
    await user.click(refreshBtn);
    await waitFor(() => expect(refreshAccountMock).toHaveBeenCalledWith(1));
  });

  it('Bấm "Ngắt" + confirm OK → gọi deleteAccount', async () => {
    deleteAccountMock.mockResolvedValueOnce({ data: { success: true } });
    const user = userEvent.setup();
    await renderSettings();
    const deleteBtn = await screen.findByText('Ngắt');
    await user.click(deleteBtn);
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    await waitFor(() => expect(deleteAccountMock).toHaveBeenCalledWith(1));
  });

  it('Bấm "Ngắt" + confirm cancel → KHÔNG gọi deleteAccount', async () => {
    window.confirm = vi.fn(() => false);
    const user = userEvent.setup();
    await renderSettings();
    const deleteBtn = await screen.findByText('Ngắt');
    await user.click(deleteBtn);
    expect(window.confirm).toHaveBeenCalled();
    expect(deleteAccountMock).not.toHaveBeenCalled();
  });
});

describe('TiktokBusinessSettings — AccountStatus pill', () => {
  let startConnectMock;
  beforeEach(async () => {
    listAccountsMock.mockReset();
    window.history.replaceState({}, '', '/');
    // Reset startConnect (cùng instance vi.fn() từ vi.mock) để tránh
    // pollution giữa 2 test click trong describe này.
    const serviceModule = await import(
      '../../../features/settings/services/tiktokBusinessApi.service'
    );
    startConnectMock = serviceModule.default.startConnect;
    startConnectMock.mockReset();
  });

  it('Token hết hạn (expires_at < now) → pill đỏ "Token hết hạn"', async () => {
    listAccountsMock.mockResolvedValueOnce({
      data: {
        data: [fakeAccount({ access_token_expires_at: new Date(Date.now() - 1000).toISOString() })],
      },
    });
    await renderSettings();
    expect(await screen.findByText('Token hết hạn')).toBeInTheDocument();
  });

  it('Sắp hết hạn (≤ 24h) → pill vàng "Hết hạn trong vài giờ"', async () => {
    listAccountsMock.mockResolvedValueOnce({
      data: {
        data: [fakeAccount({ access_token_expires_at: new Date(Date.now() + 12 * 3600 * 1000).toISOString() })],
      },
    });
    await renderSettings();
    expect(await screen.findByText('Hết hạn trong vài giờ')).toBeInTheDocument();
  });

  it('is_active=false → pill xám "Đã ngắt"', async () => {
    listAccountsMock.mockResolvedValueOnce({
      data: { data: [fakeAccount({ is_active: false })] },
    });
    await renderSettings();
    expect(await screen.findByText('Đã ngắt')).toBeInTheDocument();
  });

  // Sau khi BE controller `connect` đổi từ `res.redirect()` sang trả
  // `{ auth_url }` JSON, FE phải gọi qua axios (để gắn `Authorization: Bearer
  // ...`) rồi TỰ navigate. Test này khóa contract: click nút → gọi
  // `startConnect` → set `window.location.href = auth_url`.
  it('Click "Kết nối" → gọi startConnect, navigate tới auth_url', async () => {
    listAccountsMock.mockResolvedValueOnce({ data: { data: [] } });

    startConnectMock.mockResolvedValueOnce({
      redirectUrl: 'https://www.tiktok.com/v2/auth/authorize/?client_key=abc&state=xyz',
    });

    // Theo dõi window.location.href — happy-dom không tự reload khi gán.
    const originalLocation = window.location;
    const hrefSetter = vi.fn();
    delete window.location;
    window.location = { ...originalLocation, href: '' };
    Object.defineProperty(window.location, 'href', {
      set: hrefSetter,
      get: () => originalLocation.href,
      configurable: true,
    });

    const user = userEvent.setup();
    await renderSettings();
    const connectBtn = await screen.findByRole('button', { name: /Kết nối TikTok Business/i });
    await user.click(connectBtn);

    await waitFor(() => {
      expect(startConnectMock).toHaveBeenCalledTimes(1);
    });
    expect(hrefSetter).toHaveBeenCalledWith(
      'https://www.tiktok.com/v2/auth/authorize/?client_key=abc&state=xyz'
    );

    window.location = originalLocation;
  });

  it('Click "Kết nối" khi BE lỗi 401 → toast "Phiên đã hết hạn", KHÔNG navigate', async () => {
    listAccountsMock.mockResolvedValueOnce({ data: { data: [] } });
    startConnectMock.mockRejectedValueOnce({
      response: { status: 401, data: { message: 'Token hết hạn' } },
    });

    const hrefSetter = vi.fn();
    const originalLocation = window.location;
    delete window.location;
    window.location = { ...originalLocation, href: '' };
    Object.defineProperty(window.location, 'href', {
      set: hrefSetter,
      get: () => originalLocation.href,
      configurable: true,
    });

    const user = userEvent.setup();
    await renderSettings();
    const connectBtn = await screen.findByRole('button', { name: /Kết nối TikTok Business/i });
    await user.click(connectBtn);

    await waitFor(() => {
      expect(startConnectMock).toHaveBeenCalledTimes(1);
    });
    // Đợi setConnecting(false) từ finally để tránh warning "update not wrapped in act"
    // — vitest cảnh báo khi state update xảy ra ngoài act(...) sau khi test xong.
    await waitFor(() => {
      expect(connectBtn).not.toBeDisabled();
    });
    expect(hrefSetter).not.toHaveBeenCalled();

    window.location = originalLocation;
  });
});

afterEach(() => {
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});
