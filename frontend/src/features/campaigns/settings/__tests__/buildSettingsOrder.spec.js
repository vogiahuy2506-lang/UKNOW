import { describe, expect, it } from 'vitest';
import buildSettingsOrder from '../buildSettingsOrder';

const n = (id, nodeType, type = 'task') => ({ id, type, data: { label: id, nodeType, config: {} } });
const e = (source, target, label) => ({ id: `${source}-${target}`, source, target, ...(label ? { label } : {}) });
const ids = (entries) => entries.map((entry) => entry.node.id);

describe('buildSettingsOrder', () => {
  it('đi từ khối khởi chạy theo cạnh, đánh số bước 1..n', () => {
    const { ordered, unconnected } = buildSettingsOrder(
      [n('send', 'send_email'), n('start', 'manual_trigger', 'start'), n('sheet', 'read_sheet')],
      [e('start', 'sheet'), e('sheet', 'send')],
    );
    expect(ids(ordered)).toEqual(['start', 'sheet', 'send']);
    expect(ordered.map((entry) => entry.step)).toEqual([1, 2, 3]);
    expect(unconnected).toEqual([]);
  });

  it('khối không với tới từ khối khởi chạy → nhóm "chưa nối", không lẫn vào thứ tự chạy', () => {
    const { ordered, unconnected } = buildSettingsOrder(
      [n('start', 'manual_trigger', 'start'), n('a', 'read_sheet'), n('lac', 'send_email'), n('lac2', 'tag_contact')],
      [e('start', 'a'), e('lac', 'lac2')],
    );
    expect(ids(ordered)).toEqual(['start', 'a']);
    expect(ids(unconnected.map((node) => ({ node })))).toEqual(['lac', 'lac2']);
  });

  it('nhánh điều kiện: khối đi ra từ cạnh có nhãn mang nhãn nhánh + khối nguồn; thứ tự theo cạnh', () => {
    const { ordered } = buildSettingsOrder(
      [n('start', 'manual_trigger', 'start'), n('cond', 'condition'), n('yes', 'send_email'), n('no', 'send_zalo_personal')],
      [e('start', 'cond'), e('cond', 'yes', 'Có email'), e('cond', 'no', 'Không có')],
    );
    expect(ids(ordered)).toEqual(['start', 'cond', 'yes', 'no']);
    expect(ordered[0].branch).toBeNull();
    expect(ordered[1].branch).toBeNull();
    expect(ordered[2].branch).toEqual({ label: 'Có email', fromId: 'cond' });
    expect(ordered[3].branch).toEqual({ label: 'Không có', fromId: 'cond' });
  });

  it('mỗi khối đúng một lần dù có vòng hoặc hai nhánh nhập lại', () => {
    const { ordered } = buildSettingsOrder(
      [n('start', 'manual_trigger', 'start'), n('a', 'condition'), n('b', 'send_email'), n('c', 'send_email'), n('m', 'tag_contact')],
      [e('start', 'a'), e('a', 'b', 'x'), e('a', 'c', 'y'), e('b', 'm'), e('c', 'm'), e('m', 'a')],
    );
    expect(ids(ordered)).toEqual(['start', 'a', 'b', 'c', 'm']);
  });

  it('không có khối khởi chạy: lấy khối không có cạnh vào làm gốc; khối kết thúc (end) bị bỏ', () => {
    const { ordered, unconnected } = buildSettingsOrder(
      [n('a', 'read_sheet'), n('b', 'send_email'), n('fin', 'end', 'end')],
      [e('a', 'b'), e('b', 'fin')],
    );
    expect(ids(ordered)).toEqual(['a', 'b']);
    expect(unconnected).toEqual([]);
  });

  it('đầu vào rỗng / sai kiểu không vỡ; cạnh trỏ tới khối đã xoá bị bỏ qua', () => {
    expect(buildSettingsOrder(undefined, undefined)).toEqual({ ordered: [], unconnected: [] });
    const { ordered } = buildSettingsOrder([n('start', 'manual_trigger', 'start')], [e('start', 'ma')]);
    expect(ids(ordered)).toEqual(['start']);
  });
});
