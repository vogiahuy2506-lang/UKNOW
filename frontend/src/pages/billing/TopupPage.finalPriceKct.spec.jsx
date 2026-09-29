// Commit 28/09/2026: giá ghi rõ dịch vụ không chịu thuế GTGT (KCT), không cộng thêm VAT (bỏ câu "đã bao gồm 10% VAT" 29/09/2026).
// Dòng nhỏ "Giá cuối cùng — dịch vụ không chịu thuế GTGT (KCT), không cộng thêm VAT" phải hiện đúng chữ TIẾNG VIỆT thật,
// không phải khoá thô (t() thiếu khoá trả nguyên khoá i18n.actions.KEY — dùng I18nProvider THẬT,
// không mock '../../i18n').
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
    data: { result: { items: [], allowedMonths: [1], maxMonths: 3, subscription: {} } },
  }),
  quoteTopup: vi.fn(),
  createTopupPayment: vi.fn(),
}));

describe('TopupPage — dòng "Giá cuối cùng — dịch vụ không chịu thuế GTGT (KCT), không cộng thêm VAT"', () => {
  it('hiện đúng chữ tiếng Việt thật, không phải khoá i18n thô', async () => {
    render(
      <I18nProvider>
        <TopupPage />
      </I18nProvider>,
    );

    await waitFor(() => expect(screen.getByText('Giá cuối cùng — dịch vụ không chịu thuế GTGT (KCT), không cộng thêm VAT')).toBeInTheDocument());
    expect(screen.queryByText('checkout.finalPriceKct')).not.toBeInTheDocument();
  });
});
