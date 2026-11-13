import { jest } from '@jest/globals';
import axios from 'axios';
import zaloOaSettingsController from '../zaloOaSettings.controller.js';
import channelConnectionsRepository from '../../repositories/ai/channelConnections.repository.js';
import chatbotZaloOaRepository from '../../repositories/chatbot/chatbotZaloOa.repository.js';

describe('ZaloOaSettingsController', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      user: { id: 1 },
      params: {},
      body: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    jest.clearAllMocks();
  });

  describe('listAccounts', () => {
    it('trả về danh sách tài khoản đã kết nối và loại bỏ các trường nhạy cảm', async () => {
      jest.spyOn(channelConnectionsRepository, 'listZaloOaConnections').mockResolvedValue([
        {
          id: 10,
          zalo_oa_id: 'oa_123',
          zalo_oa_name: 'Shop Cửa Hàng',
          zalo_oa_avatar: 'https://avatar.png',
          credentials: { app_id: 'app_999', access_token: 'secret_token', refresh_token: 'secret_refresh' },
          is_active: true,
          created_at: '2026-11-13T00:00:00Z',
          updated_at: '2026-11-13T00:00:00Z',
        },
      ]);

      await zaloOaSettingsController.listAccounts(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [
          expect.objectContaining({
            id: 10,
            zalo_oa_id: 'oa_123',
            name: 'Shop Cửa Hàng',
            avatar: 'https://avatar.png',
            app_id: 'app_999',
            is_active: true,
          }),
        ],
      });
      // Đảm bảo không lộ access_token trong response
      const sentData = res.json.mock.calls[0][0].data[0];
      expect(sentData.access_token).toBeUndefined();
      expect(sentData.refresh_token).toBeUndefined();
    });
  });

  describe('connectAccount', () => {
    it('báo lỗi 400 nếu thiếu access_token', async () => {
      req.body = { access_token: '' };
      await zaloOaSettingsController.connectAccount(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: 'Access Token không được để trống' })
      );
    });

    it('kết nối thành công khi gọi Zalo getprofile hợp lệ', async () => {
      req.body = {
        access_token: 'valid_token_xyz',
        refresh_token: 'refresh_token_xyz',
        app_id: 'app_123',
        app_secret: 'secret_123',
      };

      jest.spyOn(axios, 'get').mockResolvedValue({
        data: {
          error: 0,
          data: {
            oa_id: '99887766',
            name: 'OA Official',
            avatar: 'https://oa-avatar.png',
          },
        },
      });

      jest.spyOn(channelConnectionsRepository, 'upsertZaloOaConnection').mockResolvedValue({
        id: 5,
        zalo_oa_id: '99887766',
        zalo_oa_name: 'OA Official',
        zalo_oa_avatar: 'https://oa-avatar.png',
      });

      await zaloOaSettingsController.connectAccount(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Đã kết nối thành công Zalo OA: OA Official',
          data: expect.objectContaining({
            id: 5,
            zalo_oa_id: '99887766',
            name: 'OA Official',
          }),
        })
      );
    });
  });

  describe('toggleAccountForChatbot', () => {
    it('bật hoặc tắt Zalo OA thành công cho chatbot', async () => {
      req.params = { chatbotId: '2', connectionId: '10' };
      req.body = { is_active: true };

      jest.spyOn(chatbotZaloOaRepository, 'toggleAccountForChatbot').mockResolvedValue({
        setting: { id_chatbot: 2, id_channel_connection: 10, is_active: true },
      });

      await zaloOaSettingsController.toggleAccountForChatbot(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Đã bật Zalo OA cho trợ lý này',
        data: { id_chatbot: 2, id_channel_connection: 10, is_active: true },
      });
    });
  });
});

