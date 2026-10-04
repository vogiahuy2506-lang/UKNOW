import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../i18n';
import Sidebar from './Sidebar';

const { mockGetLayout, mockGetUserAppMenuLayout, authState } = vi.hoisted(() => ({
  mockGetLayout: vi.fn(),
  mockGetUserAppMenuLayout: vi.fn(),
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
  default: {
    getLayout: mockGetLayout,
    getUserAppMenuLayout: mockGetUserAppMenuLayout,
  },
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
    if (categoryButton.getAttribute('aria-expanded') !== 'true') {
      fireEvent.click(categoryButton);
    }

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

    const operationsButton = screen.getByRole('button', { name: 'Vận hành' });
    expect(operationsButton).toBeInTheDocument();
    // Review Claude 13/09: đang đứng ở /admin (dashboard) và bố cục mới xếp dashboard vào
    // "Vận hành" → nhóm đó phải TỰ MỞ sau khi lưu (cùng luật PR-3), không đóng hết như trước.
    expect(operationsButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Đơn hàng' })).toBeInTheDocument();
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
    mockGetUserAppMenuLayout.mockResolvedValue({ data: { data: { categories: [] } } });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('chủ tài khoản (không giới hạn quyền): 4 mục không tiêu đề rồi 5 nhóm, đúng thứ tự đúng tên', () => {
    authState.user = { role: 'user', username: 'owner1', fullName: 'Chủ TK' };
    authState.activeContext = { type: 'self' };

    renderAppSidebar();

    const nav = screen.getByRole('navigation');
    const titles = within(nav).getAllByRole('button').map((b) => b.getAttribute('title'));

    // 4 mục lá "main" (không tiêu đề nhóm) LUÔN đứng trước, rồi đúng 5 nhóm theo thứ tự
    // DEFAULT_APP_MENU_CATEGORIES (cụm "Quản trị" đã được ẩn, "Sản phẩm" hiển thị thành mục độc lập).
    expect(titles).toEqual([
      'Trợ lý AI', 'Báo cáo', 'Sản phẩm', 'Chương trình đối tác',
      'AI Chatbot', 'Chiến dịch', 'Landing page', 'Gói & Thanh toán', 'Cài đặt',
    ]);
  });

  // Ca chủ tài khoản ở trên chỉ khẳng định TIÊU ĐỀ cấp 1 — nó không thấy mục nào nằm trong
  // nhóm nào. Đột biến kiểm chứng 12/09: đổi `defaultCategory` của `customers` từ 'campaigns'
  // sang 'settings' thì toàn bộ ca VẪN XANH, dù menu của mọi khách đã đổi. Ca dưới bịt đúng
  // chỗ đó: nó ghim thành phần con của từng nhóm, là thứ `groupAppMenuItems` thật sự quyết định.
  it('mỗi nhóm chứa ĐÚNG những mục của nó — ghim defaultCategory, không chỉ ghim tiêu đề', () => {
    authState.user = { role: 'user', username: 'owner2', fullName: 'Chủ TK' };
    authState.activeContext = { type: 'self' };

    renderAppSidebar();

    // Nhãn lấy nguyên văn từ vi.js (nav.*) — đừng gõ tay, sai chính tả là đỏ giả.
    const expected = {
      'AI Chatbot': ['Chatbot của tôi', 'Lịch sử trò chuyện'],
      'Chiến dịch': [
        'Gửi nhanh', 'Quản lý kênh gửi', 'Thư viện nội dung', 'Quản lý chiến dịch',
        'Giám sát gửi tin', 'Khách hàng từ chiến dịch',
      ],
      'Landing page': ['Khách hàng từ Landing page', 'Tạo Landing page', 'Biểu mẫu'],
      'Gói & Thanh toán': ['Tổng quan gói', 'Mua thêm hạn mức'],
      'Cài đặt': ['Hồ sơ doanh nghiệp', 'Nhân viên', 'Tệp & dung lượng', 'Nhật ký hoạt động'],
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

    // Không có bất kỳ nhóm/mục nào khác rò ra — đúng 2 nút: mục main không gate (Trợ lý AI) + duy nhất 1
    // nhóm "Chiến dịch". "Báo cáo" (menu /app/reports, trước 30/09 ghi "Tổng quan") từng hiện ở đây dù route /app/reports đòi reports_view (nhân viên bấm
    // vào là bị chặn) — PLAN_NHAN_VIEN PR-3 mục 5 (P2) đã gắn permission reports_view cho mục này.
    expect(titles).toEqual(['Trợ lý AI', 'Chiến dịch']);

    const campaignsButton = screen.getByRole('button', { name: 'Chiến dịch' });
    fireEvent.click(campaignsButton);

    const links = screen.getAllByRole('link');
    const linkNames = links.map((l) => l.textContent);
    // ĐÚNG 2 mục — không phải quick_send/channel_management/message_templates/
    // customers (mỗi mục đó cần một permission khác mà nhân viên này không có).
    expect(linkNames).toEqual(['Quản lý chiến dịch', 'Giám sát gửi tin']);
  });

  // PLAN_NHAN_VIEN PR-3 mục 5 (P2): 3 mục AI Chatbot từng `ownerOnly` dù route + backend cho nhân viên có
  // quyền chatbots_manage / inbox_view / media_library_view → chủ tick 7 ô quyền mà nhân viên không bao giờ
  // thấy mục menu. Ngược lại "Báo cáo" không gắn quyền nên ai cũng thấy một mục bấm vào là bị chặn.
  describe('nhân viên: menu theo đúng quyền (P2)', () => {
    const employeeTitles = (permissions) => {
      authState.user = { role: 'user', username: 'emp2', fullName: 'Nhân viên B' };
      authState.activeContext = { type: 'employee', permissions };
      renderAppSidebar();
      const nav = screen.getByRole('navigation');
      return within(nav).getAllByRole('button').map((b) => b.getAttribute('title'));
    };
    const openGroupLinks = (groupTitle) => {
      fireEvent.click(screen.getByRole('button', { name: groupTitle }));
      return screen.getAllByRole('link').map((l) => l.textContent);
    };

    it('không có quyền nào: chỉ còn "Trợ lý AI" — không có "Báo cáo", không nhóm nào', () => {
      expect(employeeTitles({})).toEqual(['Trợ lý AI']);
    });

    it('reports_view → hiện "Báo cáo" (tên menu = tiêu đề trang /app/reports)', () => {
      expect(employeeTitles({ reports_view: true })).toEqual(['Trợ lý AI', 'Báo cáo']);
    });

    it('inbox_view → nhóm AI Chatbot chỉ có "Lịch sử trò chuyện"', () => {
      expect(employeeTitles({ inbox_view: true })).toEqual(['Trợ lý AI', 'AI Chatbot']);
      expect(openGroupLinks('AI Chatbot')).toEqual(['Lịch sử trò chuyện']);
    });

    it('chatbots_manage → chỉ "Chatbot của tôi"', () => {
      employeeTitles({ chatbots_manage: true });
      expect(openGroupLinks('AI Chatbot')).toEqual(['Chatbot của tôi']);
    });

    // 04/10/2026: "Thư viện media" đổi tên "Tệp & dung lượng" và chuyển từ nhóm AI Chatbot sang Cài đặt — nhưng vẫn gắn đúng
    // quyền media_library_view (nhân viên có quyền này thấy nhóm Cài đặt với ĐÚNG một mục, không thấy Hồ sơ/Nhân viên/Nhật ký).
    it('media_library_view → nhóm Cài đặt chỉ có "Tệp & dung lượng"', () => {
      expect(employeeTitles({ media_library_view: true })).toEqual(['Trợ lý AI', 'Cài đặt']);
      expect(openGroupLinks('Cài đặt')).toEqual(['Tệp & dung lượng']);
    });

    it('quyền sai chỗ không mở nhầm mục: inbox_reply đơn lẻ (không có inbox_view) không hiện "Lịch sử trò chuyện"', () => {
      expect(employeeTitles({ inbox_reply: true })).toEqual(['Trợ lý AI']);
    });

    it('courses → hiện "Sản phẩm"', () => {
      expect(employeeTitles({ courses: true })).toEqual(['Trợ lý AI', 'Sản phẩm']);
    });
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

  it('đọc cấu hình app đổi tên "Chiến dịch" thành "Marketing" thì tiêu đề nhóm đổi mà nhân viên campaigns_view vẫn chỉ thấy 2 mục', async () => {
    authState.user = { role: 'user', username: 'emp1', fullName: 'Nhân viên A' };
    authState.activeContext = { type: 'employee', permissions: { campaigns_view: true } };

    mockGetUserAppMenuLayout.mockResolvedValue({
      data: {
        data: {
          categories: [
            { id: 'main', nameVi: 'Mục chính (không tiêu đề)', nameEn: 'Main (untitled)', itemKeys: ['ai_assistant', 'dashboard'] },
            { id: 'campaigns', nameVi: 'Marketing', nameEn: 'Marketing', itemKeys: ['quick_send', 'campaign_management', 'delivery_monitor'] },
          ],
        },
      },
    });

    renderAppSidebar();

    const marketingButton = await screen.findByRole('button', { name: 'Marketing' });
    expect(marketingButton).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Chiến dịch' })).not.toBeInTheDocument();

    fireEvent.click(marketingButton);

    const links = screen.getAllByRole('link');
    const linkNames = links.map((l) => l.textContent);
    // Vẫn chỉ đúng 2 mục có quyền campaigns_view
    expect(linkNames).toEqual(['Quản lý chiến dịch', 'Giám sát gửi tin']);
  });

  it('render tại /app/campaigns, mock cấu hình dời campaign_management vào chuyên mục "Vận hành" → nhóm "Vận hành" tự mở, link có aria-current="page"', async () => {
    authState.user = { role: 'user', username: 'owner1', fullName: 'Chủ TK' };
    authState.activeContext = { type: 'self' };

    mockGetUserAppMenuLayout.mockResolvedValue({
      data: {
        data: {
          categories: [
            { id: 'main', nameVi: 'Mục chính (không tiêu đề)', nameEn: 'Main (untitled)', itemKeys: ['ai_assistant', 'dashboard'] },
            { id: 'operations', nameVi: 'Vận hành', nameEn: 'Operations', itemKeys: ['campaign_management'] },
            { id: 'campaigns', nameVi: 'Chiến dịch', nameEn: 'Campaigns', itemKeys: ['quick_send'] },
          ],
        },
      },
    });

    renderAppSidebar('/app/campaigns');

    // Sau khi layout load từ API, nhóm "Vận hành" phải tự mở và chứa link active
    await waitFor(() => {
      const operationsButton = screen.getByRole('button', { name: 'Vận hành' });
      expect(operationsButton).toHaveAttribute('aria-expanded', 'true');
    });

    const campaignLink = screen.getByRole('link', { name: 'Quản lý chiến dịch' });
    expect(campaignLink).toBeInTheDocument();
    expect(campaignLink).toHaveAttribute('aria-current', 'page');
  });
});

/**
 * PLAN_CHUYEN_MUC_LINK_NGOAI_2026-09-28 — link ngoài (YouTube/link bất kỳ) trong menu khách.
 * `links` là mảng RIÊNG trong response (không nằm trong `categories`) — xem
 * adminMenu.service.js/getAppMenuLayout. Mỗi ca dưới đây đợi load xong (findBy*) trước khi kiểm
 * vì `links`/`categories` chỉ có sau khi promise của getUserAppMenuLayout resolve.
 */
describe('Sidebar — link ngoài trong menu khách (chuyên mục link)', () => {
  const renderAppSidebar = (initialEntry = '/app', props = {}) =>
    render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <I18nProvider>
          <Sidebar isOpen isMobile={false} onToggle={vi.fn()} {...props} />
        </I18nProvider>
      </MemoryRouter>
    );

  beforeEach(() => {
    localStorage.clear();
    authState.user = { role: 'user', username: 'owner1', fullName: 'Chủ TK' };
    authState.activeContext = { type: 'self' };
  });

  it('link ngoài trong chuyên mục thường -> render <a target="_blank" rel="noopener noreferrer">, không phải NavLink (không aria-current)', async () => {
    mockGetUserAppMenuLayout.mockResolvedValue({
      data: {
        data: {
          categories: [
            { id: 'main', nameVi: 'Mục chính (không tiêu đề)', nameEn: 'Main (untitled)', itemKeys: ['ai_assistant'] },
            { id: 'guides', nameVi: 'Hướng dẫn', nameEn: 'Guides', itemKeys: ['link-huongdan'] },
          ],
          links: [
            { key: 'link-huongdan', nameVi: 'Link hướng dẫn', nameEn: 'Guide link', url: 'https://youtu.be/abc', categoryId: 'guides' },
          ],
        },
      },
    });

    renderAppSidebar();

    const groupButton = await screen.findByRole('button', { name: 'Hướng dẫn' });
    fireEvent.click(groupButton);

    const link = screen.getByRole('link', { name: 'Link hướng dẫn' });
    expect(link).toHaveAttribute('href', 'https://youtu.be/abc');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).not.toHaveAttribute('aria-current');
  });

  it('link ngoài trong chuyên mục "main" -> hiện ở cấp 1 (không tiêu đề nhóm), vẫn là <a target="_blank">', async () => {
    mockGetUserAppMenuLayout.mockResolvedValue({
      data: {
        data: {
          categories: [
            { id: 'main', nameVi: 'Mục chính (không tiêu đề)', nameEn: 'Main (untitled)', itemKeys: ['ai_assistant', 'link-top'] },
          ],
          links: [
            { key: 'link-top', nameVi: 'Link Top', nameEn: 'Top link', url: 'https://a.vn', categoryId: 'main' },
          ],
        },
      },
    });

    renderAppSidebar();

    const link = await screen.findByRole('link', { name: 'Link Top' });
    expect(link).toHaveAttribute('href', 'https://a.vn');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('sidebar thu gọn (isOpen=false) — link ngoài ở cấp 1 vẫn render <a href> (không phải button navigate nội bộ)', async () => {
    mockGetUserAppMenuLayout.mockResolvedValue({
      data: {
        data: {
          categories: [
            { id: 'main', nameVi: 'Mục chính (không tiêu đề)', nameEn: 'Main (untitled)', itemKeys: ['ai_assistant', 'link-top'] },
          ],
          links: [
            { key: 'link-top', nameVi: 'Link Top', nameEn: 'Top link', url: 'https://a.vn', categoryId: 'main' },
          ],
        },
      },
    });

    renderAppSidebar('/app', { isOpen: false });

    const link = await screen.findByTitle('Link Top');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', 'https://a.vn');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('nhân viên không có quyền gì vẫn thấy link ngoài (link không gắn permission/ownerOnly)', async () => {
    authState.user = { role: 'user', username: 'emp3', fullName: 'Nhân viên C' };
    authState.activeContext = { type: 'employee', permissions: {} };

    mockGetUserAppMenuLayout.mockResolvedValue({
      data: {
        data: {
          categories: [
            { id: 'main', nameVi: 'Mục chính (không tiêu đề)', nameEn: 'Main (untitled)', itemKeys: ['ai_assistant', 'link-top'] },
          ],
          links: [
            { key: 'link-top', nameVi: 'Link Top', nameEn: 'Top link', url: 'https://a.vn', categoryId: 'main' },
          ],
        },
      },
    });

    renderAppSidebar();

    expect(await screen.findByRole('link', { name: 'Link Top' })).toBeInTheDocument();
  });

  it('link URL không an toàn (javascript:) -> KHÔNG render trong sidebar (lớp phòng thủ thứ hai ở FE)', async () => {
    mockGetUserAppMenuLayout.mockResolvedValue({
      data: {
        data: {
          categories: [
            { id: 'main', nameVi: 'Mục chính (không tiêu đề)', nameEn: 'Main (untitled)', itemKeys: ['ai_assistant', 'link-bad'] },
          ],
          links: [
            { key: 'link-bad', nameVi: 'Link Xấu', nameEn: 'Bad link', url: 'javascript:alert(1)', categoryId: 'main' },
          ],
        },
      },
    });

    renderAppSidebar();

    await screen.findByRole('button', { name: 'Trợ lý AI' });
    expect(screen.queryByText('Link Xấu')).not.toBeInTheDocument();
  });
});
