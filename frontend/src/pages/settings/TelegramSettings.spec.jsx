import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock chatbotApi BEFORE importing the component so the dynamic
// shape change can be exercised without booting axios + the gateway.
const listTelegramAccountsMock = vi.fn();
const getPersonalAccountsHealthMock = vi.fn();
const getTelegramAccountStatusMock = vi.fn();

vi.mock('../../features/chatbot/services/chatbotApi.service', () => ({
  default: {
    listTelegramAccounts: (...args) => listTelegramAccountsMock(...args),
    getPersonalAccountsHealth: (...args) => getPersonalAccountsHealthMock(...args),
    getTelegramAccountStatus: (...args) => getTelegramAccountStatusMock(...args),
    // Stubs for handlers we don't exercise here.
    initTelegramLogin: vi.fn(),
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
    <MemoryRouter>
      <TelegramSettings />
    </MemoryRouter>
  );
};

describe('TelegramSettings — defensive rendering', () => {
  beforeEach(() => {
    listTelegramAccountsMock.mockReset();
    getPersonalAccountsHealthMock.mockReset();
    getTelegramAccountStatusMock.mockReset();
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
});
