/**
 * PLAN_GOM_MUC_NHE_2026-10-20 1a — công tắc "link và mã nhúng cũ theo số thứ tự" ở hộp Link chat / Nút chat nổi / Khung chat.
 * Chỉ hiện với chatbot cũ còn allow_public_numeric_id = true và người sửa được chatbot; tắt gọi API và cập nhật khoá mới.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import DeployTab from '../DeployTab';
import chatbotApi from '../../../features/chatbot/services/chatbotApi.service';
import { useAuthStore } from '../../../stores/authStore';

vi.mock('../../../features/chatbot/services/chatbotApi.service', () => ({
  default: {
    getChatbotChannels: vi.fn().mockResolvedValue({ data: { data: [] } }),
    setPublicNumericId: vi.fn(),
  },
}));
vi.mock('../../../hooks/queries/useChannelEntitlements', () => ({
  useChannelEntitlements: () => ({ telegram: true, whatsapp: true, limits: {}, isLoading: false }),
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../ChannelModals', () => ({ ChannelModal: () => null }));
vi.mock('../../../components/marketplace/ShareChatbotModal', () => ({ default: () => null }));
vi.mock('../../../components/marketplace/MarketplaceListingModal', () => ({ default: () => null }));
vi.mock('../../../i18n', async () => (await import('./studioTestI18n.js')).i18nMock);

const legacyBot = { id: 9, name: 'Bot', widget_key: 'chatbot_9', allow_public_numeric_id: true, channels: [] };
const employee = (permissions) => ({ type: 'employee', ownerId: 42, permissions });

const openLinkModal = () => fireEvent.click(screen.getByText('Link chat riêng'));

describe('DeployTab — công tắc link theo số thứ tự', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: { id: 8 }, activeContext: { type: 'self' } });
  });

  it('chatbot cũ (cờ true), chủ tài khoản: thấy công tắc đang bật; bấm → gọi API tắt, cập nhật chatbot với khoá mới, công tắc vẫn hiện để bật lại', async () => {
    chatbotApi.setPublicNumericId.mockResolvedValue({
      success: true,
      data: { id: 9, allow_public_numeric_id: false, widget_key: 'ab12cd34' },
    });
    const onUpdate = vi.fn();
    const { rerender } = render(<DeployTab chatbot={legacyBot} onOpenWidgetSettings={() => {}} onUpdate={onUpdate} />);
    openLinkModal();

    const sw = screen.getByTestId('numeric-link-switch');
    expect(sw.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(sw);

    await waitFor(() => expect(chatbotApi.setPublicNumericId).toHaveBeenCalledWith(9, false));
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 9, allow_public_numeric_id: false, widget_key: 'ab12cd34' })
      )
    );
    expect(toast.success).toHaveBeenCalled();

    // Cha cập nhật chatbot: link hiện khoá mới, công tắc vẫn còn (đang tắt) để bật lại.
    rerender(
      <DeployTab
        chatbot={{ ...legacyBot, allow_public_numeric_id: false, widget_key: 'ab12cd34' }}
        onOpenWidgetSettings={() => {}}
        onUpdate={onUpdate}
      />
    );
    expect(screen.getByTestId('numeric-link-switch').getAttribute('aria-checked')).toBe('false');
    expect(screen.getByDisplayValue(/\/chat\/ab12cd34$/)).toBeTruthy();
  });

  it('API lỗi → báo lỗi, KHÔNG cập nhật chatbot', async () => {
    chatbotApi.setPublicNumericId.mockRejectedValue(new Error('boom'));
    const onUpdate = vi.fn();
    render(<DeployTab chatbot={legacyBot} onOpenWidgetSettings={() => {}} onUpdate={onUpdate} />);
    openLinkModal();
    fireEvent.click(screen.getByTestId('numeric-link-switch'));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('chatbot mới (cờ false hoặc thiếu) → KHÔNG có công tắc', () => {
    const { unmount } = render(
      <DeployTab chatbot={{ ...legacyBot, allow_public_numeric_id: false }} onOpenWidgetSettings={() => {}} />
    );
    openLinkModal();
    expect(screen.queryByTestId('numeric-link-switch')).toBeNull();
    unmount();

    const { id, name, widget_key } = legacyBot;
    render(<DeployTab chatbot={{ id, name, widget_key }} onOpenWidgetSettings={() => {}} />);
    openLinkModal();
    expect(screen.queryByTestId('numeric-link-switch')).toBeNull();
  });

  it('nhân viên thiếu chatbots_manage → không có công tắc; có chatbots_manage → có', () => {
    useAuthStore.setState({ activeContext: employee({ chatbot_channels_manage: true }) });
    const { unmount } = render(<DeployTab chatbot={legacyBot} onOpenWidgetSettings={() => {}} />);
    openLinkModal();
    expect(screen.queryByTestId('numeric-link-switch')).toBeNull();
    unmount();

    useAuthStore.setState({ activeContext: employee({ chatbots_manage: true }) });
    render(<DeployTab chatbot={legacyBot} onOpenWidgetSettings={() => {}} />);
    openLinkModal();
    expect(screen.getByTestId('numeric-link-switch')).toBeTruthy();
  });
});
