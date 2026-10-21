import { describe, expect, it } from 'vitest';
import {
  MISSING_SOURCE_NODE_MESSAGE,
  validateNodeForRun,
} from '../campaignBuilderRunValidation';

// PLAN_THAM_CHIEU_KHOI PR-1 Việc 1.7 — "Chạy thử" trước đây chỉ đòi id khối nguồn KHÁC RỖNG: id chết (khối đã bị xoá / sót từ bản gốc khi
// nhân bản) vẫn qua, rồi chạy ra 0 người. Truyền tập id khối đang có → báo "không còn tồn tại".

const groupNode = (config) => ({
  id: 'send-1',
  type: 'send_zalo_group',
  data: { nodeType: 'send_zalo_group', config: { zaloGroupMessage: 'Xin chào', ...config } },
});

describe('validateNodeForRun — khối nguồn không còn tồn tại', () => {
  it('Zalo nhóm: id nguồn ngoài tập khối → "không còn tồn tại"', () => {
    const node = groupNode({ zaloGroupSource: 'node', zaloGroupNodeId: '4030', zaloGroupField: 'groupId' });
    const res = validateNodeForRun(node, { nodeIds: new Set(['4064', '4065', '4066']) });
    expect(res.status).toBe('failed');
    expect(res.message).toBe(MISSING_SOURCE_NODE_MESSAGE);
    expect(res.message).toContain('không còn tồn tại');
  });

  it('Zalo nhóm: id nguồn thuộc tập khối → qua', () => {
    const node = groupNode({ zaloGroupSource: 'node', zaloGroupNodeId: '4065', zaloGroupField: 'groupId' });
    expect(validateNodeForRun(node, { nodeIds: new Set(['4065']) }).status).toBe('success');
  });

  it('nhận cả mảng id và id số; so theo chuỗi', () => {
    const node = groupNode({ zaloGroupSource: 'node', zaloGroupNodeId: 4065, zaloGroupField: 'groupId' });
    expect(validateNodeForRun(node, { nodeIds: ['4065'] }).status).toBe('success');
    expect(validateNodeForRun(node, { nodeIds: [4066] }).status).toBe('failed');
  });

  it('id nguồn RỖNG vẫn báo "Chưa chọn node dữ liệu" (không gộp với "không còn tồn tại")', () => {
    const node = groupNode({ zaloGroupSource: 'node', zaloGroupNodeId: '', zaloGroupField: 'groupId' });
    const res = validateNodeForRun(node, { nodeIds: new Set(['4065']) });
    expect(res.message).toBe('Chưa chọn node dữ liệu');
  });

  it('không truyền nodeIds → giữ hành vi cũ (chỉ đòi khác rỗng)', () => {
    const node = groupNode({ zaloGroupSource: 'node', zaloGroupNodeId: '4030', zaloGroupField: 'groupId' });
    expect(validateNodeForRun(node).status).toBe('success');
  });

  it('chế độ nhập tay không bị kiểm nguồn dù còn id cũ', () => {
    const node = groupNode({ zaloGroupSource: 'manual', zaloGroupIds: 'g1', zaloGroupNodeId: '4030' });
    expect(validateNodeForRun(node, { nodeIds: new Set(['4065']) }).status).toBe('success');
  });

  it('Zalo cá nhân và kết bạn dùng cùng luật', () => {
    const personal = {
      id: 'p', type: 'send_zalo_personal',
      data: { nodeType: 'send_zalo_personal', config: { zaloRecipientSource: 'node', zaloRecipientNodeId: '77', zaloRecipientField: 'phone', zaloMessage: 'Hi' } },
    };
    const friend = {
      id: 'f', type: 'send_zalo_friend_request',
      data: { nodeType: 'send_zalo_friend_request', config: { zaloFriendSource: 'node', zaloFriendNodeId: '77', zaloFriendField: 'phone', zaloFriendRequestMessage: 'Hi' } },
    };
    const nodeIds = new Set(['1', '2']);
    expect(validateNodeForRun(personal, { nodeIds }).message).toBe(MISSING_SOURCE_NODE_MESSAGE);
    expect(validateNodeForRun(friend, { nodeIds }).message).toBe(MISSING_SOURCE_NODE_MESSAGE);
  });

  it('Email: nguồn node có id ngoài tập → "không còn tồn tại"; id thuộc tập → qua', () => {
    const email = (recipientNodeId) => ({
      id: 'e', type: 'send_email',
      data: {
        nodeType: 'send_email',
        config: {
          recipientSource: 'node',
          recipientNodeId,
          recipientField: 'email',
          emailSteps: [{ templateId: 10, emailSubject: 'Chào', emailBody: '<p>Nội dung</p>', templateMappings: [] }],
        },
      },
    });
    expect(validateNodeForRun(email('n9'), { nodeIds: new Set(['n2']) }).message).toBe(MISSING_SOURCE_NODE_MESSAGE);
    expect(validateNodeForRun(email('n2'), { nodeIds: new Set(['n2']) }).status).toBe('success');
  });
});
