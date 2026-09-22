/**
 * Bộ quyền bật sẵn cho nhân viên mới.
 *
 * Ghim TỪNG phần tử theo hai chiều (thiếu một khoá cũng đỏ, thừa một khoá cũng đỏ) — bảng
 * hằng số ghim kiểu "độ dài + vài mẫu" từng để lọt phần tử thiếu.
 */
import { describe, it, expect } from '@jest/globals';
import {
  PERMISSION_CATALOG,
  VALID_PERMISSION_KEYS,
  DEFAULT_NEW_EMPLOYEE_PERMISSION_KEYS,
  buildDefaultNewEmployeePermissions,
} from '../employeePermissionCatalog.js';

/** Đổi bộ này là đổi thứ khách nhìn thấy ngay khi vừa được thêm — phải sửa test cùng lúc. */
const EXPECTED_DEFAULT_KEYS = ['campaigns_view', 'reports_view'];

describe('DEFAULT_NEW_EMPLOYEE_PERMISSION_KEYS', () => {
  it.each(EXPECTED_DEFAULT_KEYS)('%s nằm trong bộ mặc định', (key) => {
    expect(DEFAULT_NEW_EMPLOYEE_PERMISSION_KEYS).toContain(key);
  });

  it.each(VALID_PERMISSION_KEYS.filter((k) => !EXPECTED_DEFAULT_KEYS.includes(k)))(
    '%s KHÔNG được bật sẵn',
    (key) => {
      expect(DEFAULT_NEW_EMPLOYEE_PERMISSION_KEYS).not.toContain(key);
    }
  );

  it('không có quyền rủi ro cao nào lọt vào bộ mặc định', () => {
    const risky = DEFAULT_NEW_EMPLOYEE_PERMISSION_KEYS.filter(
      (key) => PERMISSION_CATALOG[key].riskLevel !== 'low'
    );
    expect(risky).toEqual([]);
  });
});

describe('buildDefaultNewEmployeePermissions()', () => {
  it('trả đủ 22 khoá của catalog, không thừa không thiếu', () => {
    expect(Object.keys(buildDefaultNewEmployeePermissions()).sort()).toEqual(
      [...VALID_PERMISSION_KEYS].sort()
    );
  });

  it('chỉ các khoá mặc định là true, còn lại false thật (không phải undefined)', () => {
    const permissions = buildDefaultNewEmployeePermissions();
    for (const key of VALID_PERMISSION_KEYS) {
      expect(permissions[key]).toBe(EXPECTED_DEFAULT_KEYS.includes(key));
    }
  });

  it('mỗi lần gọi trả một object mới — sửa kết quả không làm bẩn lần gọi sau', () => {
    const first = buildDefaultNewEmployeePermissions();
    first.campaigns_run = true;
    expect(buildDefaultNewEmployeePermissions().campaigns_run).toBe(false);
  });
});
