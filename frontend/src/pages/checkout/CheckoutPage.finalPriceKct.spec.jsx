// Commit mới (28/09/2026): giá ghi rõ dịch vụ không chịu thuế GTGT (KCT), không cộng thêm VAT (bỏ câu "đã bao gồm 10% VAT" 29/09/2026).
// Dòng nhỏ "Giá cuối cùng — dịch vụ không chịu thuế GTGT (KCT), không cộng thêm VAT" phải hiện đúng chữ TIẾNG VIỆT thật,
// không phải khoá thô (t() thiếu khoá trả nguyên khoá — dùng I18nProvider THẬT,
// không mock '../../i18n' như spec khác trong cùng thư mục).
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import CheckoutPage from './CheckoutPage';

const m = vi.hoisted(() => ({
  navigate: vi.fn(),
  user: { email: 'diagnostic@example.invalid' },
  plan: { id: 15, code: 'professional', name: 'Pro', price: 1299000, price_yearly: 12470400 },
}));
vi.mock('react-router-dom', () => ({
  Link: ({ children }) => <span>{children}</span>,
  useNavigate: () => m.navigate,
  useLocation: () => ({ state: { plan: m.plan, billingPeriod: 'yearly' } }),
  useSearchParams: () => [new URLSearchParams('orderCode=999')],
}));
vi.mock('../../stores/authStore', () => ({ useAuthStore: (s) => s({ user: m.user, isLoading: false, isAuthenticated: true }) }));
vi.mock('../../services/voucher.service', () => ({
  getAvailableVouchers: async () => ({ data: { data: { vouchers: [] } } }),
  getVoucherCodeSuggestions: async () => ({ data: { data: { vouchers: [] } } }),
  validateVoucher: vi.fn(),
}));
vi.mock('../../features/checkout/services/checkoutApi.service', () => ({
  default: { createPayment: vi.fn(), activateFreePlan: vi.fn(), getPaymentStatus: vi.fn(), getInvoice: vi.fn() },
}));
vi.mock('../../constants/invoiceVat', () => ({ isInvoiceVatUiEnabled: () => false }));
vi.mock('../../utils/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:fake' } }));

describe('CheckoutPage — dòng "Giá cuối cùng — dịch vụ không chịu thuế GTGT (KCT), không cộng thêm VAT"', () => {
  afterEach(cleanup);

  it('hiện đúng chữ tiếng Việt thật, không phải khoá i18n thô', async () => {
    render(
      <I18nProvider>
        <CheckoutPage />
      </I18nProvider>,
    );

    await waitFor(() => expect(screen.getByText('Giá cuối cùng — dịch vụ không chịu thuế GTGT (KCT), không cộng thêm VAT')).toBeInTheDocument());
    expect(screen.queryByText('checkout.finalPriceKct')).not.toBeInTheDocument();
  });
});
