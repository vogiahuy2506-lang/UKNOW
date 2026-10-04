/**
 * 04/10/2026 (nhóm 1):
 *  - S-15: nhân viên chỉ thấy phần mình đủ quyền — Kênh cần chatbot_channels_manage, Marketplace cần
 *          marketplace_manage, "Chia sẻ thành viên" (gửi bản sao) chỉ chủ tài khoản. Trước đây các ô vẫn hiện rồi
 *          báo lỗi chung chung khi bấm.
 *  - S-23: nút Copy phải chờ navigator.clipboard; trình duyệt chặn thì báo lỗi chứ không nói "Đã copy".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import DeployTab from '../DeployTab';
import { useAuthStore } from '../../../stores/authStore';

vi.mock('../../../features/chatbot/services/chatbotApi.service', () => ({
  default: { getChatbotChannels: vi.fn().mockResolvedValue({ data: { data: [] } }) },
}));
vi.mock('../../../hooks/queries/useChannelEntitlements', () => ({
  useChannelEntitlements: () => ({ telegram: true, whatsapp: true, zalo: true, limits: {}, isLoading: false }),
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../ChannelModals', () => ({ ChannelModal: () => null }));
vi.mock('../../../components/marketplace/ShareChatbotModal', () => ({ default: () => null }));
vi.mock('../../../components/marketplace/MarketplaceListingModal', () => ({ default: () => null }));
vi.mock('../../../i18n', async () => (await import('./studioTestI18n.js')).i18nMock);

const bot = { id: 9, name: 'Bot', widget_key: 'wk9', channels: [] };
const employee = (permissions) => ({ type: 'employee', ownerId: 42, permissions });

describe('DeployTab — nhân viên chỉ thấy phần đủ quyền (S-15)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: { id: 8 }, activeContext: { type: 'self' } });
  });

  it('chủ tài khoản: thấy đủ Kênh + Gửi bản sao + Đăng bán trên Marketplace', () => {
    render(<DeployTab chatbot={bot} onOpenWidgetSettings={() => {}} />);
    expect(screen.getByText('Zalo cá nhân')).toBeTruthy();
    expect(screen.getByText('Gửi bản sao')).toBeTruthy();
    expect(screen.getByText('Đăng bán trên Marketplace')).toBeTruthy();
  });

  it('nhân viên chỉ có chatbots_manage → KHÔNG thấy nhóm Kênh, Gửi bản sao, Marketplace (còn khối nhúng website)', () => {
    useAuthStore.setState({ activeContext: employee({ chatbots_manage: true }) });
    render(<DeployTab chatbot={bot} onOpenWidgetSettings={() => {}} />);

    expect(screen.queryByText('Trên ứng dụng nhắn tin')).toBeNull();
    expect(screen.queryByText('Zalo cá nhân')).toBeNull();
    expect(screen.queryByText('Telegram')).toBeNull();
    expect(screen.queryByText('Sao chép & bán')).toBeNull();
    expect(screen.queryByText('Gửi bản sao')).toBeNull();
    expect(screen.queryByText('Đăng bán trên Marketplace')).toBeNull();
    expect(screen.getByText('Nút chat nổi')).toBeTruthy();
  });

  it('nhân viên có chatbot_channels_manage → thấy Kênh; vẫn không thấy Gửi bản sao', () => {
    useAuthStore.setState({ activeContext: employee({ chatbots_manage: true, chatbot_channels_manage: true }) });
    render(<DeployTab chatbot={bot} onOpenWidgetSettings={() => {}} />);

    expect(screen.getByText('Zalo cá nhân')).toBeTruthy();
    expect(screen.queryByText('Gửi bản sao')).toBeNull();
  });

  it('nhân viên có marketplace_manage → thấy Marketplace nhưng KHÔNG thấy Gửi bản sao (chỉ chủ tài khoản)', () => {
    useAuthStore.setState({ activeContext: employee({ chatbots_manage: true, marketplace_manage: true }) });
    render(<DeployTab chatbot={bot} onOpenWidgetSettings={() => {}} />);

    expect(screen.getByText('Đăng bán trên Marketplace')).toBeTruthy();
    expect(screen.queryByText('Gửi bản sao')).toBeNull();
  });
});

describe('DeployTab — nút Copy chờ clipboard (S-23)', () => {
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: { id: 8 }, activeContext: { type: 'self' } });
  });

  afterEach(() => {
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
    else delete navigator.clipboard;
  });

  const setClipboard = (writeText) => Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

  const openScriptModal = () => {
    render(<DeployTab chatbot={bot} onOpenWidgetSettings={() => {}} />);
    fireEvent.click(screen.getByText('Nút chat nổi'));
    return screen.getByRole('button', { name: /Copy mã/ });
  };

  it('clipboard từ chối → toast lỗi, KHÔNG báo "Đã copy"', async () => {
    setClipboard(vi.fn().mockRejectedValue(new Error('NotAllowedError')));
    fireEvent.click(openScriptModal());

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Không sao chép được, hãy bôi đen và sao chép tay'));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('không có navigator.clipboard (http, không an toàn) → cũng báo lỗi chứ không ném lỗi', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    fireEvent.click(openScriptModal());

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Không sao chép được, hãy bôi đen và sao chép tay'));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('clipboard ghi được → "Đã copy"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    fireEvent.click(openScriptModal());

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã copy'));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain("token: 'wk9'");
    expect(toast.error).not.toHaveBeenCalled();
  });
});
