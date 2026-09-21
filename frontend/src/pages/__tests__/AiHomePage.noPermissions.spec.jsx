/**
 * PLAN_NHAN_VIEN_KHONG_THAY_CHIEN_DICH PR-3 mục 5.2/5.3 — nhân viên vào không gian công ty mà chủ chưa cấp
 * quyền nào thì thấy thẻ hướng dẫn (không phải khung chat trả 403), và nút "kiểm tra lại" làm khung chat
 * hiện ra khi chủ đã cấp quyền. Store thật, chỉ mock API + khung chat.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const employeeContext = (permissions) => ({
  type: 'employee', ownerId: 10, ownerName: 'Công ty A', ownerAvatarUrl: null, permissions,
  dailyEmailLimit: null, monthlyEmailLimit: null, dailyZaloLimit: null, monthlyZaloLimit: null,
});
const membership = (permissions) => ({
  ownerId: 10, ownerName: 'Công ty A', ownerAvatarUrl: null, permissions,
  dailyEmailLimit: null, monthlyEmailLimit: null, dailyZaloLimit: null, monthlyZaloLimit: null, isLocked: false,
});
const meResponse = (permissions) => ({
  data: { data: { user: { id: 7, username: 'nv', role: 'user', active_plan_id: null, memberships: [membership(permissions)] } } },
});
const seed = (activeContext, memberships = [membership([])]) => {
  useAuthStore.setState({
    user: { id: 7, username: 'nv', role: 'user', active_plan_id: null, memberships },
    isAuthenticated: true,
    activeContext,
  });
};
const renderPage = () => render(<MemoryRouter><AiHomePage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

describe('AiHomePage — thẻ "chưa được cấp quyền nào"', () => {
  it('nhân viên với permissions [] → thẻ hướng dẫn nêu tên công ty, KHÔNG có khung chat', () => {
    seed(employeeContext([]));
    renderPage();

    const card = screen.getByTestId('workspace-no-permissions');
    expect(card).toHaveTextContent('Bạn đang ở không gian của Công ty A nhưng chưa được cấp quyền nào.');
    expect(card).toHaveTextContent('Cài đặt → Nhân viên');
    expect(card).toHaveTextContent('tab Phân quyền');
    expect(screen.getByRole('button', { name: 'Tôi đã được cấp quyền — kiểm tra lại' })).toBeInTheDocument();
    expect(screen.queryByTestId('ai-chat')).not.toBeInTheDocument();
  });

  it('nhân viên với object toàn false → vẫn là thẻ hướng dẫn', () => {
    seed(employeeContext({ campaigns_view: false, leads: false }));
    renderPage();
    expect(screen.getByTestId('workspace-no-permissions')).toBeInTheDocument();
  });

  it('nhân viên đã có quyền → khung chat, không có thẻ', () => {
    seed(employeeContext({ campaigns_view: true }));
    renderPage();
    expect(screen.getByTestId('ai-chat')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-no-permissions')).not.toBeInTheDocument();
  });

  it('chủ tài khoản (self) → khung chat, không bao giờ thấy thẻ', () => {
    seed({ type: 'self' });
    renderPage();
    expect(screen.getByTestId('ai-chat')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-no-permissions')).not.toBeInTheDocument();
  });
});

describe('nút "kiểm tra lại"', () => {
  it('chủ ĐÃ cấp quyền → bấm nút, thẻ biến mất và khung chat hiện ra (không cần F5)', async () => {
    seed(employeeContext([]));
    api.get.mockResolvedValue(meResponse({ campaigns_view: true, ai_assistant_use: true }));
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Tôi đã được cấp quyền — kiểm tra lại' }));

    expect(await screen.findByTestId('ai-chat')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-no-permissions')).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/auth/me');
  });

  it('chủ CHƯA cấp → thẻ ở lại và nói thật "chưa thấy quyền mới" (không im lặng)', async () => {
    seed(employeeContext([]));
    api.get.mockResolvedValue(meResponse([]));
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Tôi đã được cấp quyền — kiểm tra lại' }));

    expect(await screen.findByText(/Chưa thấy quyền mới/)).toBeInTheDocument();
    expect(screen.getByTestId('workspace-no-permissions')).toBeInTheDocument();
  });

  it('lỗi mạng → báo không kiểm tra được, KHÔNG nói "chưa cấp quyền"', async () => {
    seed(employeeContext([]));
    api.get.mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Tôi đã được cấp quyền — kiểm tra lại' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Không kiểm tra được lúc này');
    expect(screen.queryByText(/Chưa thấy quyền mới/)).not.toBeInTheDocument();
  });

  it('đang kiểm tra thì nút bị khoá (tránh bấm dồn)', async () => {
    seed(employeeContext([]));
    let finish;
    api.get.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Tôi đã được cấp quyền — kiểm tra lại' }));

    expect(await screen.findByRole('button', { name: 'Đang kiểm tra...' })).toBeDisabled();
    finish(meResponse([]));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tôi đã được cấp quyền — kiểm tra lại' })).toBeEnabled());
  });
});
