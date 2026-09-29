// P6 (PLAN_TG_WA_DAY_DU): bán lẻ slot tài khoản Telegram/WhatsApp. Dùng I18nProvider THẬT (không mock '../../i18n')
// để bắt cả khoá dịch thiếu (t() thiếu khoá trả nguyên khoá thô).
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import TopupPage from './TopupPage';

vi.mock('react-router-dom', () => ({
  Link: ({ children }) => <span>{children}</span>,
  useNavigate: () => vi.fn(),
}));
vi.mock('../../stores/authStore', () => ({
  useAuthStore: (selector) => selector({ user: { email: 'topup-test@example.invalid' } }),
}));
vi.mock('../../services/topup.service', () => ({
  getTopupConfig: async () => ({
    data: {
      result: {
        items: [
          { itemKey: 'zalo_accounts', unitPrice: 50000, minQty: 1, stepQty: 1, maxQty: 50, sortOrder: 40 },
          { itemKey: 'telegram_accounts', unitPrice: 50000, minQty: 1, stepQty: 1, maxQty: 50, sortOrder: 41 },
          { itemKey: 'whatsapp_accounts', unitPrice: 50000, minQty: 1, stepQty: 1, maxQty: 50, sortOrder: 42 },
        ],
        // Gói không giới hạn WhatsApp -> không bán slot WhatsApp.
        unlimitedItemKeys: ['whatsapp_accounts'],
        allowedMonths: [1],
        maxMonths: 3,
        subscription: {},
      },
    },
  }),
  quoteTopup: vi.fn(),
  createTopupPayment: vi.fn(),
}));

describe('TopupPage — slot tài khoản Telegram/WhatsApp', () => {
  it('hiện món Telegram với nhãn tiếng Việt thật; ẩn món WhatsApp khi gói không giới hạn', async () => {
    render(
      <I18nProvider>
        <TopupPage />
      </I18nProvider>,
    );

    await waitFor(() => expect(screen.getAllByText('Tài khoản Telegram').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Tài khoản Zalo').length).toBeGreaterThan(0);
    expect(screen.queryByText('Tài khoản WhatsApp')).not.toBeInTheDocument();
    expect(screen.queryByText('topup.items.telegramAccounts')).not.toBeInTheDocument();
  });
});
