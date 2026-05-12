import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const logoutMock = vi.fn().mockResolvedValue(undefined);
let authState = {
  user: null,
  logout: logoutMock,
  activeContext: { type: 'self' },
};
vi.mock('../../stores/authStore', () => ({
  useAuthStore: () => authState,
}));

vi.mock('../../hooks/useLocalStorageState', () => ({
  useLocalStorageState: (_key, defaultValue) => {
    const React = require('react');
    return React.useState(typeof defaultValue === 'function' ? defaultValue() : defaultValue);
  },
}));

vi.mock('../../hooks/useScrollPersistence', () => ({
  useScrollPersistence: vi.fn(),
}));

vi.mock('../../features/auth/components/ChangePasswordModal', () => ({
  default: ({ isOpen }) => (isOpen ? <div data-testid="cp-modal">CP</div> : null),
}));

vi.mock('../../features/auth/components/AccountProfileModal', () => ({
  default: ({ isOpen }) => (isOpen ? <div data-testid="profile-modal">Profile</div> : null),
}));

vi.mock('../ContextSwitcher', () => ({
  default: ({ showLabels }) => (
    <div data-testid="context-switcher" data-show-labels={String(showLabels)}>
      switcher
    </div>
  ),
}));

import Sidebar from '../../components/layout/admin/Sidebar';

function renderSidebar({ pathname = '/app', ...props } = {}) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Sidebar
        isOpen={props.isOpen ?? true}
        width={props.width ?? 240}
        isMobile={props.isMobile ?? false}
        onClose={props.onClose ?? vi.fn()}
      />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authState = {
    user: { fullName: 'Owner Bee', username: 'bee', email: 'bee@x.com', memberships: [] },
    logout: logoutMock,
    activeContext: { type: 'self' },
  };
});

describe('<AdminSidebar /> — super_admin role', () => {
  beforeEach(() => {
    authState.user = { ...authState.user, role: 'admin' };
  });

  it('hiển thị label "System Admin"', () => {
    renderSidebar();
    expect(screen.getByText('System Admin')).toBeInTheDocument();
    expect(screen.queryByText('Campaign Management')).not.toBeInTheDocument();
  });

  it('render menu super_admin: Dashboard / Quản lý thành viên / Quản lý gói dịch vụ / Đơn hàng', () => {
    renderSidebar();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Quản lý thành viên')).toBeInTheDocument();
    expect(screen.getByText('Quản lý gói dịch vụ')).toBeInTheDocument();
    expect(screen.getByText('Đơn hàng')).toBeInTheDocument();
  });

  it('không render menu vận hành (Chiến dịch / Khách hàng / Landing page)', () => {
    renderSidebar();
    expect(screen.queryByText('Chiến dịch')).not.toBeInTheDocument();
    expect(screen.queryByText('Khách hàng')).not.toBeInTheDocument();
    expect(screen.queryByText('Landing page')).not.toBeInTheDocument();
  });

  it('không render ContextSwitcher khi là super_admin', () => {
    renderSidebar();
    expect(screen.queryByTestId('context-switcher')).not.toBeInTheDocument();
  });
});

describe('<AdminSidebar /> — user role (operations)', () => {
  it('hiển thị "Campaign Management" label', () => {
    renderSidebar();
    expect(screen.getByText('Campaign Management')).toBeInTheDocument();
  });

  it('render menu user: Dashboard / Thiết lập / Landing page / Chiến dịch / Khách hàng / Đơn hàng / Nhân viên', () => {
    renderSidebar();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Thiết lập')).toBeInTheDocument();
    expect(screen.getByText('Landing page')).toBeInTheDocument();
    expect(screen.getByText('Chiến dịch')).toBeInTheDocument();
    expect(screen.getByText('Khách hàng')).toBeInTheDocument();
    expect(screen.getByText('Đơn hàng')).toBeInTheDocument();
    expect(screen.getByText('Nhân viên')).toBeInTheDocument();
  });

  it('render ContextSwitcher cho user role', () => {
    renderSidebar();
    expect(screen.getByTestId('context-switcher')).toBeInTheDocument();
  });

  it('menu "Thiết lập" mặc định expand → render children', () => {
    renderSidebar();
    expect(screen.getByText('Quản lý kênh gửi')).toBeInTheDocument();
    expect(screen.getByText('Mẫu tin nhắn')).toBeInTheDocument();
    expect(screen.getByText('Quản lý sản phẩm')).toBeInTheDocument();
  });

  it('toggle menu "Thiết lập" → ẩn children, click lại → hiện', async () => {
    const user = userEvent.setup();
    renderSidebar();
    await user.click(screen.getByText('Thiết lập'));
    expect(screen.queryByText('Quản lý kênh gửi')).not.toBeInTheDocument();
    await user.click(screen.getByText('Thiết lập'));
    expect(screen.getByText('Quản lý kênh gửi')).toBeInTheDocument();
  });
});

