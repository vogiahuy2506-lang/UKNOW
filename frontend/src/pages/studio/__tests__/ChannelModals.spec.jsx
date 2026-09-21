import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import { ChannelModal } from '../ChannelModals';
import chatbotApi from '../../../features/chatbot/services/chatbotApi.service';

vi.mock('../../../features/chatbot/services/chatbotApi.service', () => ({
  default: {
    getFacebookPageConfig: vi.fn(),
    saveFacebookPageConfig: vi.fn(),
    getFacebookPagesForChatbot: vi.fn(),
    getZaloOaConfig: vi.fn(),
    saveZaloOaConfig: vi.fn(),
    testInboxConnection: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockChatbot = {
  id: 7,
  name: 'Chatbot Kiểm Thử',
};

describe('ChannelModals — Facebook & Zalo OA connection from Studio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: pages list with one page
    chatbotApi.getFacebookPagesForChatbot.mockResolvedValue({
      data: {
        data: [
          {
            id: 101,
            fb_page_id: 'page_123',
            fb_page_name: 'Page A',
            is_active_on_this_chatbot: false,
          },
        ],
      },
    });
  });

  /* ─── Facebook Form Tests ────────────────────────────────────────── */

  describe('Facebook Page Form', () => {
    it('mở modal khi chưa nối: hiện danh sách pages để chọn', async () => {
      chatbotApi.getFacebookPageConfig.mockResolvedValue({
        data: { data: null },
      });

      render(<ChannelModal open channel="facebook" chatbot={mockChatbot} onClose={vi.fn()} />);

      // Chờ form nạp xong
      expect(await screen.findByText('Page A')).toBeInTheDocument();
      expect(screen.getByText('ID: page_123')).toBeInTheDocument();

      // Nút Lưu cấu hình bị disabled khi chưa chọn page
      const saveBtn = screen.getByRole('button', { name: /Lưu cấu hình/i });
      expect(saveBtn).toBeDisabled();

      // Không gọi toast lỗi
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('chọn page rồi lưu → gọi API đúng params và báo thành công', async () => {
      chatbotApi.getFacebookPageConfig.mockResolvedValue({
        data: { data: null },
      });
      chatbotApi.saveFacebookPageConfig.mockResolvedValue({
        data: {
          id: 101,
          display_name: 'Page A',
          webhook_url: 'https://backend.uknow.vn/api/webhooks/chatbot/facebook/fb_secret_token_123',
          verify_token: 'verify_fb_token_456',
        },
        message: 'Facebook Page đã được kết nối với chatbot',
      });

      render(<ChannelModal open channel="facebook" chatbot={mockChatbot} onClose={vi.fn()} />);

      // Chờ page load
      expect(await screen.findByText('Page A')).toBeInTheDocument();

      // Click chọn page
      fireEvent.click(screen.getByText('Page A'));

      // Nút Lưu enabled
      const saveBtn = screen.getByRole('button', { name: /Lưu cấu hình/i });
      expect(saveBtn).not.toBeDisabled();

      // Click save
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(chatbotApi.saveFacebookPageConfig).toHaveBeenCalledWith(7, {
          channel_connection_id: 101,
        });
      });

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Facebook Page đã được kết nối với chatbot');
      });
    });

    it('mở lại modal khi đã có cấu hình: hiện step 3 với trạng thái kết nối', async () => {
      chatbotApi.getFacebookPageConfig.mockResolvedValue({
        data: {
          data: [
            {
              id: 101,
              external_channel_id: 'page_existing_111',
              display_name: 'Fanpage Doanh Nghiệp',
              webhook_url: 'https://backend.uknow.vn/api/webhooks/chatbot/facebook/existing_hook_token',
              verify_token: 'existing_verify_secret',
              channel_type: 'facebook',
              is_active: true,
            },
          ],
        },
      });

      render(<ChannelModal open channel="facebook" chatbot={mockChatbot} onClose={vi.fn()} />);

      expect(await screen.findByText('Cấu hình Webhook trên Meta')).toBeInTheDocument();
      expect(screen.getByDisplayValue('https://backend.uknow.vn/api/webhooks/chatbot/facebook/existing_hook_token')).toBeInTheDocument();
      expect(screen.getByDisplayValue('existing_verify_secret')).toBeInTheDocument();
    });

    it('API getFacebookPageConfig ném lỗi: phải báo toast lỗi', async () => {
      chatbotApi.getFacebookPageConfig.mockRejectedValue({
        response: { data: { message: 'Lỗi tải kênh kết nối từ server' } },
      });
      // pages list vẫn resolve để form không stuck
      chatbotApi.getFacebookPagesForChatbot.mockResolvedValue({
        data: { data: [] },
      });

      render(<ChannelModal open channel="facebook" chatbot={mockChatbot} onClose={vi.fn()} />);

      // Chờ toast error được gọi
      await waitFor(
        () => {
          expect(toast.error).toHaveBeenCalled();
        },
        { timeout: 3000 }
      );
    });

    it('API saveFacebookPageConfig ném lỗi: phải báo toast lỗi với message từ backend', async () => {
      chatbotApi.getFacebookPageConfig.mockResolvedValue({
        data: { data: null },
      });
      chatbotApi.saveFacebookPageConfig.mockRejectedValue({
        response: { data: { message: 'Page Access Token không có quyền quản lý webhook' } },
      });

      render(<ChannelModal open channel="facebook" chatbot={mockChatbot} onClose={vi.fn()} />);

      // Chờ page load
      expect(await screen.findByText('Page A')).toBeInTheDocument();

      // Click chọn page
      fireEvent.click(screen.getByText('Page A'));

      const saveBtn = screen.getByRole('button', { name: /Lưu cấu hình/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Page Access Token không có quyền quản lý webhook');
      });
      expect(toast.success).not.toHaveBeenCalled();
    });
  });

  /* ─── Zalo OA Form Tests ─────────────────────────────────────────── */

  describe('Zalo OA Form', () => {
    it('mở modal khi chưa nối: Webhook URL hiện "Nối xong sẽ hiện", không lỗi đỏ', async () => {
      chatbotApi.getZaloOaConfig.mockResolvedValue({
        data: { data: null },
      });

      render(<ChannelModal open channel="zalo" chatbot={mockChatbot} onClose={vi.fn()} />);

      expect(await screen.findByPlaceholderText('VD: 1234567890')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();

      // Webhook URL hiện trạng thái chờ nối
      expect(screen.getByDisplayValue('Nối xong sẽ hiện')).toBeInTheDocument();

      // Không gọi toast lỗi khi chưa kết nối
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('nhập App ID + App Secret → lưu thành công, hiển thị đúng Webhook URL từ backend', async () => {
      chatbotApi.getZaloOaConfig.mockResolvedValue({
        data: { data: null },
      });
      chatbotApi.saveZaloOaConfig.mockResolvedValue({
        data: {
          id: 202,
          display_name: 'Zalo CSKH',
          webhook_url: 'https://backend.uknow.vn/api/webhooks/chatbot/zalo-oa/zalo_secret_token_789',
        },
        message: 'Zalo OA đã được kết nối với chatbot',
      });

      render(<ChannelModal open channel="zalo" chatbot={mockChatbot} onClose={vi.fn()} />);

      const appIdInput = await screen.findByPlaceholderText('VD: 1234567890');
      const appSecretInput = screen.getByPlaceholderText('••••••••');
      const displayNameInput = screen.getByPlaceholderText('VD: Zalo OA Chăm sóc khách hàng');

      fireEvent.change(appIdInput, { target: { value: 'app_zalo_123456' } });
      fireEvent.change(appSecretInput, { target: { value: 'secret_zalo_xyz' } });
      fireEvent.change(displayNameInput, { target: { value: 'Zalo CSKH' } });

      const saveBtn = screen.getByRole('button', { name: /Lưu cấu hình/i });
      expect(saveBtn).not.toBeDisabled();
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(chatbotApi.saveZaloOaConfig).toHaveBeenCalledWith(7, {
          zalo_app_id: 'app_zalo_123456',
          zalo_app_secret: 'secret_zalo_xyz',
          display_name: 'Zalo CSKH',
        });
      });

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Zalo OA đã được kết nối với chatbot');
      });

      // Webhook URL hiển thị giá trị backend trả về
      expect(screen.getByDisplayValue('https://backend.uknow.vn/api/webhooks/chatbot/zalo-oa/zalo_secret_token_789')).toBeInTheDocument();
    });

    it('API getZaloOaConfig ném lỗi: phải báo toast lỗi', async () => {
      chatbotApi.getZaloOaConfig.mockRejectedValue({
        response: { data: { message: 'Không thể kết nối dịch vụ Zalo OA' } },
      });

      render(<ChannelModal open channel="zalo" chatbot={mockChatbot} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Không thể kết nối dịch vụ Zalo OA');
      });
    });

    it('API saveZaloOaConfig ném lỗi: báo toast lỗi từ backend', async () => {
      chatbotApi.getZaloOaConfig.mockResolvedValue({ data: { data: null } });
      chatbotApi.saveZaloOaConfig.mockRejectedValue({
        response: { data: { message: 'App Secret Zalo không đúng' } },
      });

      render(<ChannelModal open channel="zalo" chatbot={mockChatbot} onClose={vi.fn()} />);

      const appIdInput = await screen.findByPlaceholderText('VD: 1234567890');
      const appSecretInput = screen.getByPlaceholderText('••••••••');
      fireEvent.change(appIdInput, { target: { value: '123' } });
      fireEvent.change(appSecretInput, { target: { value: 'wrong_secret' } });

      const saveBtn = screen.getByRole('button', { name: /Lưu cấu hình/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('App Secret Zalo không đúng');
      });
      expect(toast.success).not.toHaveBeenCalled();
    });
  });
});
