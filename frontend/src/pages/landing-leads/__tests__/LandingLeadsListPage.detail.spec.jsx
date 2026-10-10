import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import toast from 'react-hot-toast';
import { I18nProvider } from '../../../i18n';
import LandingLeadsListPage from '../LandingLeadsListPage';
import useLandingLeadsList from '../../../features/landing/hooks/useLandingLeadsList.js';

vi.mock('../../../features/landing/hooks/useLandingLeadsList.js');
vi.mock('../../../features/landing/services/landingLeadsAdminApi.service.js', () => ({
  fetchLandingLeadsCustomFieldDefinitions: vi.fn().mockResolvedValue([]),
  fetchLandingLeadsSlugOptions: vi.fn().mockResolvedValue([]),
}));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

const LONG_NOTE =
  'Muốn học buổi tối vì ban ngày đi làm, ưu tiên lớp có ghi hình lại để xem bù và cần xuất hoá đơn công ty đầy đủ thông tin';

// Ảnh production 10/10/2026: ô "Thông tin thêm" chỉ có một dòng cắt bớt + `title` (cảm ứng không hover được)
// → không đọc được phần còn lại. Modal chi tiết phải hiện ĐỦ mọi trường.
const leadWithExtras = {
  id: 7,
  fullName: 'Nguyen Van A',
  email: 'a@example.com',
  phone: '0901111111',
  marketingConsent: true,
  consentWithdrawnAt: null,
  landingPageSlug: 'khoa-hoc-1',
  createdAt: '2026-09-29T04:16:03Z',
  occupation: 'Kế toán',
  interestArea: 'AI cho Giáo dục',
  customFields: {
    cf_company: { type: 'text', labelVi: 'Công ty', labelEn: 'Company', value: 'ACME', displayVi: 'ACME', displayEn: 'ACME' },
    cf_note: { type: 'textarea', labelVi: 'Ghi chú', labelEn: 'Note', value: LONG_NOTE, displayVi: LONG_NOTE, displayEn: LONG_NOTE },
  },
};

const leadWithoutExtras = {
  id: 8,
  fullName: 'Tran Van B',
  email: 'b@example.com',
  phone: '0902222222',
  marketingConsent: null,
  consentWithdrawnAt: null,
  landingPageSlug: null,
};

