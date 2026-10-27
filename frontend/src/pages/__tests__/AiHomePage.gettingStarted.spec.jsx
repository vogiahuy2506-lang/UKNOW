/**
 * Thẻ "3 bước bắt đầu" gắn ở trang chủ (PLAN_ONBOARDING_ZALO_VA_THE_3_BUOC_2026-10-27, Việc 2).
 *
 * Chốt ở NƠI GẮN: chủ tài khoản thấy thẻ phía TRÊN khung chat; ngữ cảnh nhân viên KHÔNG vẽ thẻ và KHÔNG gọi API
 * (route `/dashboard/getting-started` chỉ cho chủ — nhân viên sẽ nhận 403). Store thật, chỉ giả API + khung chat.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../i18n', async () => (await import('../../test/realI18n.js')).realI18nModule());
vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  setAuthStore: vi.fn(),
}));
vi.mock('../../features/ai/AiChatbot', () => ({ default: () => <div data-testid="ai-chat" /> }));

const api = (await import('../../services/api')).default;
const { useAuthStore } = await import('../../stores/authStore');
const { default: AiHomePage } = await import('../AiHomePage');

const GETTING_STARTED_URL = '/dashboard/getting-started';
const calledGettingStarted = () => api.get.mock.calls.some(([url]) => url === GETTING_STARTED_URL);

const seed = (activeContext) => {
  useAuthStore.setState({
    user: { id: 7, username: 'u', role: 'user', active_plan_id: null, memberships: [] },
    isAuthenticated: true,
    activeContext,
  });
};
const employeeContext = (permissions) => ({
  type: 'employee', ownerId: 10, ownerName: 'Công ty A', ownerAvatarUrl: null, permissions,
  dailyEmailLimit: null, monthlyEmailLimit: null, dailyZaloLimit: null, monthlyZaloLimit: null,
});
const renderPage = () => render(<MemoryRouter><AiHomePage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  api.get.mockImplementation((url) => (
    url === GETTING_STARTED_URL
      ? Promise.resolve({ data: { success: true, data: { channelConnected: true, hasCustomers: false, hasSentMessage: false } } })
      : Promise.resolve({ data: {} })
  ));
});

describe('AiHomePage — thẻ "3 bước bắt đầu"', () => {
  it('chủ tài khoản (self): gọi API thẻ, thấy "1/3" ngay phía TRÊN khung chat', async () => {
    seed({ type: 'self' });
    renderPage();

    const card = await screen.findByTestId('getting-started-card');
    expect(screen.getByTestId('getting-started-progress')).toHaveTextContent('1/3');
    expect(calledGettingStarted()).toBe(true);
    const chat = screen.getByTestId('ai-chat');
    // Thẻ đứng TRƯỚC khung chat trong cây DOM (nằm phía trên), khung chat vẫn có mặt.
    expect(card.compareDocumentPosition(chat) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('nhân viên (ngữ cảnh employee) có quyền dùng Trợ lý AI: KHÔNG vẽ thẻ và KHÔNG gọi API thẻ', async () => {
    seed(employeeContext({ campaigns_view: true, ai_assistant_use: true }));
    renderPage();

    expect(screen.getByTestId('ai-chat')).toBeInTheDocument();
    // Cho effect (nếu có) kịp chạy trước khi khẳng định "không gọi".
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calledGettingStarted()).toBe(false);
    expect(screen.queryByTestId('getting-started-card')).toBeNull();
  });

  it('nhân viên chưa có quyền nào / thiếu quyền Trợ lý AI: giữ thẻ hướng dẫn cũ, không có thẻ 3 bước, không gọi API', async () => {
    seed(employeeContext([]));
    const first = renderPage();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByTestId('workspace-no-permissions')).toBeInTheDocument();
    expect(screen.queryByTestId('getting-started-card')).toBeNull();
    first.unmount();

    seed(employeeContext({ campaigns_view: true }));
    renderPage();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByTestId('workspace-no-ai-assistant')).toBeInTheDocument();
    expect(screen.queryByTestId('getting-started-card')).toBeNull();
    expect(calledGettingStarted()).toBe(false);
  });

  it('API thẻ lỗi: khung chat vẫn hiện bình thường, không có thẻ', async () => {
    api.get.mockImplementation((url) => (url === GETTING_STARTED_URL ? Promise.reject(new Error('404')) : Promise.resolve({ data: {} })));
    seed({ type: 'self' });
    renderPage();

    await waitFor(() => expect(calledGettingStarted()).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByTestId('ai-chat')).toBeInTheDocument();
    expect(screen.queryByTestId('getting-started-card')).toBeNull();
  });

  it('chủ đã có cờ done/dismissed trên máy này: không gọi API thẻ', async () => {
    window.localStorage.setItem('fa_getting_started_dismissed:7', '1');
    seed({ type: 'self' });
    renderPage();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByTestId('ai-chat')).toBeInTheDocument();
    expect(calledGettingStarted()).toBe(false);
    expect(screen.queryByTestId('getting-started-card')).toBeNull();
  });
});
