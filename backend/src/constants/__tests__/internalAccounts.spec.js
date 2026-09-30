import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { DEFAULT_INTERNAL_USER_IDS, getInternalUserIds } from '../internalAccounts.js';

/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-6 — danh sách tài khoản NỘI BỘ dùng chung cho mọi màn admin (PR-9 dùng lại).
 */
afterEach(() => {
  jest.restoreAllMocks();
});

describe('getInternalUserIds', () => {
  it('mặc định 39 và 116 (không đặt env, hoặc chỉ khoảng trắng)', () => {
    expect(getInternalUserIds({})).toEqual([39, 116]);
    expect(getInternalUserIds({ INTERNAL_USER_IDS: undefined })).toEqual([39, 116]);
    expect(getInternalUserIds({ INTERNAL_USER_IDS: '' })).toEqual([39, 116]);
    expect(getInternalUserIds({ INTERNAL_USER_IDS: '   ' })).toEqual([39, 116]);
    expect(DEFAULT_INTERNAL_USER_IDS).toEqual([39, 116]);
  });

  it('đọc từ env "39,116" và mọi danh sách khác, bỏ khoảng trắng và id trùng, giữ thứ tự', () => {
    expect(getInternalUserIds({ INTERNAL_USER_IDS: '39,116' })).toEqual([39, 116]);
    expect(getInternalUserIds({ INTERNAL_USER_IDS: ' 5 , 6,5 ,7 ' })).toEqual([5, 6, 7]);
    expect(getInternalUserIds({ INTERNAL_USER_IDS: '42' })).toEqual([42]);
    expect(getInternalUserIds({ INTERNAL_USER_IDS: '7,,8,' })).toEqual([7, 8]);
  });

  it('đọc LÚC GỌI từ process.env (không chốt lúc nạp module)', () => {
    const before = process.env.INTERNAL_USER_IDS;
    try {
      process.env.INTERNAL_USER_IDS = '1,2';
      expect(getInternalUserIds()).toEqual([1, 2]);
      process.env.INTERNAL_USER_IDS = '3';
      expect(getInternalUserIds()).toEqual([3]);
      delete process.env.INTERNAL_USER_IDS;
      expect(getInternalUserIds()).toEqual([39, 116]);
    } finally {
      if (before === undefined) delete process.env.INTERNAL_USER_IDS;
      else process.env.INTERNAL_USER_IDS = before;
    }
  });

  it('phần tử sai (chữ, số âm, 0, số thập phân) bị bỏ kèm cảnh báo; còn id hợp lệ thì dùng', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getInternalUserIds({ INTERNAL_USER_IDS: '39, abc, -5, 0, 1.5, 116' })).toEqual([39, 116]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('abc');
  });

  it('toàn phần tử sai → rơi về MẶC ĐỊNH (gõ nhầm env không được âm thầm tắt việc loại nội bộ)', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getInternalUserIds({ INTERNAL_USER_IDS: 'abc,def' })).toEqual([39, 116]);
    expect(getInternalUserIds({ INTERNAL_USER_IDS: '0' })).toEqual([39, 116]);
  });

  it('trả mảng MỚI mỗi lần: người gọi sửa mảng không làm hỏng mặc định', () => {
    const first = getInternalUserIds({});
    first.push(999);
    expect(getInternalUserIds({})).toEqual([39, 116]);
    expect(DEFAULT_INTERNAL_USER_IDS).toEqual([39, 116]);
    expect(Object.isFrozen(DEFAULT_INTERNAL_USER_IDS)).toBe(true);
  });

  it('cảnh báo giá trị sai đúng MỘT lần cho mỗi chuỗi (hàm được gọi mỗi request)', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    for (let i = 0; i < 5; i += 1) getInternalUserIds({ INTERNAL_USER_IDS: '11,khac-lan-mot' });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