function mockHook(items) {
  useLandingLeadsList.mockReturnValue({
    draftFilters: {},
    setDraftFilters: vi.fn(),
    appliedFilters: {},
    applyFilters: vi.fn(),
    resetFilters: vi.fn(),
    exportExcel: vi.fn(),
    isExporting: false,
    page: 1,
    setPage: vi.fn(),
    items,
    pagination: { total: items.length, page: 1, pageSize: 20, totalPages: 1 },
    isLoading: false,
    errorMessage: null,
    reload: vi.fn(),
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <LandingLeadsListPage />
      </I18nProvider>
    </MemoryRouter>
  );
}

function rowOf(name) {
  return screen.getByText(name).closest('tr');
}

describe('LandingLeadsListPage — modal chi tiết khách (10/10/2026)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHook([leadWithExtras, leadWithoutExtras]);
  });

  it('ô "Thông tin thêm" chỉ hiện 2 trường đầu + hậu tố "+N" cho phần bị ẩn; dòng không có trường thêm thì "Không có"', () => {
    renderPage();
    const row = rowOf('Nguyen Van A');
    expect(within(row).getByText('Nghề nghiệp: Kế toán · Lĩnh vực: AI cho Giáo dục')).toBeInTheDocument();
    expect(within(row).getByText('+2')).toBeInTheDocument();
    // chuỗi đầy đủ nằm ở title để rê chuột đọc
    expect(within(row).getByTitle(/Ghi chú: Muốn học buổi tối/)).toBeInTheDocument();
    // không có trường nào bị ẩn thì không có hậu tố
    expect(within(rowOf('Tran Van B')).queryByText(/^\+\d+$/)).toBeNull();
    expect(within(rowOf('Tran Van B')).getByText('Không có')).toBeInTheDocument();
  });

  it('bấm vào dòng mở modal có đủ họ tên, email, SĐT, trang nguồn, đồng ý tiếp thị, thời điểm gửi và TOÀN BỘ trường thêm', () => {
    renderPage();
    expect(screen.queryByTestId('landing-lead-detail-modal')).toBeNull();

    fireEvent.click(rowOf('Nguyen Van A'));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByText('Nguyen Van A')).toBeInTheDocument();
    expect(within(dialog).getByText('a@example.com')).toBeInTheDocument();
    expect(within(dialog).getByText('0901111111')).toBeInTheDocument();
    const sourceLink = within(dialog).getByRole('link', { name: /khoa-hoc-1/ });
    expect(sourceLink).toHaveAttribute('target', '_blank');
    expect(sourceLink).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(within(dialog).getByText('Có')).toBeInTheDocument();
    // 04:16 UTC = 11:16 Hà Nội
    expect(within(dialog).getByText(/11:16:03 29\/9\/2026/)).toBeInTheDocument();

    const extraList = within(dialog).getByTestId('landing-lead-extra-list');
    expect(within(extraList).getAllByRole('listitem')).toHaveLength(4);
    expect(within(extraList).getByText('Nghề nghiệp:')).toBeInTheDocument();
    expect(within(extraList).getByText('Kế toán')).toBeInTheDocument();
    expect(within(extraList).getByText('Lĩnh vực:')).toBeInTheDocument();
    expect(within(extraList).getByText('Công ty:')).toBeInTheDocument();
    expect(within(extraList).getByText('ACME')).toBeInTheDocument();
    // trường dài hiện nguyên văn, không cắt
    expect(within(extraList).getByText(LONG_NOTE)).toBeInTheDocument();
  });

  it('nút biểu tượng "Xem chi tiết" ở cuối dòng cũng mở modal; dòng không có trường thêm hiện "Không có" trong modal', () => {
    renderPage();
    fireEvent.click(within(rowOf('Tran Van B')).getByRole('button', { name: 'Xem chi tiết' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('b@example.com')).toBeInTheDocument();
    expect(within(dialog).queryByRole('link')).toBeNull();
    expect(within(dialog).getByText('Không có')).toBeInTheDocument();
  });

  it('Enter / Space trên dòng đang focus mở modal; phím khác thì không', () => {
    renderPage();
    const row = rowOf('Nguyen Van A');
    expect(row).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(row, { key: 'a' });
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.keyDown(row, { key: 'Enter' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.keyDown(row, { key: ' ' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('Esc, nút Đóng, nút X và bấm nền tối đều đóng modal', () => {
    renderPage();
    const open = () => fireEvent.click(rowOf('Nguyen Van A'));

    open();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    open();
    const closeButtons = within(screen.getByRole('dialog')).getAllByRole('button', { name: 'Đóng' });
    expect(closeButtons.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(screen.queryByRole('dialog')).toBeNull();

    open();
    fireEvent.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: 'Đóng' })[0]);
    expect(screen.queryByRole('dialog')).toBeNull();

    open();
    // lớp nền (aria-hidden) là phần tử anh em đứng trước hộp thoại
    fireEvent.click(screen.getByTestId('landing-lead-detail-modal').firstElementChild);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('bấm nút sao chép / link trang nguồn TRONG DÒNG không mở modal (chúng tự xử lý)', () => {
    renderPage();
    const row = rowOf('Nguyen Van A');
    fireEvent.click(within(row).getByTitle('Copy email'));
    fireEvent.click(within(row).getByRole('link', { name: /khoa-hoc-1/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sao chép SĐT trong modal: thành công báo toast.success, clipboard lỗi thì toast.error (không nuốt lỗi)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderPage();
    fireEvent.click(rowOf('Nguyen Van A'));
    const dialog = screen.getByRole('dialog');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Sao chép Điện thoại' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('0901111111'));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());

    writeText.mockRejectedValueOnce(new Error('denied'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sao chép Email' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it('khách đã rút đồng ý thì modal hiện "Đã rút", không hiện "Có"', () => {
    mockHook([{ ...leadWithExtras, marketingConsent: true, consentWithdrawnAt: '2026-09-30T10:00:00Z' }]);
    renderPage();
    fireEvent.click(rowOf('Nguyen Van A'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Đã rút/)).toBeInTheDocument();
    expect(within(dialog).queryByText('Có')).toBeNull();
  });
});
