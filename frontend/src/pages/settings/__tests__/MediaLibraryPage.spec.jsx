import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../../../i18n';
import viDictionary from '../../../i18n/vi';
import { STORAGE_CATEGORIES } from '../../../features/storage/storageCategories';
import { subscribeStorageQuotaRefresh } from '../../../features/storage/storageEvents';
import MediaLibraryPage from '../MediaLibraryPage';

/**
 * Thư viện media (menu "Tệp & dung lượng") là MỘT danh sách tệp tính vào dung lượng:
 *  - không còn tab/ô chọn danh mục: thẻ "Tất cả" + các thẻ loại tệp làm bộ lọc; thanh dung lượng ở đầu trang;
 *  - mỗi tệp nói "đang dùng ở đâu" (bấm được, khoá nút xoá) hoặc "không còn dùng — xoá được", tệp chat nói đến từ đâu;
 *  - xoá có toast "Đã xoá, có lại …"; lỗi dịch theo `code` của backend (không in message tiếng Việt của máy chủ).
 * Mock api ở ranh giới đúng hình dạng thật `{ data: { success, data, categorySummary, pagination } }` — id bigint là CHUỖI.
 */
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  del: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  auth: { activeContext: null },
}));

vi.mock('../../../services/api', () => ({ default: { get: mocks.get, delete: mocks.del } }));
vi.mock('react-hot-toast', () => ({ default: { success: mocks.toastSuccess, error: mocks.toastError } }));
// Chủ workspace (không phải nhân viên): được quản lý tệp. authStore thật kéo theo interceptor của api nên giả mỏng.
vi.mock('../../../stores/authStore', () => ({
  useAuthStore: (selector) => selector({ activeContext: mocks.auth.activeContext }),
}));
// Thanh dung lượng có hook + API riêng (đã có spec riêng): ở đây chỉ cần biết nó nằm ở đâu.
vi.mock('../../../features/storage/StorageUsageSection', () => ({
  default: () => <div data-testid="storage-usage" />,
}));

const oneItemPagination = { total: 1, page: 1, limit: 24, pages: 1 };
const reply = (body) => ({ data: { success: true, pagination: oneItemPagination, ...body } });

const allCategorySummary = STORAGE_CATEGORIES.map((item, index) => ({
  category: item.value, count: index + 1, totalBytes: (index + 1) * 1024,
}));

/** Một tệp đúng hình dạng backend trả. */
const fileItem = (overrides = {}) => ({
  id: '31',
  storageKey: 'uploads/7/zalo/1754800000000_promo.png',
  tempKey: null,
  category: 'zalo_template',
  state: 'active',
  sizeBytes: 3_400_000,
  size: 3_400_000,
  displayName: 'promo.png',
  name: 'promo.png',
  mimeType: 'image/png',
  type: 'image',
  url: 'https://app.test/file/tok/download?preview=true',
  expiresAt: null,
  autoDeleteAt: null,
  referenceType: 'zalo_template',
  referenceId: '15',
  source: null,
  createdAt: '2026-08-09T10:00:00.000Z',
  inUse: false,
  usedBy: null,
  ...overrides,
});

const inUseItem = (overrides = {}) => fileItem({
  inUse: true,
  usedBy: { referenceType: 'zalo_template', referenceId: '15', label: 'Mẫu tin nhắn', name: 'Khuyến mãi T8', url: '/app/settings/templates' },
  ...overrides,
});

const renderPage = () => render(
  <MemoryRouter>
    <I18nProvider>
      <MediaLibraryPage />
    </I18nProvider>
  </MemoryRouter>
);

const listCalls = () => mocks.get.mock.calls.filter(([path]) => path === '/media-library/objects');
const lastParams = () => listCalls().at(-1)[1].params;

