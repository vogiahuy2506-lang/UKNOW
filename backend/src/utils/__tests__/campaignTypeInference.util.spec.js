/**
 * PLAN_THU_CONG_GOP_4_KENH — suy campaign_type từ khối gửi trong sơ đồ.
 */
import { describe, expect, it } from '@jest/globals';
import { inferCampaignTypeFromNodes, resolveCampaignTypeLimitKey } from '../campaignTypeInference.util.js';

const n = (subtype, config = {}) => ({ nodeSubtype: subtype, config });

describe('inferCampaignTypeFromNodes — họ Zalo', () => {
  it.each([
    ['chỉ khối gửi Zalo cá nhân', ['send_zalo_personal'], 'zalo'],
    ['chỉ khối kết bạn', ['send_zalo_friend_request'], 'zalo'],
    ['chỉ khối gửi nhóm', ['send_zalo_group'], 'zalo_group'],
    ['cá nhân + nhóm (trộn) -> zalo (không rơi vào mixed để khỏi lách hạn mức)', ['send_zalo_personal', 'send_zalo_group'], 'zalo'],
    ['kết bạn + nhóm', ['send_zalo_friend_request', 'send_zalo_group'], 'zalo'],
  ])('%s', (_name, subtypes, expected) => {
    expect(inferCampaignTypeFromNodes(subtypes.map((s) => n(s)), 'zalo')).toBe(expected);
    expect(inferCampaignTypeFromNodes(subtypes.map((s) => n(s)), 'zalo_group')).toBe(expected);
  });

  it('chưa có khối gửi (chỉ trigger / chọn tài khoản / lấy nhóm) -> giữ loại khai báo', () => {
    const nodes = [n('manual_trigger'), n('select_zalo_account'), n('get_all_groups')];
    expect(inferCampaignTypeFromNodes(nodes, 'zalo')).toBe('zalo');
    expect(inferCampaignTypeFromNodes(nodes, 'zalo_group')).toBe('zalo_group');
  });

  it('sơ đồ rỗng / không phải mảng -> giữ nguyên (tạo trống lưu loại mặc định của kênh)', () => {
    expect(inferCampaignTypeFromNodes([], 'zalo')).toBe('zalo');
    expect(inferCampaignTypeFromNodes(undefined, 'zalo_group')).toBe('zalo_group');
    expect(inferCampaignTypeFromNodes(null, 'telegram')).toBe('telegram');
  });

  it('đọc được node_subtype (snake_case) và data.nodeType', () => {
    expect(inferCampaignTypeFromNodes([{ node_subtype: 'send_zalo_group' }], 'zalo')).toBe('zalo_group');
    expect(inferCampaignTypeFromNodes([{ data: { nodeType: 'send_zalo_group' } }], 'zalo')).toBe('zalo_group');
  });
});

describe('inferCampaignTypeFromNodes — họ Telegram', () => {
  it('khối gửi nguồn telegram_groups -> telegram_group', () => {
    expect(inferCampaignTypeFromNodes([n('send_telegram', { recipientSource: 'telegram_groups' })], 'telegram')).toBe('telegram_group');
  });

  it('khối gửi nguồn hội thoại / nhập tay -> telegram', () => {
    expect(inferCampaignTypeFromNodes([n('send_telegram', { recipientSource: 'telegram_conversations' })], 'telegram_group')).toBe('telegram');
    expect(inferCampaignTypeFromNodes([n('send_telegram', { recipientSource: 'manual' })], 'telegram_group')).toBe('telegram');
  });

  it('nhiều khối: chỉ khi TẤT CẢ là nhóm mới là telegram_group', () => {
    const mixed = [n('send_telegram', { recipientSource: 'telegram_groups' }), n('send_telegram', { recipientSource: 'manual' })];
    expect(inferCampaignTypeFromNodes(mixed, 'telegram')).toBe('telegram');
    const allGroups = [n('send_telegram', { recipientSource: 'telegram_groups' }), n('send_telegram', { recipientSource: 'telegram_groups' })];
    expect(inferCampaignTypeFromNodes(allGroups, 'telegram')).toBe('telegram_group');
  });

  it('khối thiếu recipientSource -> theo mặc định của loại hiện tại (không đổi khi sơ đồ không đổi)', () => {
    expect(inferCampaignTypeFromNodes([n('send_telegram')], 'telegram_group')).toBe('telegram_group');
    expect(inferCampaignTypeFromNodes([n('send_telegram')], 'telegram')).toBe('telegram');
  });

  it('chưa có khối gửi Telegram -> giữ loại', () => {
    expect(inferCampaignTypeFromNodes([n('manual_trigger')], 'telegram_group')).toBe('telegram_group');
  });
});

describe('inferCampaignTypeFromNodes — loại ngoài hai họ không bao giờ bị đổi', () => {
  it.each(['email', 'whatsapp', 'mixed'])('%s', (type) => {
    const nodes = [n('send_zalo_group'), n('send_telegram', { recipientSource: 'telegram_groups' }), n('send_email')];
    expect(inferCampaignTypeFromNodes(nodes, type)).toBe(type);
  });
});

describe('resolveCampaignTypeLimitKey', () => {
  it('ánh xạ khoá hạn mức theo loại', () => {
    expect(resolveCampaignTypeLimitKey('email')).toBe('emailCampaigns');
    expect(resolveCampaignTypeLimitKey('zalo')).toBe('zaloCampaigns');
    expect(resolveCampaignTypeLimitKey('zalo_group')).toBe('zaloGroupCampaigns');
    expect(resolveCampaignTypeLimitKey('telegram')).toBeNull();
    expect(resolveCampaignTypeLimitKey('telegram_group')).toBeNull();
    expect(resolveCampaignTypeLimitKey('whatsapp')).toBeNull();
    expect(resolveCampaignTypeLimitKey('mixed')).toBeNull();
  });
});
