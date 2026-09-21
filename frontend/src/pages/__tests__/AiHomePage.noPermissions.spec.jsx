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

  // Bản trước ghim "có bất kỳ quyền nào → khung chat". Đo bằng trình duyệt thì khung chat đó trả 403
  // khi thiếu `ai_assistant_use` — xem nhóm test "thiếu quyền Sử dụng Trợ lý AI" ở cuối file.
  it('nhân viên đã có quyền dùng Trợ lý AI → khung chat, không có thẻ', () => {
    seed(employeeContext({ campaigns_view: true, ai_assistant_use: true }));
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

// Bản vá review: nút chọn nhanh "Chỉ xem" cố ý KHÔNG kèm quyền dùng Trợ lý AI, mà đổi sang không gian
// công ty xong là được đưa về trang này. Đo bằng trình duyệt 21/09: khung chat hiện ra, gửi tin → 403.
describe('AiHomePage — có quyền khác nhưng thiếu quyền "Sử dụng Trợ lý AI"', () => {
  it('nhân viên chỉ có quyền xem chiến dịch → thẻ chỉ sang menu trái, KHÔNG có khung chat', () => {
    seed(employeeContext({ campaigns_view: true, reports_view: true, ai_assistant_use: false }));
    renderPage();

    const card = screen.getByTestId('workspace-no-ai-assistant');
    expect(card).toHaveTextContent('Trợ lý AI chưa được bật cho bạn');
    expect(card).toHaveTextContent('Bạn đang làm việc trong không gian của Công ty A.');
    expect(card).toHaveTextContent('tick "Sử dụng Trợ lý AI"');
    expect(screen.getByRole('button', { name: 'Tôi đã được cấp quyền — kiểm tra lại' })).toBeInTheDocument();
    expect(screen.queryByTestId('ai-chat')).not.toBeInTheDocument();
    // Không lẫn với thẻ 0 quyền — hai ca hướng dẫn hai việc khác nhau.
    expect(screen.queryByTestId('workspace-no-permissions')).not.toBeInTheDocument();
  });

  it('thiếu hẳn khoá ai_assistant_use (quyền lưu trước khi có khoá này) → cũng là thẻ, không phải khung chat', () => {
    seed(employeeContext({ campaigns_view: true }));
    renderPage();

    expect(screen.getByTestId('workspace-no-ai-assistant')).toBeInTheDocument();
    expect(screen.queryByTestId('ai-chat')).not.toBeInTheDocument();
  });

  it('nhân viên CÓ quyền dùng Trợ lý AI → khung chat, không thẻ nào', () => {
    seed(employeeContext({ campaigns_view: true, ai_assistant_use: true }));
    renderPage();

    expect(screen.getByTestId('ai-chat')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-no-ai-assistant')).not.toBeInTheDocument();
  });

  it('chủ tài khoản (ngữ cảnh self) không bao giờ thấy thẻ này', () => {
    seed({ type: 'self' }, []);
    renderPage();

    expect(screen.getByTestId('ai-chat')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-no-ai-assistant')).not.toBeInTheDocument();
  });

  it('chủ vừa tick quyền → bấm "kiểm tra lại" là khung chat hiện ra, không cần F5', async () => {
    seed(employeeContext({ campaigns_view: true }), [membership({ campaigns_view: true })]);
    api.get.mockResolvedValueOnce(meResponse({ campaigns_view: true, ai_assistant_use: true }));
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Tôi đã được cấp quyền — kiểm tra lại' }));

    await waitFor(() => expect(screen.getByTestId('ai-chat')).toBeInTheDocument());
    expect(screen.queryByTestId('workspace-no-ai-assistant')).not.toBeInTheDocument();
  });
});
