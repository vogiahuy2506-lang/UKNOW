/**
 * PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G2 — chuẩn hoá phạm vi tài khoản Zalo cho tầng repository.
 * null = không lọc; mảng = chỉ các id này; mọi thứ khác = [] (hỏng thì chặn).
 */
import { describe, expect, it } from '@jest/globals';
import { normalizeZaloAccessScope, pushZaloAccessFilter } from '../zaloAccessScope.util.js';

describe('normalizeZaloAccessScope', () => {
  it('null giữ nguyên (chủ / super admin)', () => {
    expect(normalizeZaloAccessScope(null)).toBeNull();
  });

  it('mảng: ép số, bỏ id rác / trùng, giữ thứ tự', () => {
    expect(normalizeZaloAccessScope([5, '7', 'x', -1, 0, 1.5, null, 5, 9])).toEqual([5, 7, 9]);
    expect(normalizeZaloAccessScope([])).toEqual([]);
  });

  it('HỎNG THÌ CHẶN: undefined / chuỗi / số / đối tượng → []', () => {
    for (const bad of [undefined, 'all', '5', 5, true, {}, { length: 1 }]) {
      expect(normalizeZaloAccessScope(bad)).toEqual([]);
    }
  });
});

describe('pushZaloAccessFilter', () => {
  it('null → chuỗi rỗng, KHÔNG đẩy tham số', () => {
    const params = [1, 2];
    expect(pushZaloAccessFilter(null, 'zp.id_zalo_setting', params)).toBe('');
    expect(params).toEqual([1, 2]);
  });

  it('mảng → đẩy mảng vào cuối params và đánh số theo độ dài hiện tại', () => {
    const params = [1, 2, 'x'];
    expect(pushZaloAccessFilter([5, 6], 'zpc.id_zalo_setting', params)).toBe('AND zpc.id_zalo_setting = ANY($4::bigint[])');
    expect(params).toEqual([1, 2, 'x', [5, 6]]);
  });

  it('thiếu phạm vi → vẫn lọc với mảng rỗng', () => {
    const params = [1];
    expect(pushZaloAccessFilter(undefined, 'c.id_zalo_setting', params)).toBe('AND c.id_zalo_setting = ANY($2::bigint[])');
    expect(params).toEqual([1, []]);
  });
});
