import { describe, expect, it } from 'vitest';
import { CHANNEL_NODE_TYPES, getLockedNodeChannels } from '../campaignBuilderFlow';

/**
 * PLAN_KENH_KHONG_AN_KHOA_VA_GOI_Y_MUA_2026-10-11 — bảng "node -> kênh" cho những kênh ĐANG HIỆN nhưng CHƯA DÙNG ĐƯỢC.
 */
describe('getLockedNodeChannels', () => {
  const usable = { visible: true, available: true };
  const locked = { visible: true, available: false };

  it('mọi kênh dùng được -> không khoá node nào', () => {
    expect(getLockedNodeChannels({ email: usable, zalo: usable, telegram: usable, whatsapp: usable })).toEqual({});
  });

  it('Telegram khoá -> chỉ send_telegram', () => {
    expect(getLockedNodeChannels({ email: usable, zalo: usable, telegram: locked, whatsapp: usable })).toEqual({ send_telegram: 'telegram' });
  });

  it('Zalo khoá -> cả 3 khối gửi Zalo và 3 khối chỉ phục vụ Zalo (chọn tài khoản, lấy bạn bè, lấy nhóm)', () => {
    const result = getLockedNodeChannels({ email: usable, zalo: locked });
    expect(Object.keys(result).sort()).toEqual([
      'get_all_friends', 'get_all_groups', 'select_zalo_account', 'send_zalo_friend_request', 'send_zalo_group', 'send_zalo_personal',
    ]);
    expect(new Set(Object.values(result))).toEqual(new Set(['zalo']));
  });

  it('Email khoá -> send_email; kênh không hiện (visible:false, cờ hệ thống tắt) thì không có trong bảng; thiếu thông tin kênh thì bỏ qua', () => {
    expect(getLockedNodeChannels({ email: locked })).toEqual({ send_email: 'email' });
    expect(getLockedNodeChannels({ whatsapp: { visible: false, available: false } })).toEqual({});
    expect(getLockedNodeChannels({})).toEqual({});
    expect(getLockedNodeChannels()).toEqual({});
  });

  it('CHANNEL_NODE_TYPES không để một node thuộc hai kênh (bảng ngược sẽ ghi đè lẫn nhau)', () => {
    const seen = new Map();
    for (const [channel, types] of Object.entries(CHANNEL_NODE_TYPES)) {
      for (const type of types) {
        expect(seen.has(type), `${type} thuộc cả ${seen.get(type)} và ${channel}`).toBe(false);
        seen.set(type, channel);
      }
    }
  });
});
