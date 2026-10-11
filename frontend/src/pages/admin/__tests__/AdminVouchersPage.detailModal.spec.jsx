/**
 * Quản lý voucher (11/10/2026): bảng gọn 6 cột (Mã · Ưu đãi · Lượt dùng · Hạn dùng · Trạng thái · Hành động), điều kiện/thời gian/mô tả đầy đủ
 * chuyển vào modal chi tiết mở bằng nút mắt ở cột Hành động (không gọi API mới); "Sửa" trong modal mở form sửa sẵn có.
 */
import { act, configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../i18n';
import AdminVouchersPage from '../AdminVouchersPage';

configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 20000 });

const { getVouchers, getPlans } = vi.hoisted(() => ({ getVouchers: vi.fn(), getPlans: vi.fn() }));

vi.mock('../../../features/admin/services/adminVouchersApi.service', () => ({
  default: { getVouchers, createVoucher: vi.fn(), updateVoucher: vi.fn() },
}));
vi.mock('../../../features/admin/services/adminPlansApi.service', () => ({ default: { getPlans } }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../components/common/PageContainer', () => ({ default: ({ children, actions }) => <div>{actions}{children}</div> }));

const LONG_DESCRIPTION = 'Giảm 20% cho khách hàng mới đăng ký trong tháng 10, áp dụng cho mọi gói trả phí và không cộng dồn với ưu đãi khác của hệ thống.';

const privateVoucher = {
  id: 1,
  code: 'SECRET2026',
  name: 'Giảm 20% khách mới',
  description: LONG_DESCRIPTION,
  discountType: 'percentage',
  discountValue: 20,
  maxDiscountAmount: 500000,
  minOrderAmount: 100000,
  appliesToPlanCodes: ['starter', 'basic'],
  appliesToBillingPeriods: ['monthly', 'yearly'],
  startsAt: '2026-09-01T00:00:00',
  endsAt: '2099-12-31T23:59:59',
  usageLimit: 100,
  usageLimitPerUser: 1,
  usedCount: 25,
  offerMode: 'private_code',
  isActive: true,
  createdAt: '2026-08-30T03:15:00.000Z',
  updatedAt: '2026-09-02T04:20:00.000Z',
};

const publicVoucher = {
  id: 2,
  code: 'PUB10',
  name: 'Giảm 50k',
  description: '',
  discountType: 'fixed_amount',
  discountValue: 50000,
  maxDiscountAmount: null,
  minOrderAmount: 0,
  appliesToPlanCodes: [],
  appliesToBillingPeriods: [],
  startsAt: null,
  endsAt: null,
  usageLimit: null,
  usageLimitPerUser: null,
  usedCount: 0,
  offerMode: 'public_code',
  isActive: true,
};

// act async: chờ cả lượt tải voucher lẫn lượt tải gói xong rồi mới vào ca test (tránh cảnh báo "not wrapped in act").
const renderPage = async () => {
  await act(async () => {
    render(
      <I18nProvider>
        <AdminVouchersPage />
      </I18nProvider>,
    );
  });
};

const rowOf = (text) => screen.getByText(text).closest('tr');

describe('AdminVouchersPage — bảng gọn + modal chi tiết', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVouchers.mockResolvedValue({ data: { data: [privateVoucher, publicVoucher] } });
    getPlans.mockResolvedValue({ data: { data: [] } });
  });

  it('bảng còn 6 cột, cột cuối có tiêu đề "Hành động"; không còn cột Điều kiện / Thời gian / Loại riêng', async () => {
    await renderPage();
    await screen.findByText('PUB10');
    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent);
    expect(headers).toEqual(['Mã', 'Ưu đãi', 'Lượt dùng', 'Hạn dùng', 'Trạng thái', 'Hành động']);
  });

  it('chip trạng thái dùng badge-success (lớp có thật), hạn dùng chỉ ngày kết thúc, không hạn -> "Không thời hạn"', async () => {
    await renderPage();
    await screen.findByText('PUB10');
    const publicRow = rowOf('PUB10');
    const chip = within(publicRow).getByText('Hoạt động');
    expect(chip).toHaveClass('badge', 'badge-success', 'whitespace-nowrap');
    expect(within(publicRow).getByText('Không thời hạn')).toBeInTheDocument();

    const privateRow = rowOf('••••2026');
    expect(within(privateRow).getByText('31/12/2099')).toBeInTheDocument();
    // Ngày bắt đầu không còn ở bảng (nằm trong modal).
    expect(within(privateRow).queryByText(/01\/09\/2026/)).not.toBeInTheDocument();
  });

  it('ô Mã/Ưu đãi/Lượt dùng: chip loại + tên cắt 1 dòng, trần "tối đa" ở dòng 2, thanh tiến độ khi có giới hạn', async () => {
    await renderPage();
    await screen.findByText('PUB10');
    const privateRow = rowOf('••••2026');
    expect(within(privateRow).getByText('Bí mật')).toHaveClass('badge', 'whitespace-nowrap');
    expect(within(privateRow).getByText('Giảm 20% khách mới')).toHaveClass('truncate');
    expect(within(privateRow).getByText('20%')).toBeInTheDocument();
    expect(within(privateRow).getByText('tối đa 500.000 đ')).toBeInTheDocument();
    expect(within(privateRow).getByText('25')).toBeInTheDocument();
    expect(within(privateRow).getByText(/\/ 100/)).toBeInTheDocument();
    // Thanh tiến độ mảnh chỉ có khi voucher có giới hạn (25/100 = 25%); voucher không giới hạn thì không có thanh.
    expect(within(privateRow).getByText('25').closest('td').querySelector('[style*="width: 25%"]')).not.toBeNull();
    expect(rowOf('PUB10').querySelector('[style*="width"]')).toBeNull();
    // Mô tả dài KHÔNG tràn ra bảng.
    expect(screen.queryByText(LONG_DESCRIPTION)).not.toBeInTheDocument();
  });

  it('mọi dòng đều có nút mắt "Xem chi tiết" (kèm title + aria-label), cùng nút Sửa', async () => {
    await renderPage();
    await screen.findByText('PUB10');
    const buttons = screen.getAllByRole('button', { name: 'Xem chi tiết' });
    expect(buttons).toHaveLength(2);
    buttons.forEach((btn) => expect(btn).toHaveAttribute('title', 'Xem chi tiết'));
    expect(within(rowOf('PUB10')).getByRole('button', { name: 'Chỉnh sửa voucher' })).toBeInTheDocument();
  });

  it('bấm mắt mở modal hiện mô tả đầy đủ, điều kiện, thời gian, lượt dùng; mã bí mật che tới khi bấm hiện; Esc đóng', async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByText('PUB10');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(within(rowOf('••••2026')).getByRole('button', { name: 'Xem chi tiết' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Chi tiết voucher')).toBeInTheDocument();

    expect(within(screen.getByTestId('voucher-detail-description')).getByText(LONG_DESCRIPTION)).toBeInTheDocument();
    const plans = screen.getByTestId('voucher-detail-plans');
    expect(within(plans).getByText('starter')).toBeInTheDocument();
    expect(within(plans).getByText('basic')).toBeInTheDocument();
    const cycles = screen.getByTestId('voucher-detail-cycles');
    expect(within(cycles).getByText('Theo tháng')).toBeInTheDocument();
    expect(within(cycles).getByText('Theo năm')).toBeInTheDocument();
    expect(screen.getByTestId('voucher-detail-time')).toHaveTextContent('01/09/2026 → 31/12/2099');
    expect(screen.getByTestId('voucher-detail-usage')).toHaveTextContent('Đã dùng 25 / 100');
    expect(screen.getByTestId('voucher-detail-offer')).toHaveTextContent('20%, tối đa 500.000 đ');
    expect(within(dialog).getByText('Lượt/user')).toBeInTheDocument();
    expect(within(dialog).getByText('Ngày tạo')).toBeInTheDocument();
    expect(within(dialog).getByText('Cập nhật lần cuối')).toBeInTheDocument();

    // Mã bí mật: che mặc định, bấm hiện mới thấy.
    expect(within(screen.getByTestId('voucher-detail-code')).getByText('••••2026')).toBeInTheDocument();
    expect(within(dialog).queryByText('SECRET2026')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /Hiện mã bí mật/ }));
    expect(within(screen.getByTestId('voucher-detail-code')).getByText('SECRET2026')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('sao chép mã trong modal', async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByText('PUB10');
    await user.click(within(rowOf('PUB10')).getByRole('button', { name: 'Xem chi tiết' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Sao chép' }));
    await waitFor(async () => expect(await navigator.clipboard.readText()).toBe('PUB10'));
  });

  it('voucher không mô tả / không giới hạn / không hạn: modal hiện "—", "Không giới hạn", "Không thời hạn", Tất cả gói/chu kỳ', async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByText('PUB10');
    await user.click(within(rowOf('PUB10')).getByRole('button', { name: 'Xem chi tiết' }));
    const dialog = await screen.findByRole('dialog');
    expect(screen.getByTestId('voucher-detail-time')).toHaveTextContent('— → Không thời hạn');
    expect(screen.getByTestId('voucher-detail-usage')).toHaveTextContent('Đã dùng 0 / Không giới hạn');
    expect(within(screen.getByTestId('voucher-detail-plans')).getByText('Tất cả gói')).toBeInTheDocument();
    expect(within(screen.getByTestId('voucher-detail-cycles')).getByText('Tất cả chu kỳ')).toBeInTheDocument();
    expect(within(screen.getByTestId('voucher-detail-description')).getByText('—')).toBeInTheDocument();
    // Không có trường ngày tạo/cập nhật trong object -> không hiện dòng.
    expect(within(dialog).queryByText('Ngày tạo')).not.toBeInTheDocument();
  });

  it('nút "Sửa" trong modal đóng modal và mở form sửa của đúng voucher', async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByText('PUB10');
    await user.click(within(rowOf('PUB10')).getByRole('button', { name: 'Xem chi tiết' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Sửa' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByRole('heading', { name: 'Chỉnh sửa voucher' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('PUB10')).toBeInTheDocument();
  });
});
