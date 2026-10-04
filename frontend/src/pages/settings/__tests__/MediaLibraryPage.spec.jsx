import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { I18nProvider } from '../../../i18n';
import viDictionary from '../../../i18n/vi';
import { STORAGE_CATEGORIES } from '../../../features/storage/storageCategories';
import MediaLibraryPage from '../MediaLibraryPage';

/**
 * Thư viện media là MỘT danh sách tệp tính vào dung lượng, phân loại theo "tệp dùng cho việc gì":
 *  - mọi category đều có nhãn (landing_asset / form_asset từng hiện mã thô);
 *  - tab "Tệp khách gửi" đã gỡ (04/10/2026): nó đọc cột `attachments` của tin Zalo mà luồng nhận tin không bao giờ ghi,
 *    nên rỗng với mọi tài khoản. Thay bằng một dòng xám nói thật: tệp Zalo nằm trên Zalo, không tính dung lượng.
 * Mock api ở ranh giới đúng hình dạng thật `{ data: { success, data, categorySummary, pagination } }`.
 */
const mocks = vi.hoisted(() => ({ get: vi.fn(), del: vi.fn() }));

vi.mock('../../../services/api', () => ({ default: { get: mocks.get, delete: mocks.del } }));
// Chủ workspace (không phải nhân viên): được quản lý tệp. authStore thật kéo theo interceptor của api nên giả mỏng.
vi.mock('../../../stores/authStore', () => ({
  useAuthStore: (selector) => selector({ activeContext: null }),
}));

const pagination = { total: 1, page: 1, limit: 24, pages: 1 };
const reply = (body) => ({ data: { success: true, pagination, ...body } });

const allCategorySummary = STORAGE_CATEGORIES.map((item, index) => ({
  category: item.value, count: index + 1, totalBytes: (index + 1) * 1024,
}));

const renderPage = () => render(
  <I18nProvider>
    <MediaLibraryPage />
  </I18nProvider>
);

describe('MediaLibraryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockImplementation(async () => reply({ data: [], categorySummary: allCategorySummary }));
  });

  it('không còn tab: không có "Tệp khách gửi", "Tất cả tệp (Dung lượng)" hay "Tệp tin nhắn"', async () => {
    renderPage();
    await screen.findAllByText('Ảnh landing page');
    expect(screen.queryByRole('button', { name: 'Tệp khách gửi' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tất cả tệp (Dung lượng)' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tệp tin nhắn' })).toBeNull();
  });

  it('một dòng xám báo ảnh/tệp khách gửi qua Zalo nằm trên Zalo, không tính dung lượng, và chỉ tới đúng tên menu Hộp thư', async () => {
    renderPage();
    const note = await screen.findByText(/khách gửi qua Zalo nằm trên Zalo và không tính dung lượng/);
    // tên menu lấy từ từ điển (nav.inbox) — đổi tên menu thì dòng này đổi theo, không để câu chỉ tới mục không tồn tại
    expect(note).toHaveTextContent(`xem trong ${viDictionary.nav.inbox}`);
    // dòng này thay cho cả ghi chú vàng cũ lẫn tab: không còn câu nào nói "chỉ là link tới nền tảng"
    expect(screen.queryByText(/chỉ là link tới nền tảng/)).toBeNull();
  });

  it('chỉ gọi endpoint danh sách tệp, không còn gọi /media-library/channels của tab cũ', async () => {
    renderPage();
    await screen.findAllByText('Ảnh landing page');
    const paths = new Set(mocks.get.mock.calls.map(([path]) => path));
    expect([...paths]).toEqual(['/media-library/objects']);
  });

  it('nhãn mọi category: thẻ tổng hợp và ô lọc không hiện mã thô', async () => {
    renderPage();
    // landing_asset / form_asset là hai category từng hiện mã thô
    expect((await screen.findAllByText('Ảnh landing page')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Tệp biểu mẫu').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Mẫu tin nhắn').length).toBeGreaterThan(0);
    expect(screen.queryByText('Mẫu Zalo')).toBeNull();

    for (const { value } of STORAGE_CATEGORIES) {
      expect(screen.queryByText(value), `category ${value} hiện mã thô`).toBeNull();
    }

    const select = screen.getByRole('combobox');
    const optionLabels = within(select).getAllByRole('option').map((option) => option.textContent);
    expect(optionLabels).toHaveLength(STORAGE_CATEGORIES.length + 1); // + "Tất cả danh mục"
    for (const { value } of STORAGE_CATEGORIES) {
      expect(within(select).getByRole('option', { name: (_, element) => element.value === value })).toBeInTheDocument();
    }
  });

  it('chọn một category trong ô lọc gọi API với đúng category', async () => {
    renderPage();
    await screen.findAllByText('Ảnh landing page');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'landing_asset' } });
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith(
      '/media-library/objects',
      { params: expect.objectContaining({ category: 'landing_asset' }) }
    ));
  });
});