describe('MediaLibraryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.activeContext = null;
    mocks.get.mockImplementation(async () => reply({ data: [], categorySummary: allCategorySummary }));
  });

  describe('bố cục (M-01, M-03, M-08)', () => {
    it('không còn tab và ô chọn danh mục: không có "Tệp khách gửi", "Tất cả tệp (Dung lượng)", hộp chọn', async () => {
      renderPage();
      await screen.findByTestId('tile-all');
      expect(screen.queryByRole('button', { name: 'Tệp khách gửi' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Tất cả tệp (Dung lượng)' })).toBeNull();
      expect(screen.queryByRole('combobox')).toBeNull();
    });

    it('tiêu đề "Tệp & dung lượng" và câu phụ nói đúng: tệp tải lên tính vào dung lượng gói', async () => {
      renderPage();
      expect(await screen.findByRole('heading', { name: 'Tệp & dung lượng' })).toBeInTheDocument();
      expect(screen.getByText(viDictionary.mediaLibrary.subtitle)).toBeInTheDocument();
      expect(viDictionary.mediaLibrary.subtitle).not.toMatch(/toàn bộ|trên hệ thống/);
    });

    it('M-03: thanh dung lượng nằm ĐẦU trang, trước các thẻ loại tệp', async () => {
      renderPage();
      const usage = await screen.findByTestId('storage-usage');
      // Thẻ loại tệp hiện sau khi danh sách tải xong — thanh dung lượng có thể về trước (CI chậm hơn máy dev): phải CHỜ.
      const tileAll = await screen.findByTestId('tile-all');
      expect(usage.compareDocumentPosition(tileAll) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('chủ tài khoản thấy "Mua thêm dung lượng" tới /app/topup; nhân viên thì không', async () => {
      const owner = renderPage();
      const buy = await screen.findByRole('link', { name: /Mua thêm dung lượng/ });
      expect(buy).toHaveAttribute('href', '/app/topup');
      owner.unmount();

      mocks.auth.activeContext = { type: 'employee', ownerId: 3, permissions: { media_library_view: true, media_library_manage: true } };
      renderPage();
      await screen.findByTestId('tile-all');
      expect(screen.queryByRole('link', { name: /Mua thêm dung lượng/ })).toBeNull();
    });

    it('một dòng xám báo ảnh/tệp khách gửi qua Zalo nằm trên Zalo, không tính dung lượng, chỉ tới đúng tên menu Hộp thư', async () => {
      renderPage();
      const note = await screen.findByText(/khách gửi qua Zalo nằm trên Zalo và không tính dung lượng/);
      // tên menu lấy từ từ điển (nav.inbox) — đổi tên menu thì dòng này đổi theo, không để câu chỉ tới mục không tồn tại
      expect(note).toHaveTextContent(`xem trong ${viDictionary.nav.inbox}`);
      expect(screen.queryByText(/chỉ là link tới nền tảng/)).toBeNull();
    });

    it('nhãn mọi category: thẻ tổng hợp không hiện mã thô; "Tệp trong chat & Trợ lý AI", "Bản lưu landing (tự động)", "Tệp chưa lưu (tự xoá)"', async () => {
      renderPage();
      expect((await screen.findAllByText('Ảnh landing page')).length).toBeGreaterThan(0);
      expect(screen.getAllByText('Tệp biểu mẫu').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Mẫu tin nhắn').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Tệp trong chat & Trợ lý AI').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Bản lưu landing (tự động)').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Tệp chưa lưu (tự xoá)').length).toBeGreaterThan(0);
      expect(screen.queryByText('Mẫu Zalo')).toBeNull();
      for (const { value } of STORAGE_CATEGORIES) {
        expect(screen.queryByText(value), `category ${value} hiện mã thô`).toBeNull();
      }
    });

    it('thẻ "Tất cả" cộng các loại tệp hiện trong lưới (không gồm bản lưu landing tự động)', async () => {
      mocks.get.mockImplementation(async () => reply({
        data: [],
        categorySummary: [
          { category: 'chat', count: 2, totalBytes: 2048 },
          { category: 'zalo_template', count: 3, totalBytes: 1024 },
          { category: 'landing_version', count: 19, totalBytes: 322_000 },
        ],
      }));
      renderPage();
      const all = await screen.findByTestId('tile-all');
      expect(all).toHaveTextContent('5 tệp');
      expect(all).toHaveTextContent('3 KB');
    });

    it('thẻ "Bản lưu landing (tự động)" chỉ để xem (không phải nút), kèm giải thích', async () => {
      renderPage();
      const tile = await screen.findByTestId('tile-landing-version');
      expect(tile.tagName).toBe('DIV');
      expect(tile).toHaveAttribute('title', viDictionary.mediaLibrary.landingVersionHint);
    });
  });

  describe('lọc, tìm, sắp xếp (M-08, M-11)', () => {
    it('bấm thẻ loại tệp gọi API với đúng category; bấm lại / bấm "Tất cả" bỏ lọc', async () => {
      renderPage();
      await screen.findByTestId('tile-all');
      const chatTile = screen.getByRole('button', { name: /Tệp trong chat & Trợ lý AI/ });

      fireEvent.click(chatTile);
      await waitFor(() => expect(lastParams()).toMatchObject({ category: 'chat', page: 1 }));

      fireEvent.click(screen.getByTestId('tile-all'));
      await waitFor(() => expect(lastParams()).not.toHaveProperty('category'));
    });

    it('sắp xếp: mặc định "Tệp nặng trước"; bấm "Tệp mới trước" gửi sort=newest', async () => {
      renderPage();
      await screen.findByTestId('tile-all');
      expect(lastParams()).toMatchObject({ sort: 'size' });
      expect(screen.getByRole('button', { name: 'Tệp nặng trước' })).toHaveAttribute('aria-pressed', 'true');

      fireEvent.click(screen.getByRole('button', { name: 'Tệp mới trước' }));
      await waitFor(() => expect(lastParams()).toMatchObject({ sort: 'newest' }));
      expect(screen.getByRole('button', { name: 'Tệp mới trước' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('ô tìm ghi "Tìm theo tên tệp" (không còn "đường dẫn")', async () => {
      renderPage();
      expect(await screen.findByPlaceholderText('Tìm theo tên tệp')).toBeInTheDocument();
      expect(screen.queryByPlaceholderText(/đường dẫn/)).toBeNull();
    });

    describe('debounce', () => {
      beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
      afterEach(() => { vi.useRealTimers(); });

      it('gõ nhiều phím liên tiếp chỉ gửi MỘT request tìm kiếm sau 300 ms', async () => {
        renderPage();
        await screen.findByTestId('tile-all');
        const before = listCalls().length;
        const input = screen.getByPlaceholderText('Tìm theo tên tệp');

        fireEvent.change(input, { target: { value: 'b' } });
        fireEvent.change(input, { target: { value: 'ba' } });
        fireEvent.change(input, { target: { value: 'ban' } });
        expect(listCalls().length).toBe(before); // chưa quá 300 ms: chưa gọi

        await act(async () => { vi.advanceTimersByTime(350); });
        await waitFor(() => expect(listCalls().length).toBe(before + 1));
        expect(lastParams()).toMatchObject({ search: 'ban', page: 1 });
      });
    });

    it('bấm "Sau" trong 300 ms đầu (chưa gõ gì) KHÔNG bị bộ debounce kéo về trang 1', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        mocks.get.mockImplementation(async (path, { params }) => reply({
          data: [fileItem({ id: String(params.page), displayName: `trang-${params.page}.png`, name: `trang-${params.page}.png` })],
          pagination: { total: 48, page: params.page, limit: 24, pages: 2 },
          categorySummary: allCategorySummary,
        }));
        renderPage();
        await screen.findByText('trang-1.png');

        fireEvent.click(screen.getByRole('button', { name: viDictionary.common.next }));
        await act(async () => { vi.advanceTimersByTime(500); });

        expect(await screen.findByText('trang-2.png')).toBeInTheDocument();
        expect(lastParams()).toMatchObject({ page: 2 });
      } finally {
        vi.useRealTimers();
      }
    });

    it('phản hồi về trễ của chữ cũ KHÔNG đè kết quả của chữ mới', async () => {
      let resolveOld;
      const oldReply = new Promise((resolve) => { resolveOld = resolve; });
      mocks.get.mockImplementation((path, { params }) => {
        if (params.search === 'cu') return oldReply;
        if (params.search === 'moi') return Promise.resolve(reply({ data: [fileItem({ id: '2', displayName: 'ket-qua-moi.png', name: 'ket-qua-moi.png' })], categorySummary: allCategorySummary }));
        return Promise.resolve(reply({ data: [], categorySummary: allCategorySummary }));
      });
      renderPage();
      const input = await screen.findByPlaceholderText('Tìm theo tên tệp');

      fireEvent.change(input, { target: { value: 'cu' } });
      await waitFor(() => expect(lastParams()).toMatchObject({ search: 'cu' }), { timeout: 2000 });
      fireEvent.change(input, { target: { value: 'moi' } });
      expect(await screen.findByText('ket-qua-moi.png', {}, { timeout: 2000 })).toBeInTheDocument();

      await act(async () => {
        resolveOld(reply({ data: [fileItem({ id: '1', displayName: 'ket-qua-cu.png', name: 'ket-qua-cu.png' })], categorySummary: allCategorySummary }));
      });
      expect(screen.queryByText('ket-qua-cu.png')).toBeNull();
      expect(screen.getByText('ket-qua-moi.png')).toBeInTheDocument();
    });
  });

  describe('thẻ tệp (M-02, M-05, M-06, M-15)', () => {
    it('tệp đang dùng: "Đang dùng ở: Mẫu tin nhắn "Khuyến mãi T8"" là link tới nơi dùng, nút xoá bị khoá và nói vì sao', async () => {
      mocks.get.mockImplementation(async () => reply({ data: [inUseItem()], categorySummary: allCategorySummary }));
      renderPage();

      const link = await screen.findByRole('link', { name: 'Đang dùng ở: Mẫu tin nhắn "Khuyến mãi T8"' });
      expect(link).toHaveAttribute('href', '/app/settings/templates');
      const del = screen.getByRole('button', { name: 'Xoá tệp: promo.png' });
      expect(del).toBeDisabled();
      expect(del).toHaveAttribute('title', 'Tệp đang dùng — gỡ khỏi Mẫu tin nhắn trước rồi xoá');
    });

    it('tệp không còn dùng: "Không còn dùng — xoá được", nút xoá bấm được', async () => {
      mocks.get.mockImplementation(async () => reply({ data: [fileItem({ category: 'landing_asset', referenceType: 'landing_page' })], categorySummary: allCategorySummary }));
      renderPage();

      expect(await screen.findByText('Không còn dùng — xoá được')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Xoá tệp: promo.png' })).toBeEnabled();
    });

    it('tệp chat: nói đến từ đâu (Trợ lý AI / chat thử chatbot / web chat / Hộp thư), không hứa "tự xoá" dù có expiresAt', async () => {
      const expires = '2026-11-22T00:00:00.000Z';
      mocks.get.mockImplementation(async () => reply({
        data: [
          fileItem({ id: '1', category: 'chat', source: 'ai_assistant', displayName: 'a.docx', name: 'a.docx', expiresAt: expires, referenceType: 'chat_attachment' }),
          fileItem({ id: '2', category: 'chat', source: 'chatbot_studio', displayName: 'b.docx', name: 'b.docx', referenceType: 'chat_attachment' }),
          fileItem({ id: '3', category: 'chat', source: 'chatbot_web', displayName: 'c.docx', name: 'c.docx', referenceType: 'chat_attachment' }),
          fileItem({ id: '4', category: 'chat', source: 'inbox_outbound', displayName: 'd.docx', name: 'd.docx', referenceType: 'chat_attachment' }),
        ],
        categorySummary: allCategorySummary,
      }));
      renderPage();

      await screen.findByText('a.docx');
      const lines = screen.getAllByTestId('usage-line').map((node) => node.textContent);
      expect(lines).toEqual([
        'Từ Trợ lý AI',
        'Từ chat thử chatbot',
        'Từ web chat',
        `Từ ${viDictionary.nav.inbox}`,
      ]);
      expect(screen.queryByText(/Tự xoá ngày/)).toBeNull();
    });

    it('tệp tạm có autoDeleteAt: hiện "Tự xoá ngày dd/mm/yyyy"', async () => {
      mocks.get.mockImplementation(async () => reply({
        data: [fileItem({ category: 'temp', state: 'temp', referenceType: null, referenceId: null, autoDeleteAt: '2026-11-22T05:00:00.000Z' })],
        categorySummary: allCategorySummary,
      }));
      renderPage();

      expect(await screen.findByText(/Tự xoá ngày 22\/11\/2026/)).toBeInTheDocument();
    });

    it('M-06: ảnh xem trước nạp lười (loading="lazy")', async () => {
      mocks.get.mockImplementation(async () => reply({ data: [fileItem()], categorySummary: allCategorySummary }));
      renderPage();

      const img = await screen.findByRole('img', { name: 'promo.png' });
      expect(img).toHaveAttribute('loading', 'lazy');
    });

    it('nhân viên không có quyền xoá: không có nút xoá', async () => {
      mocks.auth.activeContext = { type: 'employee', ownerId: 3, permissions: { media_library_view: true } };
      mocks.get.mockImplementation(async () => reply({ data: [fileItem()], categorySummary: allCategorySummary }));
      renderPage();

      await screen.findByText('promo.png');
      expect(screen.queryByRole('button', { name: /Xoá tệp/ })).toBeNull();
    });
  });

  describe('xoá tệp (M-05, M-12, M-13)', () => {
    const openDeleteDialog = async (item = fileItem({ category: 'email_template', referenceType: null, referenceId: null })) => {
      mocks.get.mockImplementation(async () => reply({ data: [item], categorySummary: allCategorySummary }));
      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: `Xoá tệp: ${item.displayName}` }));
      return screen.findByRole('dialog');
    };

    it('hộp xác nhận nói sẽ có lại bao nhiêu dung lượng và tệp xoá không khôi phục được', async () => {
      const dialog = await openDeleteDialog();
      expect(dialog).toHaveTextContent('Xoá "promo.png"? Bạn sẽ có lại 3.2 MB. Tệp đã xoá không khôi phục được.');
    });

    it('xoá xong: toast "Đã xoá, có lại …", báo làm mới thanh dung lượng, tải lại danh sách', async () => {
      mocks.del.mockResolvedValueOnce({ data: { success: true, data: { sizeBytes: 3_400_000 } } });
      const quotaRefresh = vi.fn();
      const unsubscribe = subscribeStorageQuotaRefresh(quotaRefresh);
      const dialog = await openDeleteDialog();
      const before = listCalls().length;

      fireEvent.click(within(dialog).getByRole('button', { name: viDictionary.common.delete }));

      await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('Đã xoá, có lại 3.2 MB.'));
      expect(mocks.del).toHaveBeenCalledWith('/media-library/objects/31');
      await waitFor(() => expect(listCalls().length).toBe(before + 1));
      expect(quotaRefresh).toHaveBeenCalledTimes(1);
      unsubscribe();
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('409 đang dùng: toast + banner có link (react-router), câu dịch từ code — KHÔNG in message tiếng Việt của máy chủ', async () => {
      mocks.del.mockRejectedValueOnce({
        response: {
          status: 409,
          data: {
            success: false,
            code: 'STORAGE_REFERENCE_ALIVE',
            message: 'CAU_TIENG_VIET_CUA_MAY_CHU',
            data: { referenceType: 'form', referenceLabel: 'Biểu mẫu', referenceName: 'Đăng ký tư vấn', url: '/app/forms' },
          },
        },
      });
      const dialog = await openDeleteDialog();

      fireEvent.click(within(dialog).getByRole('button', { name: viDictionary.common.delete }));

      const expected = 'Tệp đang dùng ở Biểu mẫu "Đăng ký tư vấn". Gỡ tệp khỏi đó trước rồi xoá.';
      await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(expected, expect.anything()));
      expect(screen.getAllByText(expected).length).toBeGreaterThan(0);
      expect(screen.queryByText('CAU_TIENG_VIET_CUA_MAY_CHU')).toBeNull();
      const manage = screen.getByRole('link', { name: /Đi đến màn hình quản lý/ });
      expect(manage).toHaveAttribute('href', '/app/forms');
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it.each([
      ['MEDIA_NOT_FOUND', 404, 'Không tìm thấy tệp này (có thể đã được xoá). Tải lại trang để cập nhật danh sách.'],
      ['MEDIA_DELETE_FAILED', 500, 'Không thể xoá tệp'],
    ])('lỗi %s → câu dịch riêng, không lộ message máy chủ', async (code, status, expected) => {
      mocks.del.mockRejectedValueOnce({ message: 'password authentication failed', response: { status, data: { success: false, code, message: 'LO_RA' } } });
      const dialog = await openDeleteDialog();

      fireEvent.click(within(dialog).getByRole('button', { name: viDictionary.common.delete }));

      await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(expected, expect.anything()));
      expect(screen.queryByText(/LO_RA|password/)).toBeNull();
    });

    it('xoá tệp cuối của trang cuối: lùi về trang trước, không hiện "Chưa có tệp nào" kèm "2 / 1"', async () => {
      const lastOnPage2 = fileItem({ id: '99', displayName: 'cuoi.png', name: 'cuoi.png', category: 'email_template', referenceType: null, referenceId: null });
      let deleted = false;
      mocks.get.mockImplementation(async (path, { params }) => {
        if (deleted) {
          // sau khi xoá chỉ còn 24 tệp = 1 trang; trang 2 rỗng
          return params.page === 1
            ? reply({ data: [fileItem({ id: '1', displayName: 'trang-1.png', name: 'trang-1.png' })], pagination: { total: 24, page: 1, limit: 24, pages: 1 }, categorySummary: allCategorySummary })
            : reply({ data: [], pagination: { total: 24, page: 2, limit: 24, pages: 1 }, categorySummary: allCategorySummary });
        }
        return params.page === 2
          ? reply({ data: [lastOnPage2], pagination: { total: 25, page: 2, limit: 24, pages: 2 }, categorySummary: allCategorySummary })
          : reply({ data: [fileItem({ id: '1', displayName: 'trang-1.png', name: 'trang-1.png' })], pagination: { total: 25, page: 1, limit: 24, pages: 2 }, categorySummary: allCategorySummary });
      });
      mocks.del.mockImplementationOnce(async () => { deleted = true; return { data: { success: true, data: { sizeBytes: 1 } } }; });
      renderPage();
      await screen.findByText('trang-1.png');
      fireEvent.click(screen.getByRole('button', { name: viDictionary.common.next }));
      fireEvent.click(await screen.findByRole('button', { name: 'Xoá tệp: cuoi.png' }));
      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: viDictionary.common.delete }));

      expect(await screen.findByText('trang-1.png')).toBeInTheDocument();
      expect(screen.queryByText(viDictionary.mediaLibrary.empty)).toBeNull();
      expect(lastParams()).toMatchObject({ page: 1 });
    });
  });

  describe('trạng thái rỗng và lỗi (M-08, M-12)', () => {
    it('chưa có tệp nào → "Chưa có tệp nào"', async () => {
      renderPage();
      expect(await screen.findByText('Chưa có tệp nào')).toBeInTheDocument();
    });

    it('đang tìm mà không khớp → "Không có tệp nào khớp "abc"." (khác câu "chưa có tệp")', async () => {
      renderPage();
      const input = await screen.findByPlaceholderText('Tìm theo tên tệp');
      fireEvent.change(input, { target: { value: 'abc' } });

      expect(await screen.findByText('Không có tệp nào khớp "abc".', {}, { timeout: 2000 })).toBeInTheDocument();
      expect(screen.queryByText('Chưa có tệp nào')).toBeNull();
    });

    it('tải lỗi: chỉ hiện khối lỗi (dịch theo code, không lộ err.message), KHÔNG hiện "Chưa có tệp nào" cạnh nó', async () => {
      mocks.get.mockRejectedValue({ message: 'relation "storage_objects" does not exist', response: { status: 500, data: { success: false, code: 'MEDIA_LIST_FAILED', message: 'LO_RA' } } });
      renderPage();

      expect(await screen.findByRole('alert')).toHaveTextContent('Không tải được danh sách tệp');
      expect(screen.queryByText('Chưa có tệp nào')).toBeNull();
      expect(screen.queryByText(/storage_objects|LO_RA/)).toBeNull();
    });
  });
});
