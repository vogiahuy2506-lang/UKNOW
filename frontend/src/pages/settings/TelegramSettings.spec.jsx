import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../../i18n';

// Mock chatbotApi BEFORE importing the component so the dynamic
// shape change can be exercised without booting axios + the gateway.
const listTelegramAccountsMock = vi.fn();
const getPersonalAccountsHealthMock = vi.fn();
const getTelegramAccountStatusMock = vi.fn();
const initTelegramLoginMock = vi.fn();

vi.mock('../../features/chatbot/services/chatbotApi.service', () => ({
  default: {
    listTelegramAccounts: (...args) => listTelegramAccountsMock(...args),
    getPersonalAccountsHealth: (...args) => getPersonalAccountsHealthMock(...args),
    getTelegramAccountStatus: (...args) => getTelegramAccountStatusMock(...args),
    // Stubs for handlers we don't exercise here.
    initTelegramLogin: (...args) => initTelegramLoginMock(...args),
    checkTelegramLoginStatus: vi.fn(),
    cancelTelegramLogin: vi.fn(),
    deleteTelegramAccount: vi.fn(),
    logoutTelegramAccount: vi.fn(),
  },
}));

// Suppress noisy "Cannot log after tests are done" warnings emitted by
// background axios requests that get aborted during cleanup.
const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

// Lazy import AFTER mocks are installed.
const importComponent = () =>
  import('./TelegramSettings.jsx').then((m) => m.default);

const renderTelegramSettings = async () => {
  const TelegramSettings = await importComponent();
  return render(
    <I18nProvider>
      <MemoryRouter>
        <TelegramSettings />
      </MemoryRouter>
    </I18nProvider>
  );
};

describe('TelegramSettings — defensive rendering', () => {
  beforeEach(() => {
    listTelegramAccountsMock.mockReset();
    getPersonalAccountsHealthMock.mockReset();
    getTelegramAccountStatusMock.mockReset();
    initTelegramLoginMock.mockReset();
    warnSpy.mockClear();
    errorSpy.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing when listTelegramAccounts returns a non-array payload', async () => {
    // Simulate the production regression 13/09 — backend (or chatbotApi
    // envelope wrapper) returns an object where the component expects
    // an array. The page used to crash with
    //   TypeError: e.filter is not a function
    // because the `accounts` state ended up holding the object and the
    // top-level `accounts.filter(...)` ran on every render.
    listTelegramAccountsMock.mockResolvedValueOnce({
      data: { data: { total: 0, items: [] } },
    });
    // Gateway status can be any shape; we just need a successful reply
    // so the effect does not retry.
    getPersonalAccountsHealthMock.mockResolvedValueOnce({
      data: { data: { channels: { telegram: null }, allHealthy: false } },
    });

    await renderTelegramSettings();

    // Page must not throw. The "empty state" copy is the signal that
    // the defensive guard worked — safeAccounts fell back to [].
    await waitFor(() => {
      expect(screen.queryByText(/chưa có tài khoản telegram nào/i)).toBeTruthy();
    });
  });

  it('still renders normally when the backend returns a real array', async () => {
    listTelegramAccountsMock.mockResolvedValueOnce({
      data: {
        data: [
          {
            id: 1,
            telegram_user_id: '123',
            first_name: 'Alice',
            is_active: true,
            is_loaded: true,
          },
        ],
      },
    });
    getPersonalAccountsHealthMock.mockResolvedValueOnce({
      data: { data: { channels: { telegram: null }, allHealthy: true } },
    });

    await renderTelegramSettings();

    // Redesigned: pill text changed from "1/1 đang hoạt động" to
    // "<count> đang hoạt động" (badge trên header, không còn inline
    // total/total). Backend behaviour vẫn giữ nguyên.
    await waitFor(() => {
      expect(screen.queryByText(/1 đang hoạt động/i)).toBeTruthy();
    });
  });

  // Hồi quy PR-3 (21/09/2026): api.js thôi khử trùng request có `signal` của người gọi, nên lượt
  // init trước KHÔNG còn bị huỷ hộ nữa. Nút "Tạo QR mới" trong modal không khoá theo `connecting`,
  // mà init mất 20–40s ở cold path → bấm lại là mở thêm một phiên Telegram ở server trong khi UI
  // chỉ giữ sessionId về sau cùng. handleStartQrLogin phải tự huỷ lượt cũ.
  it('bấm "Tạo QR mới" khi lượt init trước còn đang bay thì huỷ lượt cũ, không để hai phiên cùng mở', async () => {
    listTelegramAccountsMock.mockResolvedValue({ data: { data: [] } });
    getPersonalAccountsHealthMock.mockResolvedValue({
      data: { data: { channels: { telegram: null }, allHealthy: false, canStartLogin: true } },
    });

    const signals = [];
    initTelegramLoginMock.mockImplementation(({ signal }) => {
      signals.push(signal);
      return new Promise(() => {}); // treo mãi — mô phỏng cold path 20–40s
    });

    await renderTelegramSettings();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /quét qr/i }));
    await waitFor(() => expect(signals).toHaveLength(1));
    expect(signals[0].aborted).toBe(false);

    await user.click(await screen.findByRole('button', { name: /tạo qr mới/i }));
    await waitFor(() => expect(signals).toHaveLength(2));

    expect(signals[0].aborted).toBe(true);   // lượt cũ đã bị huỷ
    expect(signals[1].aborted).toBe(false);  // lượt mới còn sống
  });
});
