import { describe, expect, it } from '@jest/globals';
import { applyIdSelection, isSelectionFiltered, resolveSelectionMode } from '../selectionMode.util.js';

/**
 * Chế độ chọn người (khách hàng, bạn bè Zalo): `fixed` khai tường minh mà danh sách chọn rỗng thì KHÔNG chọn ai (fail-closed);
 * chế độ không khai giữ quy tắc cũ (có id → fixed, không id → all).
 */
describe('resolveSelectionMode', () => {
  it.each([
    ['fixed', [], 'fixed'],
    ['FIXED ', [], 'fixed'],
    ['all_exclude', [], 'all_exclude'],
    ['all_exclude', [1], 'all_exclude'],
    [undefined, [], 'all'],
    [null, [], 'all'],
    ['', [], 'all'],
    ['all', [], 'all'],
    ['linh-tinh', [], 'all'],
    [undefined, [1], 'fixed'],
    ['', ['a'], 'fixed'],
    ['all', [1], 'fixed'], // quy tắc cũ: 'all' tường minh mà vẫn còn id → coi như fixed (UI luôn xoá id khi chuyển sang 'all')
    [undefined, undefined, 'all'],
  ])('mode %j, ids %j → %s', (mode, ids, expected) => {
    expect(resolveSelectionMode(mode, ids)).toBe(expected);
  });
});

describe('applyIdSelection', () => {
  const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const getId = (item) => item.id;
  const ids = (list) => list.map((item) => item.id);

  it("'fixed' + rỗng → [] (không chọn ai)", () => {
    expect(applyIdSelection(items, { mode: 'fixed', selectedIds: [], excludedIds: [], getId })).toEqual([]);
    expect(applyIdSelection(items, { mode: 'fixed', getId })).toEqual([]);
  });

  it("'fixed' + có id → đúng tập, id lạ bị bỏ, giữ thứ tự gốc", () => {
    expect(ids(applyIdSelection(items, { mode: 'fixed', selectedIds: [3, 1, 99], getId }))).toEqual([1, 3]);
  });

  it("'fixed' bỏ qua danh sách loại trừ", () => {
    expect(ids(applyIdSelection(items, { mode: 'fixed', selectedIds: [1, 2], excludedIds: [1], getId }))).toEqual([1, 2]);
  });

  it("'all_exclude' + id loại → bỏ đúng; loại rỗng → giữ hết", () => {
    expect(ids(applyIdSelection(items, { mode: 'all_exclude', excludedIds: [2], getId }))).toEqual([1, 3]);
    expect(ids(applyIdSelection(items, { mode: 'all_exclude', excludedIds: [], getId }))).toEqual([1, 2, 3]);
  });

  it("'all' → giữ hết, kể cả khi truyền id", () => {
    expect(ids(applyIdSelection(items, { mode: 'all', selectedIds: [1], excludedIds: [2], getId }))).toEqual([1, 2, 3]);
  });

  it('đầu vào không phải mảng → []', () => {
    expect(applyIdSelection(undefined, { mode: 'all', getId })).toEqual([]);
    expect(applyIdSelection(null, { mode: 'fixed', selectedIds: [1], getId })).toEqual([]);
  });

  it('không sửa mảng gốc', () => {
    const original = [{ id: 1 }, { id: 2 }];
    applyIdSelection(original, { mode: 'fixed', selectedIds: [], getId });
    expect(original).toHaveLength(2);
  });
});

describe('isSelectionFiltered', () => {
  it("'fixed' luôn thu hẹp (kể cả rỗng = 0 người); 'all_exclude' chỉ khi có id loại; 'all' không", () => {
    expect(isSelectionFiltered({ mode: 'fixed' })).toBe(true);
    expect(isSelectionFiltered({ mode: 'all_exclude', excludedIds: [1] })).toBe(true);
    expect(isSelectionFiltered({ mode: 'all_exclude', excludedIds: [] })).toBe(false);
    expect(isSelectionFiltered({ mode: 'all' })).toBe(false);
  });
});
