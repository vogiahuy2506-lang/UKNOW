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

// Quy định 11/2026: bỏ 2 trường cố định Nghề nghiệp / Lĩnh vực quan tâm.
// Modal + bảng chỉ hiện trường cơ bản + toàn bộ customFields của form landing.
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
    effectiveFilters: {},
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
    groups: [
      { slug: 'khoa-hoc-1', title: 'Khoá học 1', total: items.length, latestAt: '2026-09-29T04:16:03Z', customKeys: [
        { key: 'cf_company', labelVi: 'Công ty', labelEn: 'Company', type: 'text' },
        { key: 'cf_note', labelVi: 'Ghi chú', labelEn: 'Note', type: 'textarea' },
      ] },
    ],
    groupDefs: [],
    groupsLoading: false,
    groupsError: '',
    selectedSlug: 'khoa-hoc-1',
    selectSlug: vi.fn(),
    reloadGroups: vi.fn(),
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

function openGroupModal() {
  // Quy định 11/2026: bấm vào thẻ landing mới mở modal chứa bảng.
  fireEvent.click(screen.getByRole('option', { name: /Khoá học 1/ }));
}

function groupModal() {
  return screen.getByTestId('landing-group-modal');
}

function rowOf(name) {
  return within(groupModal()).getByText(name).closest('tr');
}

function detailModal() {
  return screen.getByTestId('landing-lead-detail-modal');
}

describe('LandingLeadsListPage — modal chi tiết khách (10/10/2026)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHook([leadWithExtras, leadWithoutExtras]);
  });

  it('bảng cột động: toàn bộ trường riêng của thẻ hiện thành cột riêng (không còn cột Nghề/Lĩnh vực, không còn ô "Thông tin thêm")', () => {
    renderPage();
    openGroupModal();
    const row = rowOf('Nguyen Van A');
    // Không còn cột cố định nghề / lĩnh vực
    expect(within(groupModal()).queryByText('Kế toán')).toBeNull();
    expect(within(groupModal()).queryByText('AI cho Giáo dục')).toBeNull();
    // Cột động của thẻ: Công ty + Ghi chú hiện đủ giá trị (title giữ nguyên văn cho ô bị cắt)
    expect(within(row).getByText('ACME')).toBeInTheDocument();
    expect(within(row).getByTitle(LONG_NOTE)).toBeInTheDocument();
  });

  it('bấm vào dòng mở modal có đủ họ tên, email, SĐT, trang nguồn, đồng ý tiếp thị, thời điểm gửi và TOÀN BỘ trường thêm', () => {
    renderPage();
    openGroupModal();
    expect(screen.queryByTestId('landing-lead-detail-modal')).toBeNull();

    fireEvent.click(rowOf('Nguyen Van A'));

    const dialog = detailModal();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByText('a@example.com')).toBeInTheDocument();
    expect(within(dialog).getByText('0901111111')).toBeInTheDocument();
    const sourceLink = within(dialog).getByRole('link', { name: /khoa-hoc-1/ });
    expect(sourceLink).toHaveAttribute('target', '_blank');
    expect(sourceLink).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(within(dialog).getByText('Có')).toBeInTheDocument();
    // 04:16 UTC = 11:16 Hà Nội
    expect(within(dialog).getByText(/11:16:03 29\/9\/2026/)).toBeInTheDocument();

    const extraList = within(dialog).getByTestId('landing-lead-extra-list');
    // Chỉ còn 2 trường custom, không còn Nghề nghiệp / Lĩnh vực
    expect(within(extraList).getAllByRole('listitem')).toHaveLength(2);
    expect(within(extraList).queryByText('Nghề nghiệp:')).toBeNull();
    expect(within(extraList).queryByText('Lĩnh vực:')).toBeNull();
    expect(within(extraList).getByText('Công ty:')).toBeInTheDocument();
    expect(within(extraList).getByText('ACME')).toBeInTheDocument();
    // trường dài hiện nguyên văn, không cắt
    expect(within(extraList).getByText(LONG_NOTE)).toBeInTheDocument();
  });

  it('nút biểu tượng "Xem chi tiết" ở cuối dòng cũng mở modal; dòng không có trường thêm hiện "Không có" trong modal', () => {
    renderPage();
    openGroupModal();
    fireEvent.click(within(rowOf('Tran Van B')).getByRole('button', { name: 'Xem chi tiết' }));

    const dialog = detailModal();
    expect(within(dialog).getByText('b@example.com')).toBeInTheDocument();
    expect(within(dialog).queryByRole('link')).toBeNull();
    expect(within(dialog).getByText('Không có')).toBeInTheDocument();
  });

  it('Enter / Space trên dòng đang focus mở modal; phím khác thì không', () => {
    renderPage();
    openGroupModal();
    const row = rowOf('Nguyen Van A');
    expect(row).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(row, { key: 'a' });
    expect(screen.queryByTestId('landing-lead-detail-modal')).toBeNull();

    fireEvent.keyDown(row, { key: 'Enter' });
    expect(detailModal()).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('landing-lead-detail-modal')).toBeNull();

    fireEvent.keyDown(rowOf('Nguyen Van A'), { key: ' ' });
    expect(detailModal()).toBeInTheDocument();
  });

  it('Esc, nút Đóng, nút X và bấm nền tối đều đóng modal chi tiết (giữ nguyên modal nhóm)', () => {
    renderPage();
    openGroupModal();
    const open = () => fireEvent.click(rowOf('Nguyen Van A'));

    open();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('landing-lead-detail-modal')).toBeNull();
    // Modal nhóm vẫn mở
    expect(screen.getByTestId('landing-group-modal')).toBeInTheDocument();

    open();
    // Footer có 1 nút Đóng chữ + header có 1 nút X (aria-label Đóng): lấy nút chữ trong footer.
    fireEvent.click(within(detailModal()).getAllByRole('button', { name: 'Đóng' }).pop());
    expect(screen.queryByTestId('landing-lead-detail-modal')).toBeNull();

    open();
    fireEvent.click(within(detailModal()).getAllByRole('button', { name: 'Đóng' })[0]);
    expect(screen.queryByTestId('landing-lead-detail-modal')).toBeNull();

    open();
    // lớp nền (aria-hidden) là phần tử anh em đứng trước hộp thoại chi tiết
    fireEvent.click(detailModal().firstElementChild);
    expect(screen.queryByTestId('landing-lead-detail-modal')).toBeNull();
  });

  it('bấm nút sao chép TRONG DÒNG không mở modal (chúng tự xử lý)', () => {
    renderPage();
    openGroupModal();
    const row = rowOf('Nguyen Van A');
    fireEvent.click(within(row).getByTitle('Sao chép Email'));
    fireEvent.click(within(row).getByTitle('Sao chép Điện thoại'));
    expect(screen.queryByTestId('landing-lead-detail-modal')).toBeNull();
  });

  it('sao chép SĐT trong modal: thành công báo toast.success, clipboard lỗi thì toast.error (không nuốt lỗi)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderPage();
    openGroupModal();
    fireEvent.click(rowOf('Nguyen Van A'));
    const dialog = detailModal();

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
    openGroupModal();
    fireEvent.click(rowOf('Nguyen Van A'));
    const dialog = detailModal();
    expect(within(dialog).getByText(/Đã rút/)).toBeInTheDocument();
    expect(within(dialog).queryByText('Có')).toBeNull();
  });
});
