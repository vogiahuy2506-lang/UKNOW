import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PlanExpiryModal from '../PlanExpiryModal';
import { I18nProvider } from '../../../../i18n';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

describe('PlanExpiryModal — 3 giọng cảnh báo và tương tác', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderModal = (props = {}) => {
    return render(
      <I18nProvider>
        <PlanExpiryModal
          isOpen={props.isOpen ?? true}
          billingStatus={props.billingStatus}
          onClose={props.onClose || onClose}
        />
      </I18nProvider>
    );
  };

  it('không render khi isOpen = false hoặc billingStatus = null', () => {
    const { container: c1 } = renderModal({ isOpen: false, billingStatus: { isFullyExpired: true } });
    expect(c1).toBeEmptyDOMElement();

    const { container: c2 } = renderModal({ isOpen: true, billingStatus: null });
    expect(c2).toBeEmptyDOMElement();
  });

  it('Nhánh 1: Gói đã hết hạn hoàn toàn (isFullyExpired = true) — hiện giọng hết hạn', () => {
    renderModal({
      billingStatus: {
        isFullyExpired: true,
        planRevokedAfterExpiry: false,
        isInGracePeriod: false,
      },
    });

    expect(screen.getByRole('heading', { level: 2, name: 'Gói của bạn đã hết hạn' })).toBeInTheDocument();
    expect(screen.getByText('Đã hết hạn')).toBeInTheDocument();
    expect(screen.getByText(/Các chiến dịch marketing của bạn đã tạm dừng/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nâng cấp ngay/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Để sau/i })).toBeInTheDocument();
  });

  it('TỰ KIỂM TEST CÓ RĂNG — Nhánh 1: Sau khi cron thu hồi (planRevokedAfterExpiry = true, isFullyExpired = false) vẫn phải hiện giọng hết hạn (Ca 9b)', () => {
    renderModal({
      billingStatus: {
        isFullyExpired: false,
        planRevokedAfterExpiry: true,
        isInGracePeriod: false,
        daysUntilExpiry: null,
      },
    });

    // Nếu bỏ planRevokedAfterExpiry khỏi PlanExpiryModal, modal sẽ không render gì (bị rỗng)
    expect(screen.getByRole('heading', { level: 2, name: 'Gói của bạn đã hết hạn' })).toBeInTheDocument();
    expect(screen.getByText('Đã hết hạn')).toBeInTheDocument();
    expect(screen.getByText(/Các chiến dịch marketing của bạn đã tạm dừng/i)).toBeInTheDocument();
  });

  it('Nhánh 2: Đang trong ân hạn (isInGracePeriod = true) — hiện giọng ân hạn (Ca 8)', () => {
    renderModal({
      billingStatus: {
        isFullyExpired: false,
        planRevokedAfterExpiry: false,
        isInGracePeriod: true,
        graceDaysLeft: 2,
        daysUntilExpiry: -1,
      },
    });

    expect(screen.getByRole('heading', { level: 2, name: 'Gói của bạn đã hết hạn' })).toBeInTheDocument();
    expect(screen.getByText('Đang ân hạn')).toBeInTheDocument();
    expect(screen.getByText(/còn 2 ngày ân hạn/i)).toBeInTheDocument();
  });

  it('Nhánh 3: Sắp hết hạn (daysUntilExpiry = 3) — hiện giọng sắp hết hạn (Ca 2)', () => {
    renderModal({
      billingStatus: {
        isFullyExpired: false,
        planRevokedAfterExpiry: false,
        isInGracePeriod: false,
        daysUntilExpiry: 3,
      },
    });

    expect(screen.getByRole('heading', { level: 2, name: 'Gói của bạn sắp hết hạn' })).toBeInTheDocument();
    expect(screen.getByText('Sắp hết hạn')).toBeInTheDocument();
    expect(screen.getByText(/hết hạn sau 3 ngày nữa/i)).toBeInTheDocument();
    expect(screen.getByText(/Các chiến dịch đang chạy sẽ dừng khi hết hạn/i)).toBeInTheDocument();
  });

  it('Bấm "Nâng cấp ngay" → đóng modal và navigate tới /app/billing', () => {
    renderModal({
      billingStatus: {
        isFullyExpired: true,
      },
    });

    const upgradeBtn = screen.getByRole('button', { name: /Nâng cấp ngay/i });
    fireEvent.click(upgradeBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/app/billing');
  });

  it('Bấm "Để sau" → gọi onClose', () => {
    renderModal({
      billingStatus: {
        isFullyExpired: true,
      },
    });

    const laterBtn = screen.getByRole('button', { name: /Để sau/i });
    fireEvent.click(laterBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Bấm nút X góc trên phải → gọi onClose', () => {
    renderModal({
      billingStatus: {
        isFullyExpired: true,
      },
    });

    const closeBtn = screen.getByRole('button', { name: 'Đóng' });
    fireEvent.click(closeBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Bấm ra ngoài overlay backdrop → gọi onClose', () => {
    renderModal({
      billingStatus: {
        isFullyExpired: true,
      },
    });

    const overlay = screen.getByRole('dialog');
    fireEvent.click(overlay);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
