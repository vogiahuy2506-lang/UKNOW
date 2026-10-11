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
          locked={props.locked}
          isEmployee={props.isEmployee}
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
    expect(screen.getByText(/Các tính năng đang tạm khoá, dữ liệu của bạn vẫn được giữ nguyên/i)).toBeInTheDocument();
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
    expect(screen.getByText(/Các tính năng đang tạm khoá, dữ liệu của bạn vẫn được giữ nguyên/i)).toBeInTheDocument();
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

/**
 * Chế độ khoá (PLAN_CONG_KHOA_GOI_HET_HAN_2026-10-11): server đã chặn thật nên modal không có lối thoát
 * ngoài gia hạn / hỗ trợ. Mỗi ca dưới đây có một đột biến tương ứng làm nó đỏ.
 */
describe('PlanExpiryModal — chế độ locked', () => {
  const onClose = vi.fn();
  const expired = { isFullyExpired: true, planRevokedAfterExpiry: false, isInGracePeriod: false };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderLocked = (props = {}) =>
    render(
      <I18nProvider>
        <PlanExpiryModal
          isOpen
          billingStatus={props.billingStatus === undefined ? expired : props.billingStatus}
          onClose={onClose}
          locked
          isEmployee={props.isEmployee}
        />
      </I18nProvider>
    );

  it('KHÔNG có nút X và KHÔNG có "Để sau"', () => {
    renderLocked();
    expect(screen.queryByRole('button', { name: 'Đóng' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Để sau/i })).not.toBeInTheDocument();
  });

  it('click nền và phím Esc KHÔNG gọi onClose', () => {
    renderLocked();
    fireEvent.click(screen.getByRole('dialog'));
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('chủ TK: mô tả "tạm khoá… dữ liệu vẫn được giữ nguyên", nút "Gia hạn ngay" → /app/billing, không gọi onClose', () => {
    renderLocked();
    expect(screen.getByRole('heading', { level: 2, name: 'Gói của bạn đã hết hạn' })).toBeInTheDocument();
    expect(screen.getByText(/Các tính năng đang tạm khoá cho đến khi gia hạn\. Dữ liệu khách hàng, chiến dịch/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Gia hạn ngay/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/app/billing');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('nhân viên: lời nhắn báo chủ gia hạn, nút "Xem bảng giá" → /pricing (không có "Gia hạn ngay")', () => {
    renderLocked({ isEmployee: true });
    expect(screen.getByText(/Gói của chủ tài khoản đã hết hạn/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Gia hạn ngay/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Xem bảng giá/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/pricing');
  });

  it('"Cần hỗ trợ" → /app/support', () => {
    renderLocked();
    fireEvent.click(screen.getByRole('button', { name: /Cần hỗ trợ/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/app/support');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('billingStatus null (chưa nạp hồ sơ nhưng server đã báo khoá) vẫn render; tài khoản không có gói vẫn giọng "đã hết hạn"', () => {
    const { unmount } = renderLocked({ billingStatus: null });
    expect(screen.getByRole('heading', { level: 2, name: 'Gói của bạn đã hết hạn' })).toBeInTheDocument();
    unmount();
    renderLocked({ billingStatus: { hasPlan: false, isFullyExpired: false, planRevokedAfterExpiry: false } });
    expect(screen.getByRole('heading', { level: 2, name: 'Gói của bạn đã hết hạn' })).toBeInTheDocument();
  });

  it('không locked mà billingStatus null → vẫn không render (hành vi cũ)', () => {
    const { container } = render(
      <I18nProvider>
        <PlanExpiryModal isOpen billingStatus={null} onClose={onClose} />
      </I18nProvider>
    );
    expect(container).toBeEmptyDOMElement();
  });
});
