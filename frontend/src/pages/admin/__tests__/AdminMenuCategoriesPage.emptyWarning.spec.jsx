/**
 * Phản hồi sếp: tạo chuyên mục menu mà không thấy hiện ở đâu — vì `adminMenuLayout.js` tự ẩn
 * mọi chuyên mục chưa gán tab khỏi menu thật (đúng luật, không sửa). Trang soạn chuyên mục trước
 * đây chỉ có dòng chữ mờ, không nói rõ hậu quả, và Lưu không cảnh báo gì. Test này khoá đúng 3
 * việc mới: badge cảnh báo trên thẻ rỗng, hộp xác nhận lúc Lưu khi có chuyên mục rỗng, và dòng
 * nhắc phạm vi dưới tab "Menu Ứng dụng (/app)".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminMenuCategoriesPage from '../AdminMenuCategoriesPage';
import viTranslations from '../../../i18n/vi';

const getNestedTranslation = (obj, path) => path.split('.').reduce((acc, part) => acc?.[part], obj);
const mockT = (key, params = {}) => {
  const val = getNestedTranslation(viTranslations, key);
  if (typeof val !== 'string') return key;
  return val.replace(/\{(\w+)\}/g, (_, p) => (params[p] != null ? params[p] : `{${p}}`));
};

vi.mock('../../../i18n', () => ({
  useI18n: () => ({ t: mockT }),
}));

vi.mock('../../../components/layout/admin/navConfig', () => ({
  superAdminMenuItems: () => [
    { key: 'settings', name: 'Cài đặt hệ thống', path: '/admin/settings', icon: () => null, defaultCategory: 'general' },
    { key: 'members', name: 'Thành viên', path: '/admin/members', icon: () => null, defaultCategory: 'general' },
  ],
  userMenuItems: () => [
    { key: 'dashboard', name: 'Trang chủ', path: '/app', icon: () => null, defaultCategory: 'general' },
    { key: 'campaigns', name: 'Chiến dịch', path: '/app/campaigns', icon: () => null, defaultCategory: 'general' },
  ],
}));

vi.mock('../../../components/layout/admin/adminMenuLayout', () => ({
  normalizeSuperAdminMenuCategories: (categories) => (Array.isArray(categories) && categories.length > 0 ? categories : []),
  normalizeAppMenuCategories: (categories) => (Array.isArray(categories) && categories.length > 0 ? categories : []),
}));

const mocks = vi.hoisted(() => ({
  getLayout: vi.fn(),
  updateLayout: vi.fn(),
  getAppLayout: vi.fn(),
  updateAppLayout: vi.fn(),
}));

vi.mock('../../../features/admin/services/adminMenuApi.service', () => ({
  default: {
    getLayout: mocks.getLayout,
    updateLayout: mocks.updateLayout,
    getAppLayout: mocks.getAppLayout,
    updateAppLayout: mocks.updateAppLayout,
  },
  ADMIN_MENU_LAYOUT_UPDATED_EVENT: 'founder-admin-menu-layout-updated',
}));

const withOneEmptyCategory = () => [
  { id: 'c1', nameVi: 'Tin tức', nameEn: 'News', itemKeys: [] },
  { id: 'c2', nameVi: 'Cài đặt', nameEn: 'Settings', itemKeys: ['settings'] },
];

const withNoEmptyCategory = () => [
  { id: 'c1', nameVi: 'Tin tức', nameEn: 'News', itemKeys: ['members'] },
  { id: 'c2', nameVi: 'Cài đặt', nameEn: 'Settings', itemKeys: ['settings'] },
];

const respond = (categories) => ({ data: { data: { categories } } });

// Đánh dấu isDirty=true mà KHÔNG đổi itemKeys/tên — bấm "Đưa chuyên mục xuống" của thẻ đầu
// (hoán vị 2 thẻ, danh sách chuyên mục rỗng để so tên vẫn giữ nguyên).
const makeDirtyWithoutChangingData = async () => {
  const moveDownButtons = await screen.findAllByLabelText('Đưa chuyên mục xuống');
  fireEvent.click(moveDownButtons[0]);
};

describe('AdminMenuCategoriesPage — cảnh báo chuyên mục rỗng + nhắc phạm vi', () => {
  let confirmSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    confirmSpy = vi.spyOn(window, 'confirm');
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  it('chuyên mục chưa gán tab: hiện badge cảnh báo "sẽ không hiện trong menu"', async () => {
    mocks.getLayout.mockResolvedValue(respond(withOneEmptyCategory()));
    render(<AdminMenuCategoriesPage />);

    expect(await screen.findByText('Sẽ không hiện trong menu')).toBeInTheDocument();
    // Dòng chữ trong thẻ cũng phải nói rõ hậu quả, không chỉ "chưa có tab nào".
    expect(screen.getByText(/sẽ KHÔNG hiện trong menu/)).toBeInTheDocument();
  });

  it('bấm Lưu khi có chuyên mục rỗng: hộp xác nhận nêu đúng tên chuyên mục; Huỷ → không gọi API', async () => {
    mocks.getLayout.mockResolvedValue(respond(withOneEmptyCategory()));
    confirmSpy.mockReturnValue(false);
    render(<AdminMenuCategoriesPage />);
    await makeDirtyWithoutChangingData();

    const saveBtn = screen.getByRole('button', { name: 'Lưu' });
    expect(saveBtn).not.toBeDisabled();
    fireEvent.click(saveBtn);

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toContain('Tin tức');
    expect(mocks.updateLayout).not.toHaveBeenCalled();
  });

  it('xác nhận Lưu (đồng ý ở hộp xác nhận): gọi API updateLayout như cũ', async () => {
    mocks.getLayout.mockResolvedValue(respond(withOneEmptyCategory()));
    mocks.updateLayout.mockResolvedValue(respond(withOneEmptyCategory()));
    confirmSpy.mockReturnValue(true);
    render(<AdminMenuCategoriesPage />);
    await makeDirtyWithoutChangingData();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mocks.updateLayout).toHaveBeenCalledTimes(1));
  });

  it('mọi chuyên mục đều có tab: Lưu ngay, KHÔNG hiện hộp xác nhận', async () => {
    mocks.getLayout.mockResolvedValue(respond(withNoEmptyCategory()));
    mocks.updateLayout.mockResolvedValue(respond(withNoEmptyCategory()));
    render(<AdminMenuCategoriesPage />);
    await makeDirtyWithoutChangingData();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(confirmSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.updateLayout).toHaveBeenCalledTimes(1));
  });

  it('tab "Menu Ứng dụng (/app)": có dòng nhắc phạm vi; tab "Menu Quản trị" thì không', async () => {
    mocks.getLayout.mockResolvedValue(respond(withNoEmptyCategory()));
    mocks.getAppLayout.mockResolvedValue(respond(withNoEmptyCategory()));
    render(<AdminMenuCategoriesPage />);
    await screen.findAllByDisplayValue('Tin tức');

    expect(screen.queryByText(/Tài khoản super admin không thấy menu này/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Menu Ứng dụng (/app)' }));

    expect(await screen.findByText(/Tài khoản super admin không thấy menu này/)).toBeInTheDocument();
  });
});
