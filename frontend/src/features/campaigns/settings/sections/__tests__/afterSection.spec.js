import { describe, expect, it } from 'vitest';
import { TAG_NAME_MAX, isTagStepChanged, readTagStep, validateTagStep, writeTagStep } from '../afterSection';
import { ADDABLE_SIDE_STEP_SUBTYPES, NOT_RUN_SIDE_STEP_SUBTYPES } from '../../settingsGraph';

const node = (id, nodeType, config = {}) => ({ id, type: 'task', data: { label: id, nodeType, config } });
const edge = (source, target) => ({ id: `${source}-${target}`, source, target });

const GRAPH = {
  nodes: [node('t', 'manual_trigger'), node('src', 'read_interested_customers'), node('mail', 'send_email'), node('tag', 'tag_contact', { tagName: ' Khách  VIP ' })],
  edges: [edge('t', 'src'), edge('src', 'mail'), edge('mail', 'tag')],
};

describe('bước Gắn tag — đọc / kiểm / ghi', () => {
  it('Gắn tag chạy thật nên được mời thêm; chỉ Cập nhật thông tin còn mang cảnh báo "chưa chạy"', () => {
    expect(ADDABLE_SIDE_STEP_SUBTYPES).toEqual(['save_customer', 'tag_contact']);
    expect(NOT_RUN_SIDE_STEP_SUBTYPES).toEqual(['update_attribute']);
  });

  it('readTagStep: mặc định add, gộp khoảng trắng; remove giữ nguyên', () => {
    expect(readTagStep(GRAPH.nodes[3])).toEqual({ action: 'add', name: 'Khách VIP' });
    expect(readTagStep(node('x', 'tag_contact', { tagAction: 'remove', tagName: 'a' }))).toEqual({ action: 'remove', name: 'a' });
    expect(readTagStep(node('x', 'tag_contact', { tagAction: 'lạ' })).action).toBe('add');
  });

  it('validateTagStep: trống / quá dài không hợp lệ', () => {
    expect(validateTagStep({ name: '   ' })).toEqual({ ok: false, problem: 'empty' });
    expect(validateTagStep({ name: 'x'.repeat(TAG_NAME_MAX + 1) })).toEqual({ ok: false, problem: 'tooLong' });
    expect(validateTagStep({ name: 'x'.repeat(TAG_NAME_MAX) }).ok).toBe(true);
  });

  it('isTagStepChanged so sánh sau khi chuẩn hoá khoảng trắng', () => {
    expect(isTagStepChanged({ action: 'add', name: 'a  b' }, { action: 'add', name: 'a b' })).toBe(false);
    expect(isTagStepChanged({ action: 'remove', name: 'a b' }, { action: 'add', name: 'a b' })).toBe(true);
  });

  it('writeTagStep: ghi hành động + tên đã chuẩn hoá, tự điền nguồn của chuỗi khi chưa có', () => {
    const result = writeTagStep(GRAPH.nodes, GRAPH.edges, 'tag', { action: 'remove', name: '  Khách   VIP ' });
    expect(result.nodes.find((item) => item.id === 'tag').data.config).toEqual({ tagAction: 'remove', tagName: 'Khách VIP', tagSourceNodeId: 'src' });
    expect(result.edges).toBe(GRAPH.edges);
  });

  it('writeTagStep: nguồn đang trỏ tới khối còn tồn tại thì GIỮ; trỏ tới khối đã xoá thì điền lại khối nguồn của chuỗi', () => {
    const keep = writeTagStep(
      GRAPH.nodes.map((item) => (item.id === 'tag' ? node('tag', 'tag_contact', { tagName: 'a', tagSourceNodeId: 'mail' }) : item)),
      GRAPH.edges, 'tag', { action: 'add', name: 'b' },
    );
    expect(keep.nodes.find((item) => item.id === 'tag').data.config.tagSourceNodeId).toBe('mail');
    const fix = writeTagStep(
      GRAPH.nodes.map((item) => (item.id === 'tag' ? node('tag', 'tag_contact', { tagName: 'a', tagSourceNodeId: 'da-xoa' }) : item)),
      GRAPH.edges, 'tag', { action: 'add', name: 'b' },
    );
    expect(fix.nodes.find((item) => item.id === 'tag').data.config.tagSourceNodeId).toBe('src');
  });

  it('writeTagStep: không đổi gì → trả lại NGUYÊN mảng nodes cũ; khối không tồn tại → null', () => {
    const settled = writeTagStep(GRAPH.nodes, GRAPH.edges, 'tag', { action: 'add', name: 'Khách VIP' }).nodes;
    expect(writeTagStep(settled, GRAPH.edges, 'tag', { action: 'add', name: 'Khách VIP' }).nodes).toBe(settled);
    expect(writeTagStep(GRAPH.nodes, GRAPH.edges, 'khong-co', { action: 'add', name: 'a' })).toBeNull();
  });
});
