import { describe, it, expect } from '@jest/globals';
import campaignFlowService from '../campaignFlow.service.js';

// PR-T2 — `normalizeNodeReferenceConfig` phải đổi id tạm của sơ đồ sang id DB cho cả ba trường tham chiếu mà trước đây
// bị bỏ sót (lưu xong tải lại, `tagSourceNodeId` vẫn trỏ id tạm → khối Gắn tag không tìm thấy nguồn).
describe('normalizeNodeReferenceConfig — tham chiếu của khối Gắn tag / Cập nhật thông tin / Kết bạn Zalo', () => {
  const resolve = (id) => ({ tmp1: '501', tmp2: '502', tmp3: '503' }[String(id)] || String(id));

  it('đổi tagSourceNodeId, attributeSourceNodeId, zaloFriendAccountNodeId', () => {
    const out = campaignFlowService.normalizeNodeReferenceConfig(
      { tagSourceNodeId: 'tmp1', attributeSourceNodeId: 'tmp2', zaloFriendAccountNodeId: 'tmp3', tagName: 'VIP' },
      resolve,
    );
    expect(out).toMatchObject({
      tagSourceNodeId: '501', attributeSourceNodeId: '502', zaloFriendAccountNodeId: '503', tagName: 'VIP',
    });
  });

  it('giá trị rỗng / thiếu giữ nguyên (không biến thành chuỗi "undefined")', () => {
    const out = campaignFlowService.normalizeNodeReferenceConfig({ tagSourceNodeId: '' }, resolve);
    expect(out.tagSourceNodeId).toBe('');
    expect(out.attributeSourceNodeId).toBeUndefined();
  });
});