describe('<AdminSidebar /> — employee context filtering', () => {
  it('ownerOnly items bị ẩn (Đơn hàng / Nhân viên)', () => {
    authState.activeContext = {
      type: 'employee',
      ownerId: 5,
      ownerName: 'Co',
      permissions: { campaigns_view: true, customers: true, email_settings: true },
    };
    renderSidebar();
    expect(screen.queryByText('Đơn hàng')).not.toBeInTheDocument();
    expect(screen.queryByText('Nhân viên')).not.toBeInTheDocument();
  });

  it('permission-gated items chỉ hiện nếu có quyền tương ứng', () => {
    authState.activeContext = {
      type: 'employee',
      ownerId: 5,
      ownerName: 'Co',
      permissions: { customers: true },
    };
    renderSidebar();
    expect(screen.getByText('Khách hàng')).toBeInTheDocument();
    expect(screen.queryByText('Chiến dịch')).not.toBeInTheDocument();
  });

  it('child có permission → ẩn nếu employee không có quyền', () => {
    authState.activeContext = {
      type: 'employee',
      ownerId: 5,
      permissions: { email_settings: true },
    };
    renderSidebar();
    expect(screen.getByText('Quản lý kênh gửi')).toBeInTheDocument();
    expect(screen.queryByText('Quản lý sản phẩm')).not.toBeInTheDocument();
  });

  it('parent menu ẩn hoàn toàn khi không có child nào pass filter', () => {
    authState.activeContext = {
      type: 'employee',
      ownerId: 5,
      permissions: {},
    };
    renderSidebar();
    expect(screen.queryByText('Thiết lập')).not.toBeInTheDocument();
    expect(screen.queryByText('Chiến dịch')).not.toBeInTheDocument();
  });

  it('self context → ownerOnly items vẫn hiện', () => {
    authState.activeContext = { type: 'self' };
    renderSidebar();
    expect(screen.getByText('Đơn hàng')).toBeInTheDocument();
    expect(screen.getByText('Nhân viên')).toBeInTheDocument();
  });
});

describe('<AdminSidebar /> — mobile mode', () => {
  it('isMobile=true → render nút Đóng menu', () => {
    renderSidebar({ isMobile: true });
    expect(screen.getByRole('button', { name: /Đóng menu/i })).toBeInTheDocument();
  });

  it('click nút Đóng menu → onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderSidebar({ isMobile: true, onClose });
    await user.click(screen.getByRole('button', { name: /Đóng menu/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('isOpen=false trên mobile → aside có class -translate-x-full', () => {
    const { container } = renderSidebar({ isMobile: true, isOpen: false });
    const aside = container.querySelector('aside');
    expect(aside.className).toMatch(/-translate-x-full/);
  });

  it('mobile luôn showLabels=true (truyền vào ContextSwitcher)', () => {
    renderSidebar({ isMobile: true, isOpen: false });
    expect(screen.getByTestId('context-switcher').dataset.showLabels).toBe('true');
  });

  it('click NavLink trên mobile → onClose được gọi (handleNavClose)', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderSidebar({ isMobile: true, onClose });
    await user.click(screen.getByText('Dashboard'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('<AdminSidebar /> — collapsed (isOpen=false desktop)', () => {
  it('desktop collapsed → ẩn label nhưng giữ icon', () => {
    renderSidebar({ isMobile: false, isOpen: false });
    expect(screen.queryByText('Campaign Management')).not.toBeInTheDocument();
    expect(screen.queryByText('Quản lý kênh gửi')).not.toBeInTheDocument();
  });

  it('truyền showLabels=false vào ContextSwitcher khi collapsed', () => {
    renderSidebar({ isMobile: false, isOpen: false });
    expect(screen.getByTestId('context-switcher').dataset.showLabels).toBe('false');
  });
});

describe('<AdminSidebar /> — user section (footer)', () => {
  it('hiển thị tên user + email khi expanded', () => {
    renderSidebar();
    expect(screen.getByText('Owner Bee')).toBeInTheDocument();
    expect(screen.getByText('bee@x.com')).toBeInTheDocument();
  });

  it('click avatar → mở user menu', async () => {
    const user = userEvent.setup();
    renderSidebar();
    await user.click(screen.getByText('Owner Bee'));
    expect(screen.getByText('Thông tin tài khoản')).toBeInTheDocument();
    expect(screen.getByText('Đổi mật khẩu')).toBeInTheDocument();
    expect(screen.getByText('Đăng xuất')).toBeInTheDocument();
  });

  it('click "Thông tin tài khoản" → mở AccountProfileModal', async () => {
    const user = userEvent.setup();
    renderSidebar();
    await user.click(screen.getByText('Owner Bee'));
    await user.click(screen.getByText('Thông tin tài khoản'));
    expect(screen.getByTestId('profile-modal')).toBeInTheDocument();
  });

  it('click "Đổi mật khẩu" → mở ChangePasswordModal', async () => {
    const user = userEvent.setup();
    renderSidebar();
    await user.click(screen.getByText('Owner Bee'));
    await user.click(screen.getByText('Đổi mật khẩu'));
    expect(screen.getByTestId('cp-modal')).toBeInTheDocument();
  });

  it('click "Đăng xuất" → logout + navigate /login', async () => {
    const user = userEvent.setup();
    renderSidebar();
    await user.click(screen.getByText('Owner Bee'));
    await user.click(screen.getByText('Đăng xuất'));
    expect(logoutMock).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/login'));
  });

  it('click outside → đóng user menu', async () => {
    const user = userEvent.setup();
    renderSidebar();
    await user.click(screen.getByText('Owner Bee'));
    expect(screen.getByText('Đăng xuất')).toBeInTheDocument();
    act(() => {
      fireEvent.mouseDown(document.body);
    });
    expect(screen.queryByText('Đăng xuất')).not.toBeInTheDocument();
  });

  it('fallback "User" khi không có fullName/username', () => {
    authState.user = { email: 'a@b', memberships: [] };
    renderSidebar();
    expect(screen.getByText('User')).toBeInTheDocument();
  });
});

describe('<AdminSidebar /> — action buttons (campaigns_create)', () => {
  it('"Tạo chiến dịch mới" với action → click navigate với state', async () => {
    const user = userEvent.setup();
    renderSidebar();
    expect(screen.getByText('Tạo chiến dịch mới')).toBeInTheDocument();
    await user.click(screen.getByText('Tạo chiến dịch mới'));
    expect(navigateMock).toHaveBeenCalledWith('/app/campaigns', {
      state: { openCreateCampaignModal: true },
    });
  });
});
