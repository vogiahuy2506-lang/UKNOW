import { describe, expect, it } from 'vitest';
import { removeNodeClearingReferences } from '../settingsGraph';

// PLAN_THAM_CHIEU_KHOI PR-1 Việc 1.7 — xoá khối trên canvas phải dọn tham chiếu tới khối đó ở các khối còn lại
// (trước đây chỉ lọc nodes/edges → ô nguồn giữ id chết, lưu xong chạy ra 0 người).

const node = (id, nodeType, config = {}) => ({ id, type: nodeType, data: { nodeType, label: nodeType, config } });
const edge = (source, target) => ({ id: `e-${source}-${target}`, source, target });

describe('removeNodeClearingReferences', () => {
  const nodes = [
    node('t', 'manual_trigger'),
    node('src', 'get_all_groups'),
    node('send', 'send_zalo_group', {
      zaloGroupSource: 'node',
      zaloGroupNodeId: 'src',
      zaloGroupField: 'groupId',
      zaloGroupTemplateSteps: [{ templateId: 1, templateMappings: [{ nodeId: 'src', key: 'ten' }] }],
    }),
    node('other', 'send_email', { recipientSource: 'node', recipientNodeId: 'khac' }),
  ];
  const edges = [edge('t', 'src'), edge('src', 'send'), edge('t', 'other')];

  it('xoá khối nguồn → tham chiếu ở khối gửi (cả phẳng lẫn templateMappings) thành "", khối + cạnh dính nó biến mất', () => {
    const result = removeNodeClearingReferences({ nodes, edges, nodeId: 'src' });
    expect(result.nodes.map((n) => n.id)).toEqual(['t', 'send', 'other']);
    expect(result.edges.map((e) => e.id)).toEqual(['e-t-other']);
    const send = result.nodes.find((n) => n.id === 'send');
    expect(send.data.config.zaloGroupNodeId).toBe('');
    expect(send.data.config.zaloGroupTemplateSteps[0].templateMappings[0].nodeId).toBe('');
    // trường khác giữ nguyên
    expect(send.data.config.zaloGroupField).toBe('groupId');
    expect(send.data.config.zaloGroupSource).toBe('node');
  });

  it('khối không tham chiếu tới khối bị xoá giữ NGUYÊN object (không tạo bản sao thừa)', () => {
    const result = removeNodeClearingReferences({ nodes, edges, nodeId: 'src' });
    expect(result.nodes.find((n) => n.id === 'other')).toBe(nodes[3]);
    expect(result.nodes.find((n) => n.id === 't')).toBe(nodes[0]);
  });

  it('không đột biến mảng / khối gốc', () => {
    removeNodeClearingReferences({ nodes, edges, nodeId: 'src' });
    expect(nodes).toHaveLength(4);
    expect(nodes[2].data.config.zaloGroupNodeId).toBe('src');
  });

  it('id số và id chuỗi coi như nhau', () => {
    const numeric = [node(1, 'get_all_groups'), node(2, 'send_zalo_group', { zaloGroupSource: 'node', zaloGroupNodeId: '1' })];
    const result = removeNodeClearingReferences({ nodes: numeric, edges: [edge(1, 2)], nodeId: 1 });
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].data.config.zaloGroupNodeId).toBe('');
    expect(result.edges).toEqual([]);
  });

  it('dùng riêng cho nodes hoặc edges (CampaignBuilder gọi tách hai setState)', () => {
    expect(removeNodeClearingReferences({ nodes: [], edges, nodeId: 'src' }).edges.map((e) => e.id)).toEqual(['e-t-other']);
    expect(removeNodeClearingReferences({ nodes, edges: [], nodeId: 'src' }).nodes).toHaveLength(3);
  });
});
