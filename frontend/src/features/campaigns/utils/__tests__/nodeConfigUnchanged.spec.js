import { describe, expect, it } from 'vitest';
import { createNodeConfigFormData } from '../nodeConfigModal.helpers';
import { isNodeConfigFormUnchanged } from '../nodeConfigUnchanged';

// Config thật của chiến dịch 451 (nhóm Zalo, tạo bằng trình từng bước) đúng như GET /campaigns/451 trả.
const GROUP_ID = '4861811561350172387';
const NODES = [
  { id: '4349', type: 'task', data: { label: 'Bắt đầu (Manual Trigger)', nodeType: 'manual_trigger', config: {} } },
  { id: '4350', type: 'task', data: { label: 'Chọn tài khoản Zalo', nodeType: 'select_zalo_account', config: { zaloAccountId: 103, zaloPoolMultiAccountEnabled: false } } },
  {
    id: '4351',
    type: 'task',
    data: {
      label: 'Lấy thông tin nhóm Zalo',
      nodeType: 'get_all_groups',
      config: { zaloGroupIds: [GROUP_ID], zaloSelectedGroupIds: [GROUP_ID], zaloGroupAccountNodeId: '4350' },
    },
  },
  {
    id: '4352',
    type: 'task',
    data: {
      label: 'Gửi tin nhắn nhóm Zalo',
      nodeType: 'send_zalo_group',
      config: {
        zaloGroupIds: [GROUP_ID],
        zaloAccountId: 103,
        saveMessageLog: true,
        zaloGroupField: 'groupId',
        zaloGroupNodeId: '4351',
        zaloGroupSource: 'node',
        zaloGroupSendMode: 'all',
        zaloSelectedGroupIds: [GROUP_ID],
        zaloGroupTemplateSteps: [{ message: 'Tin thử', delayUnit: 'days', delayValue: 0, templateId: '830', templateMappings: [] }],
      },
    },
  },
];

/** Form mà hộp cấu hình hiển thị (và ghi lại khi bấm Lưu mà không đổi gì). */
const formAsModalWouldSave = (node) => createNodeConfigFormData({
  config: node.data.config,
  label: node.data.label,
  normalizeEmailSteps: true,
  nodeType: node.data.nodeType,
  campaignType: 'zalo_group',
});

describe('isNodeConfigFormUnchanged — Lưu hộp cấu hình mà không đổi gì', () => {
  it.each(NODES.map((node) => [node.data.nodeType, node]))('%s: form lúc mở = form lúc Lưu → không đổi', (_name, node) => {
    expect(isNodeConfigFormUnchanged(node, formAsModalWouldSave(node), 'zalo_group')).toBe(true);
  });

  it('ghim nguyên nhân: form của hộp KHÁC config đã lưu (thêm cả bộ trường mặc định) nên so chuỗi thẳng sẽ báo Chưa lưu', () => {
    NODES.forEach((node) => {
      expect(JSON.stringify(formAsModalWouldSave(node))).not.toBe(JSON.stringify(node.data.config));
    });
  });

  it('đổi tên khối → có đổi', () => {
    const node = NODES[3];
    expect(isNodeConfigFormUnchanged(node, { ...formAsModalWouldSave(node), label: 'Tên mới' }, 'zalo_group')).toBe(false);
  });

  it('đổi một trường cấu hình (nhóm gửi) → có đổi', () => {
    const node = NODES[3];
    const form = { ...formAsModalWouldSave(node), zaloGroupSendMode: 'selected' };
    expect(isNodeConfigFormUnchanged(node, form, 'zalo_group')).toBe(false);
  });

  it('đổi nội dung bên trong mảng lồng nhau → có đổi', () => {
    const node = NODES[3];
    const form = formAsModalWouldSave(node);
    const changed = { ...form, zaloGroupTemplateSteps: [{ ...form.zaloGroupTemplateSteps[0], message: 'Tin khác' }] };
    expect(isNodeConfigFormUnchanged(node, changed, 'zalo_group')).toBe(false);
  });

  it('thêm trường mới người dùng nhập → có đổi (không nuốt thay đổi thật)', () => {
    const node = NODES[0];
    expect(isNodeConfigFormUnchanged(node, { ...formAsModalWouldSave(node), description: 'ghi chú' }, 'zalo_group')).toBe(false);
  });

  it('thiếu dữ liệu → coi là có đổi (an toàn)', () => {
    expect(isNodeConfigFormUnchanged(null, {}, 'zalo_group')).toBe(false);
    expect(isNodeConfigFormUnchanged(NODES[0], null, 'zalo_group')).toBe(false);
  });
});
