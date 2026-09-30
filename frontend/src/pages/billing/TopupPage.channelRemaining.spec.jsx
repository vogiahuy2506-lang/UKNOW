// P11 (PLAN_TG_WA_DAY_DU mục 18.3): món tin lẻ Telegram/WhatsApp hiện dòng "còn mua được" theo năng lực tài khoản của CHÍNH kênh đó.
// Dùng I18nProvider THẬT để bắt khoá dịch thiếu (t() thiếu khoá trả nguyên khoá thô).
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
          { itemKey: 'zalo_messages', unitPrice: 100, minQty: 50, stepQty: 50, maxQty: null, sortOrder: 10 },
          { itemKey: 'telegram_messages', unitPrice: 100, minQty: 50, stepQty: 50, maxQty: null, sortOrder: 11 },
          { itemKey: 'whatsapp_messages', unitPrice: 100, minQty: 50, stepQty: 50, maxQty: null, sortOrder: 12 },
        ],
        unlimitedItemKeys: [],
        zaloCapacity: { remaining: 8000 },
        telegramCapacity: { remaining: 24000 },
        whatsappCapacity: { remaining: 12345 },
        allowedMonths: [1],
        maxMonths: 3,
        subscription: {},
      },
    },
  }),
  quoteTopup: vi.fn(),
  createTopupPayment: vi.fn(),
}));

describe('TopupPage — còn mua được theo năng lực tài khoản từng kênh', () => {
  it('mỗi món tin hiện số còn lại của đúng kênh (không dùng số Zalo cho Telegram/WhatsApp)', async () => {
    render(
      <I18nProvider>
        <TopupPage />
      </I18nProvider>,
    );

    await waitFor(() => expect(screen.getByText(/24\.000 tin Telegram/)).toBeInTheDocument());
    expect(screen.getByText(/12\.345 tin WhatsApp/)).toBeInTheDocument();
    expect(screen.getByText(/Còn mua được tối đa 8\.000 tin theo năng lực tài khoản đã kết nối/)).toBeInTheDocument();
    expect(screen.queryByText('topup.telegramRemaining')).not.toBeInTheDocument();
    expect(screen.queryByText('topup.whatsappRemaining')).not.toBeInTheDocument();
  });
});
