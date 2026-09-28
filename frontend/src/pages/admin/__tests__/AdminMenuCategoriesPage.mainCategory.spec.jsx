import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../i18n';
import AdminMenuCategoriesPage from '../AdminMenuCategoriesPage';

/**
 * Khối `main` của menu khách là CẤP 1 (groupAppMenuItems trải thẳng các mục, không tiêu đề nhóm) —
 * tên của nó không bao giờ hiện cho khách. Production 28/09 đặt tên khối này là "Test" và trang admin vẽ
 * nó y như nhóm thường (ô sửa tên + nút xoá) nên sếp tưởng đó là một nhóm tên "Test".
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

const MAIN_TITLE = 'Mục cấp 1 — không thuộc nhóm nào';

// 'Hướng dẫn' khớp cả ô tên nhóm lẫn ô <select> đang chọn nhóm đó — lấy đúng ô <input>.
const guidesNameInput = () => screen.getAllByDisplayValue('Hướng dẫn').find((element) => element.tagName === 'INPUT');

describe('AdminMenuCategoriesPage — khối cấp 1 (main) ở menu khách', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockGetLayout.mockResolvedValue({ data: { data: { categories: [] } } });
    mockUpdateLayout.mockImplementation((categories) => Promise.resolve({ data: { data: { categories } } }));
    mockGetAppLayout.mockResolvedValue({
      data: {
        data: {
          categories: [
            { id: 'main', nameVi: 'Test', nameEn: 'Main (untitled)', itemKeys: ['ai_assistant'] },
            { id: 'guides', nameVi: 'Hướng dẫn', nameEn: 'Guides', itemKeys: ['dashboard'] },
          ],
          links: [],
        },
      },
    });
    mockUpdateAppLayout.mockImplementation((categories, links) => Promise.resolve({
      data: { data: { categories, links } },
    }));
  });

  it('khối main hiện tiêu đề cố định, không có ô sửa tên và không có nút xoá; nhóm thường vẫn như cũ', async () => {
    await openAppTab();

    const mainSection = screen.getByText(MAIN_TITLE, { selector: 'p' }).closest('section');
    expect(mainSection).not.toBeNull();
    expect(within(mainSection).queryByDisplayValue('Test')).toBeNull();
    expect(within(mainSection).queryByRole('button', { name: 'Xóa' })).toBeNull();

    const guidesSection = guidesNameInput().closest('section');
    expect(within(guidesSection).getByRole('button', { name: 'Xóa' })).toBeInTheDocument();
  });

  it('ô chuyển chuyên mục gọi khối main bằng tiêu đề cố định, không bằng tên "Test"', async () => {
    await openAppTab();

    const guidesSection = guidesNameInput().closest('section');
    const select = within(guidesSection).getByRole('combobox');
    const optionLabels = within(select).getAllByRole('option').map((option) => option.textContent);
    expect(optionLabels).toContain(MAIN_TITLE);
    expect(optionLabels).not.toContain('Test');
  });

  it('lưu vẫn giữ nguyên tên gốc của khối main (backend bắt buộc nameVi không rỗng)', async () => {
    await openAppTab();

    // Nút Lưu chỉ bật khi có thay đổi — đổi tên nhóm thường để có một thay đổi thật.
    fireEvent.change(guidesNameInput(), { target: { value: 'Hướng dẫn sử dụng' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(mockUpdateAppLayout).toHaveBeenCalledTimes(1));
    const [savedCategories] = mockUpdateAppLayout.mock.calls[0];
    expect(savedCategories.find((category) => category.id === 'main')).toMatchObject({ nameVi: 'Test' });
  });
});
