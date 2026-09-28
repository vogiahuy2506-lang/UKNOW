import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../i18n';
import AdminMenuCategoriesPage from '../AdminMenuCategoriesPage';

/**
 * PLAN_CHUYEN_MUC_LINK_NGOAI_2026-09-28, Việc 4 — trang admin thêm/sửa/xoá link ngoài.
 * File riêng (không nhét vào AdminMenuCategoriesPage.spec.jsx) để không phình case cũ.
 */
const {
  mockGetLayout,
  mockUpdateLayout,
  mockGetAppLayout,
  mockUpdateAppLayout,
} = vi.hoisted(() => ({
  mockGetLayout: vi.fn(),
  mockUpdateLayout: vi.fn(),
  mockGetAppLayout: vi.fn(),
  mockUpdateAppLayout: vi.fn(),
}));

vi.mock('../../../features/admin/services/adminMenuApi.service', () => ({
  ADMIN_MENU_LAYOUT_UPDATED_EVENT: 'founder-admin-menu-layout-updated',
  default: {
    getLayout: mockGetLayout,
    updateLayout: mockUpdateLayout,
    getAppLayout: mockGetAppLayout,
    updateAppLayout: mockUpdateAppLayout,
  },
}));

async function openAppTab() {
  render(
    <I18nProvider>
      <AdminMenuCategoriesPage />
    </I18nProvider>
  );
  expect(await screen.findByText('Chuyên mục menu quản trị')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Menu Ứng dụng (/app)' }));
  await waitFor(() => expect(mockGetAppLayout).toHaveBeenCalledTimes(1));
  await screen.findAllByText('Thêm link ngoài (YouTube/link bất kỳ)');
}

describe('AdminMenuCategoriesPage — link ngoài (scope app_user)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockGetLayout.mockResolvedValue({ data: { data: { categories: [] } } });
    mockUpdateLayout.mockImplementation((categories) => Promise.resolve({ data: { data: { categories } } }));
    mockGetAppLayout.mockResolvedValue({
      data: {
        data: {
          categories: [
            { id: 'main', nameVi: 'Mục chính (không tiêu đề)', nameEn: 'Main (untitled)', itemKeys: ['ai_assistant'] },
            { id: 'guides', nameVi: 'Hướng dẫn', nameEn: 'Guides', itemKeys: [] },
          ],
          links: [],
        },
      },
    });
    mockUpdateAppLayout.mockImplementation((categories, links) => Promise.resolve({
      data: { data: { categories, links } },
    }));
  });

  it('thêm link -> Lưu gửi đúng payload links + key nằm trong itemKeys của chuyên mục đã chọn', async () => {
    await openAppTab();

    const forms = screen.getAllByPlaceholderText('Tên link (VD: Link hướng dẫn)');
    // 2 chuyên mục -> 2 form "Thêm link"; form thứ hai gắn với "Hướng dẫn".
    const guidesForm = forms[1];
    fireEvent.change(guidesForm, { target: { value: 'Link hướng dẫn' } });
    fireEvent.change(screen.getAllByPlaceholderText('https://youtube.com/...')[1], {
      target: { value: 'https://youtu.be/abc' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Thêm link' })[1]);

    // Sau khi thêm, input Tên link phải trở lại rỗng.
    expect(screen.getAllByPlaceholderText('Tên link (VD: Link hướng dẫn)')[1].value).toBe('');
    expect(screen.getByDisplayValue('Link hướng dẫn')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(mockUpdateAppLayout).toHaveBeenCalledTimes(1));
    const [savedCategories, savedLinks] = mockUpdateAppLayout.mock.calls[0];
    const guidesCategory = savedCategories.find((c) => c.id === 'guides');
    expect(savedLinks).toHaveLength(1);
    expect(guidesCategory.itemKeys).toEqual([savedLinks[0].key]);
    expect(savedLinks[0]).toMatchObject({ nameVi: 'Link hướng dẫn', url: 'https://youtu.be/abc', categoryId: 'guides' });
  });

  it('thiếu "://" -> tự thêm https:// trước khi kiểm; URL không an toàn -> báo lỗi, KHÔNG thêm', async () => {
    await openAppTab();

    // Thiếu scheme -> tự thêm https://
    fireEvent.change(screen.getAllByPlaceholderText('Tên link (VD: Link hướng dẫn)')[0], {
      target: { value: 'Trang chủ' },
    });
    fireEvent.change(screen.getAllByPlaceholderText('https://youtube.com/...')[0], {
      target: { value: 'example.com/x' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Thêm link' })[0]);
    expect(screen.getByDisplayValue('https://example.com/x')).toBeInTheDocument();

    // URL không an toàn -> không thêm, input giữ nguyên (không bị xoá)
    fireEvent.change(screen.getAllByPlaceholderText('Tên link (VD: Link hướng dẫn)')[0], {
      target: { value: 'Xấu' },
    });
    fireEvent.change(screen.getAllByPlaceholderText('https://youtube.com/...')[0], {
      target: { value: 'javascript:alert(1)' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Thêm link' })[0]);
    // Thêm KHÔNG thành công -> chỉ có đúng 1 chỗ hiện "Xấu" (ô form còn giữ nguyên input của
    // người dùng, không bị xoá) — nếu addLink lỡ vẫn thêm thành công thì sẽ có THÊM một hàng
    // link mới cũng hiện "Xấu", tổng thành 2.
    expect(screen.getAllByDisplayValue('Xấu')).toHaveLength(1);
  });

  it('xoá link -> mất khỏi cả danh sách hiển thị VÀ payload lưu (links + itemKeys)', async () => {
    mockGetAppLayout.mockResolvedValue({
      data: {
        data: {
          categories: [
            { id: 'main', nameVi: 'Mục chính (không tiêu đề)', nameEn: 'Main (untitled)', itemKeys: ['ai_assistant', 'link-a'] },
          ],
          links: [
            { key: 'link-a', nameVi: 'Link A', nameEn: 'Link A EN', url: 'https://a.vn', categoryId: 'main' },
          ],
        },
      },
    });

    await openAppTab();
    expect(screen.getByDisplayValue('Link A')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Xoá link' }));
    expect(screen.queryByDisplayValue('Link A')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(mockUpdateAppLayout).toHaveBeenCalledTimes(1));
    const [savedCategories, savedLinks] = mockUpdateAppLayout.mock.calls[0];
    expect(savedLinks).toEqual([]);
    // KHÔNG so sánh toEqual nguyên mảng: các tab mặc định khác (dashboard, products, ...) không
    // có chuyên mục nào khớp defaultCategory trong bố cục rút gọn của test này nên tự rơi về
    // 'main' (luật "tab mồ côi" của normalizeAppMenuCategories) — chỉ cần khẳng định link-a đã
    // biến mất khỏi itemKeys, không phải itemKeys chỉ còn đúng 1 phần tử.
    expect(savedCategories.find((c) => c.id === 'main').itemKeys).not.toContain('link-a');
  });

  it('chuyển chuyên mục qua dropdown -> categoryId của link trong payload đổi theo', async () => {
    mockGetAppLayout.mockResolvedValue({
      data: {
        data: {
          categories: [
            { id: 'main', nameVi: 'Mục chính (không tiêu đề)', nameEn: 'Main (untitled)', itemKeys: ['ai_assistant', 'link-a'] },
            { id: 'guides', nameVi: 'Hướng dẫn', nameEn: 'Guides', itemKeys: [] },
          ],
          links: [
            { key: 'link-a', nameVi: 'Link A', nameEn: 'Link A EN', url: 'https://a.vn', categoryId: 'main' },
          ],
        },
      },
    });

    await openAppTab();

    const select = screen.getByRole('combobox', { name: 'Chuyên mục của Link A' });
    const guidesOption = Array.from(select.options).find((option) => option.textContent === 'Hướng dẫn');
    fireEvent.change(select, { target: { value: guidesOption.value } });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(mockUpdateAppLayout).toHaveBeenCalledTimes(1));
    const [savedCategories, savedLinks] = mockUpdateAppLayout.mock.calls[0];
    expect(savedLinks[0].categoryId).toBe('guides');
    expect(savedCategories.find((c) => c.id === 'guides').itemKeys).toContain('link-a');
    expect(savedCategories.find((c) => c.id === 'main').itemKeys).not.toContain('link-a');
  });

  it('sửa tên/URL trực tiếp trên hàng link -> phản ánh vào payload lưu', async () => {
    mockGetAppLayout.mockResolvedValue({
      data: {
        data: {
          categories: [
            { id: 'main', nameVi: 'Mục chính (không tiêu đề)', nameEn: 'Main (untitled)', itemKeys: ['ai_assistant', 'link-a'] },
          ],
          links: [
            { key: 'link-a', nameVi: 'Link A', nameEn: 'Link A EN', url: 'https://a.vn', categoryId: 'main' },
          ],
        },
      },
    });

    await openAppTab();

    fireEvent.change(screen.getByDisplayValue('Link A'), { target: { value: 'Link A Đổi Tên' } });
    fireEvent.change(screen.getByDisplayValue('https://a.vn'), { target: { value: 'https://b.vn' } });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(mockUpdateAppLayout).toHaveBeenCalledTimes(1));
    const [, savedLinks] = mockUpdateAppLayout.mock.calls[0];
    expect(savedLinks[0]).toMatchObject({ nameVi: 'Link A Đổi Tên', url: 'https://b.vn' });
  });

  it('Khôi phục mặc định (scope app) -> links về rỗng', async () => {
    mockGetAppLayout.mockResolvedValue({
      data: {
        data: {
          categories: [
            { id: 'main', nameVi: 'Mục chính (không tiêu đề)', nameEn: 'Main (untitled)', itemKeys: ['ai_assistant', 'link-a'] },
          ],
          links: [
            { key: 'link-a', nameVi: 'Link A', nameEn: 'Link A EN', url: 'https://a.vn', categoryId: 'main' },
          ],
        },
      },
    });

    await openAppTab();
    expect(screen.getByDisplayValue('Link A')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Khôi phục mặc định' }));
    expect(screen.queryByDisplayValue('Link A')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(mockUpdateAppLayout).toHaveBeenCalledTimes(1));
    const [, savedLinks] = mockUpdateAppLayout.mock.calls[0];
    expect(savedLinks).toEqual([]);
  });
});
