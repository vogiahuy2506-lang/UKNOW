import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ZaloOaChannelModal from '../ZaloOaChannelModal';
import chatbotApi from '../../services/chatbotApi.service';

vi.mock('../../services/chatbotApi.service', () => ({
  default: {
    getZaloOaAccountsForChatbot: vi.fn(),
    toggleZaloOaAccountForChatbot: vi.fn(),
    listWorkspaceZaloOaAccounts: vi.fn(),
    connectWorkspaceZaloOaAccount: vi.fn(),
    disconnectWorkspaceZaloOaAccount: vi.fn(),
    getZaloDomainVerification: vi.fn(),
    saveZaloDomainVerification: vi.fn(),
  },
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const sampleAccount = {
  channel_connection_id: 101,
  zalo_oa_id: '9988776655',
  name: 'UKNOW Official Store',
  avatar: 'https://zalo.me/avatar.png',
  app_id: '123456789',
  is_active: true,
  active_on_other_chatbot: null,
};

describe('ZaloOaChannelModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatbotApi.getZaloOaAccountsForChatbot.mockResolvedValue({ data: [sampleAccount] });
    chatbotApi.getZaloDomainVerification.mockResolvedValue({
      data: { verification_code: 'code123', file_name: 'zalo-platform-site-verification-code123.html' },
    });
  });

  it('vẽ tiêu đề và hiển thị tài khoản Zalo OA đã kết nối', async () => {
    render(<ZaloOaChannelModal open onClose={() => {}} chatbotId={7} />);

    expect(await screen.findByText('Kênh Zalo Official Account (Zalo OA)')).toBeTruthy();
    expect(await screen.findByText('UKNOW Official Store')).toBeTruthy();
    expect(screen.getByText('9988776655')).toBeTruthy();
    expect(screen.getByText('Đang trả lời')).toBeTruthy();
  });

  it('gọi toggleZaloOaAccountForChatbot khi bấm đổi trạng thái', async () => {
    const user = userEvent.setup();
    chatbotApi.toggleZaloOaAccountForChatbot.mockResolvedValue({ success: true });

    render(<ZaloOaChannelModal open onClose={() => {}} chatbotId={7} />);
    await screen.findByText('UKNOW Official Store');

    const toggleButton = screen.getByTestId('toggle-oa-button');
    await user.click(toggleButton);

    expect(chatbotApi.toggleZaloOaAccountForChatbot).toHaveBeenCalledWith(7, 101, false);
  });

  it('cho phép lưu mã xác thực tên miền Zalo', async () => {
    const user = userEvent.setup();
    chatbotApi.saveZaloDomainVerification.mockResolvedValue({
      success: true,
      data: { verification_code: 'new_code_999', file_name: 'zalo-platform-site-verification-new_code_999.html' },
    });

    render(<ZaloOaChannelModal open onClose={() => {}} chatbotId={7} />);
    await screen.findByText('Kênh Zalo Official Account (Zalo OA)');

    const input = screen.getByPlaceholderText('Dán mã hoặc zalo-platform-site-verification=...');
    await user.clear(input);
    await user.type(input, 'new_code_999');

    const saveButton = screen.getByRole('button', { name: 'Lưu mã' });
    await user.click(saveButton);

    expect(chatbotApi.saveZaloDomainVerification).toHaveBeenCalledWith('new_code_999');
  });
});
