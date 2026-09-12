import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../i18n';
import Sidebar from './Sidebar';

const { mockGetLayout, authState } = vi.hoisted(() => ({
  mockGetLayout: vi.fn(),
  authState: {
    user: { role: 'admin', username: 'superadmin' },
    activeContext: { type: 'self' },
  },
}));

vi.mock('../../../stores/authStore', () => ({
  useAuthStore: () => authState,
}));

vi.mock('../../../hooks/useScrollPersistence', () => ({
  useScrollPersistence: vi.fn(),
}));

vi.mock('../../../features/admin/services/adminMenuApi.service', () => ({
  ADMIN_MENU_LAYOUT_UPDATED_EVENT: 'founder-admin-menu-layout-updated',
  default: { getLayout: mockGetLayout },
}));

describe('Sidebar super admin menu layout', () => {
  beforeEach(() => {
    localStorage.clear();
    mockGetLayout.mockResolvedValue({
      data: {
        data: {
          categories: [{
            id: 'priority',
            nameVi: 'Ưu tiên',
            nameEn: 'Priority',
            itemKeys: ['orders', 'dashboard'],
          }],
        },
      },
    });
  });

  it('đọc cấu hình đã lưu và hiển thị tab theo đúng thứ tự', async () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <I18nProvider>
          <Sidebar isOpen isMobile={false} onToggle={vi.fn()} />
        </I18nProvider>
      </MemoryRouter>
    );

    const categoryButton = await screen.findByRole('button', { name: 'Ưu tiên' });
    fireEvent.click(categoryButton);

    await waitFor(() => {
      const links = screen.getAllByRole('link');
      expect(links[0]).toHaveAttribute('href', '/admin/orders');
      expect(links[1]).toHaveAttribute('href', '/admin');
    });

    act(() => {
      window.dispatchEvent(new CustomEvent('founder-admin-menu-layout-updated', {
        detail: {
          categories: [{
            id: 'operations',
            nameVi: 'Vận hành',
            nameEn: 'Operations',
            itemKeys: ['dashboard', 'orders'],
          }],
        },
      }));
    });

    expect(screen.getByRole('button', { name: 'Vận hành' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Đơn hàng' })).not.toBeInTheDocument();
  });
});

/**
 * PR-1 (PLAN_MENU_CHUYEN_MUC_APP_2026-09-12) — menu khách /app nay dựng qua groupAppMenuItems
 * (làm phẳng navConfig.jsx:userMenuItems + DEFAULT_APP_MENU_CATEGORIES), thay vì trả thẳng
 * cây hai tầng cũ. Nghiệm thu là "không đổi một pixel"; ca quan trọng nhất là ca thứ hai dưới
 * đây — chứng minh 26 cổng permission/ownerOnly/flag không bị rơi khi làm phẳng.
 */
describe('Sidebar — menu khách /app (PR-1 làm phẳng + groupAppMenuItems)', () => {
  const renderAppSidebar = (initialEntry = '/app') =>
    render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <I18nProvider>
          <Sidebar isOpen isMobile={false} onToggle={vi.fn()} />
        </I18nProvider>
      </MemoryRouter>
    );

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('chủ tài khoản (không giới hạn quyền): 3 mục không tiêu đề rồi 6 nhóm, đúng thứ tự đúng tên', () => {
    authState.user = { role: 'user', username: 'owner1', fullName: 'Chủ TK' };
    authState.activeContext = { type: 'self' };
    // Nhóm "Quản trị" (admin_cluster) có 4 mục, cả 4 đều sau một VITE_FEATURE_* — cần bật ít
    // nhất một để nhóm không rỗng (nếu không, đúng hành vi hôm nay là nhóm ẨN, không phải bug).
    vi.stubEnv('VITE_FEATURE_COURSES', 'true');

    renderAppSidebar();

    const nav = screen.getByRole('navigation');
    const titles = within(nav).getAllByRole('button').map((b) => b.getAttribute('title'));

    // 3 mục lá "main" (không tiêu đề nhóm) LUÔN đứng trước, rồi đúng 6 nhóm theo thứ tự
    // DEFAULT_APP_MENU_CATEGORIES — khớp bảng nghiệm thu "3 mục không tiêu đề, rồi 6 nhóm".
    // affiliate_program dồn lên cùng main (đã xác nhận với sếp 12/09 — xem adminMenuLayout.js).
    expect(titles).toEqual([
      'Trợ lý AI', 'Tổng quan', 'Chương trình đối tác',
      'AI Chatbot', 'Chiến dịch', 'Landing page', 'Quản trị', 'Gói & Thanh toán', 'Cài đặt',
    ]);
  });

  // Ca chủ tài khoản ở trên chỉ khẳng định 9 TIÊU ĐỀ cấp 1 — nó không thấy mục nào nằm trong
  // nhóm nào. Đột biến kiểm chứng 12/09: đổi `defaultCategory` của `customers` từ 'campaigns'
  // sang 'settings' thì toàn bộ 9/9 ca VẪN XANH, dù menu của mọi khách đã đổi. Ca dưới bịt đúng
  // chỗ đó: nó ghim thành phần con của từng nhóm, là thứ `groupAppMenuItems` thật sự quyết định.
  it('mỗi nhóm chứa ĐÚNG những mục của nó — ghim defaultCategory, không chỉ ghim tiêu đề', () => {
    authState.user = { role: 'user', username: 'owner2', fullName: 'Chủ TK' };
    authState.activeContext = { type: 'self' };
    vi.stubEnv('VITE_FEATURE_COURSES', 'true');
    vi.stubEnv('VITE_FEATURE_ORDERS', 'true');
    vi.stubEnv('VITE_FEATURE_LANDING_CMS', 'true');

    renderAppSidebar();

    // Nhãn lấy nguyên văn từ vi.js (nav.*) — đừng gõ tay, sai chính tả là đỏ giả.
    const expected = {
      'AI Chatbot': ['Tạo AI Chatbot', 'Lịch sử trò chuyện', 'Thư viện media'],
      'Chiến dịch': [
        'Gửi nhanh', 'Quản lý kênh gửi', 'Thư viện nội dung', 'Quản lý chiến dịch',
        'Hiệu quả chiến dịch', 'Khách hàng từ chiến dịch',
      ],
      'Landing page': ['Khách hàng từ Landing page', 'Tạo Landing page'],
      'Quản trị': ['Khóa học nổi bật', 'Đánh giá', 'Quản lý khóa học', 'Đơn hàng'],
      'Gói & Thanh toán': ['Tổng quan gói', 'Mua thêm hạn mức'],
      'Cài đặt': ['Hồ sơ doanh nghiệp', 'Nhân viên', 'Nhật ký hoạt động'],
    };

    for (const [groupTitle, children] of Object.entries(expected)) {
      fireEvent.click(screen.getByRole('button', { name: groupTitle }));
      const linkNames = screen.getAllByRole('link').map((l) => l.textContent);
      expect({ [groupTitle]: linkNames }).toEqual({ [groupTitle]: children });
      // Đóng lại trước khi mở nhóm kế — getAllByRole('link') lấy cả submenu đang mở.
      fireEvent.click(screen.getByRole('button', { name: groupTitle }));
    }
  });

  it('QUAN TRỌNG NHẤT — nhân viên chỉ có quyền campaigns_view: chỉ nhóm Chiến dịch, đúng 2 mục', () => {
    authState.user = { role: 'user', username: 'emp1', fullName: 'Nhân viên A' };
    authState.activeContext = { type: 'employee', permissions: { campaigns_view: true } };

    renderAppSidebar();

    const nav = screen.getByRole('navigation');
    const buttons = within(nav).getAllByRole('button');
    const titles = buttons.map((b) => b.getAttribute('title'));

    // Không có bất kỳ nhóm/mục nào khác rò ra — đúng 3 nút: 2 mục main không gate
    // (ai_assistant/dashboard, không đổi hành vi cũ) + duy nhất 1 nhóm "Chiến dịch".
    expect(titles).toEqual(['Trợ lý AI', 'Tổng quan', 'Chiến dịch']);

    const campaignsButton = screen.getByRole('button', { name: 'Chiến dịch' });
    fireEvent.click(campaignsButton);

    const links = screen.getAllByRole('link');
    const linkNames = links.map((l) => l.textContent);
    // ĐÚNG 2 mục — không phải quick_send/channel_management/message_templates/
    // customers (mỗi mục đó cần một permission khác mà nhân viên này không có).
    expect(linkNames).toEqual(['Quản lý chiến dịch', 'Hiệu quả chiến dịch']);
  });

  it('VITE_FEATURE_COURSES khác \'true\' — mục "Quản lý khoá học" không hiện (nhóm Quản trị ẩn hẳn)', () => {
    authState.user = { role: 'user', username: 'owner1', fullName: 'Chủ TK' };
    authState.activeContext = { type: 'self' };
    // Không stub gì — VITE_FEATURE_COURSES/LANDING_CMS/ORDERS đều mặc định KHÔNG phải 'true'
    // trong môi trường test, đúng ca "tắt cờ" của bảng nghiệm thu.

    renderAppSidebar();

    expect(screen.queryByRole('button', { name: 'Quản trị' })).not.toBeInTheDocument();
    expect(screen.queryByText('Quản lý khoá học')).not.toBeInTheDocument();
  });

  it('vào /app/campaigns/123/builder — nhóm Chiến dịch vẫn được highlight (dấu hiệu active mới: data-active="true", vạch cam, aria-expanded="true")', () => {
    authState.user = { role: 'user', username: 'owner1', fullName: 'Chủ TK' };
    authState.activeContext = { type: 'self' };

    renderAppSidebar('/app/campaigns/123/builder');

    const campaignsButton = screen.getByRole('button', { name: 'Chiến dịch' });
    expect(campaignsButton).toHaveAttribute('data-menu-level', 'group');
    expect(campaignsButton).toHaveAttribute('data-active', 'true');
    expect(campaignsButton).toHaveAttribute('aria-expanded', 'true');
    expect(campaignsButton.className).toContain('before:bg-orange-500');
    expect(campaignsButton.className.split(' ')).not.toContain('bg-orange-50');
  });

  // ── 4 ca test PR-3 (mục 6 việc 5) ──────────────────────────────────────────
  it('render tại /app/campaigns — nhóm Chiến dịch tự mở, link "Quản lý chiến dịch" có sẵn với aria-current="page"', () => {
    authState.user = { role: 'user', username: 'owner1', fullName: 'Chủ TK' };
    authState.activeContext = { type: 'self' };

    renderAppSidebar('/app/campaigns');

    const campaignManageLink = screen.getByRole('link', { name: 'Quản lý chiến dịch' });
    expect(campaignManageLink).toBeInTheDocument();
    expect(campaignManageLink).toHaveAttribute('aria-current', 'page');
    expect(campaignManageLink).toHaveAttribute('data-menu-level', 'item');
  });

  it('bấm tiêu đề "Chiến dịch" — accordion đóng lại (link biến mất), bấm lại thì mở ra', () => {
    authState.user = { role: 'user', username: 'owner1', fullName: 'Chủ TK' };
    authState.activeContext = { type: 'self' };

    renderAppSidebar('/app/campaigns');

    const campaignsGroupButton = screen.getByRole('button', { name: 'Chiến dịch' });
    expect(screen.getByRole('link', { name: 'Quản lý chiến dịch' })).toBeInTheDocument();

    // Bấm đóng
    fireEvent.click(campaignsGroupButton);
    expect(screen.queryByRole('link', { name: 'Quản lý chiến dịch' })).not.toBeInTheDocument();

    // Bấm lại để mở
    fireEvent.click(campaignsGroupButton);
    expect(screen.getByRole('link', { name: 'Quản lý chiến dịch' })).toBeInTheDocument();
  });

  it('render tại /app/settings/employees — chỉ nhóm "Cài đặt" mở, nhóm "Chiến dịch" đóng', () => {
    authState.user = { role: 'user', username: 'owner1', fullName: 'Chủ TK' };
    authState.activeContext = { type: 'self' };

    renderAppSidebar('/app/settings/employees');

    expect(screen.getByRole('link', { name: 'Nhân viên' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Quản lý chiến dịch' })).not.toBeInTheDocument();
  });

  it('tiêu đề nhóm có data-menu-level="group" và aria-expanded phản ánh đúng trạng thái mở/đóng', () => {
    authState.user = { role: 'user', username: 'owner1', fullName: 'Chủ TK' };
    authState.activeContext = { type: 'self' };

    renderAppSidebar('/app/campaigns');

    const campaignsButton = screen.getByRole('button', { name: 'Chiến dịch' });
    const settingsButton = screen.getByRole('button', { name: 'Cài đặt' });

    expect(campaignsButton).toHaveAttribute('data-menu-level', 'group');
    expect(campaignsButton).toHaveAttribute('aria-expanded', 'true');

    expect(settingsButton).toHaveAttribute('data-menu-level', 'group');
    expect(settingsButton).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(campaignsButton);
    expect(campaignsButton).toHaveAttribute('aria-expanded', 'false');
  });
});
