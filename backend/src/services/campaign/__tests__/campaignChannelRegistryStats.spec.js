import { afterEach, describe, expect, it } from '@jest/globals';
import campaignChannelRegistry, { listChannelsForStats } from '../campaignChannelRegistry.service.js';

/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-4a — registry là nguồn kênh CHUẨN của module số liệu gửi tin
 * (sendStats). Danh sách dưới đây viết TAY: thêm / đổi tên kênh mà không cập nhật số liệu thì spec này đỏ.
 */
const SAU_KENH = [
  { key: 'email', table: 'email_messages' },
  { key: 'zalo_personal', table: 'zalo_messages' },
  { key: 'zalo_group', table: 'zalo_messages' },
  { key: 'zalo_friend_request', table: 'zalo_messages' },
  { key: 'telegram', table: 'campaign_channel_messages' },
  { key: 'whatsapp', table: 'campaign_channel_messages' },
];

describe('campaignChannelRegistry.listChannelsForStats', () => {
  afterEach(() => {
    delete process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED;
    delete process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED;
    campaignChannelRegistry.__resetTestChannels();
  });

  it('đủ 6 kênh đúng thứ tự hiển thị, kèm bảng đang chứa tin của kênh đó', () => {
    expect(listChannelsForStats()).toEqual(SAU_KENH);
  });

  it('không phụ thuộc cờ bật/tắt gửi: cờ chỉ chặn GỬI, không chặn ĐẾM', () => {
    process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED = 'true';
    process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED = 'true';
    expect(listChannelsForStats()).toEqual(SAU_KENH);
  });

  it('kênh adapter đăng ký riêng cho test cũng có mặt, ghi vào campaign_channel_messages', () => {
    campaignChannelRegistry.__registerChannelForTest({
      key: 'mock_channel',
      sendNodeSubtype: 'send_mock_channel',
      engine: 'adapter',
      quotaChannel: 'zalo',
    });
    expect(listChannelsForStats()).toEqual([
      ...SAU_KENH,
      { key: 'mock_channel', table: 'campaign_channel_messages' },
    ]);
  });

  it('mọi kênh đều có bảng (kênh legacy mới quên khai bảng thì đỏ ở đây)', () => {
    for (const channel of listChannelsForStats()) {
      expect(['email_messages', 'zalo_messages', 'campaign_channel_messages']).toContain(channel.table);
    }
  });

  it('có trên default export như các hàm registry khác', () => {
    expect(campaignChannelRegistry.listChannelsForStats).toBe(listChannelsForStats);
  });
});
