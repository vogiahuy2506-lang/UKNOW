import { describe, it, expect } from 'vitest';
import {
  PERMISSION_PRESETS,
  buildPermissionPreset,
  countGrantedPermissions,
  findEmployeeAfterAdd,
  getEmployeeErrorInfo,
  toPermissionState,
} from '../employeeManagement.helpers';

const ALL = ['campaigns_view', 'campaigns_create', 'campaigns_run', 'email_templates', 'zalo_templates',
  'landing_pages', 'forms', 'customers', 'leads', 'reports_view', 'ai_assistant_use', 'courses', 'inbox_view'];

describe('countGrantedPermissions', () => {
  it.each([
    ['mảng rỗng (mặc định nhân viên mới)', [], 0],
    ['null', null, 0],
    ['undefined', undefined, 0],
    ['object rỗng', {}, 0],
    ['toàn false', { a: false, b: false }, 0],
    ['chuỗi "true" không tính (chỉ boolean true)', { a: 'true' }, 0],
    ['3 true lẫn false', { a: true, b: false, c: true, d: true }, 3],
    ['mảng có phần tử không phải bản đồ quyền', ['campaigns_view'], 0],
  ])('%s → %s', (_label, input, expected) => {
    expect(countGrantedPermissions(input)).toBe(expected);
  });
});

describe('toPermissionState', () => {
  it('mảng rỗng và giá trị rỗng → {}', () => {
    expect(toPermissionState([])).toEqual({});
    expect(toPermissionState(null)).toEqual({});
    expect(toPermissionState(undefined)).toEqual({});
  });
  it('object giữ nguyên', () => {
    const perms = { campaigns_view: true };
    expect(toPermissionState(perms)).toBe(perms);
  });
});

describe('buildPermissionPreset', () => {
  const grantedOf = (map) => Object.keys(map).filter((k) => map[k]).sort();

  it('mọi khoá đều có mặt (true/false) để bộ mới thay hẳn bộ cũ', () => {
    const map = buildPermissionPreset('viewOnly', ALL);
    expect(Object.keys(map).sort()).toEqual([...ALL].sort());
  });

  it('viewOnly chỉ tick 4 khoá xem', () => {
    expect(grantedOf(buildPermissionPreset('viewOnly', ALL))).toEqual(['campaigns_view', 'customers', 'leads', 'reports_view']);
  });

  it('marketing: 3 quyền chiến dịch + mẫu tin + landing/forms/khách/leads + báo cáo + trợ lý AI, KHÔNG có courses/inbox', () => {
    const granted = grantedOf(buildPermissionPreset('marketing', ALL));
    expect(granted).toEqual([...PERMISSION_PRESETS.marketing].sort());
    expect(granted).not.toContain('courses');
    expect(granted).not.toContain('inbox_view');
  });

  it('all tick mọi khoá; none bỏ mọi khoá', () => {
    expect(grantedOf(buildPermissionPreset('all', ALL))).toEqual([...ALL].sort());
    expect(grantedOf(buildPermissionPreset('none', ALL))).toEqual([]);
  });

  it('preset lạ → không tick gì (không ném lỗi)', () => {
    expect(grantedOf(buildPermissionPreset('khong-co', ALL))).toEqual([]);
  });

  it('khoá của preset không có trên màn hình thì bị bỏ (không bịa ô mới)', () => {
    const map = buildPermissionPreset('viewOnly', ['campaigns_view']);
    expect(map).toEqual({ campaigns_view: true });
  });
});

describe('findEmployeeAfterAdd', () => {
  const list = [
    { id: '5', email: 'a@x.com' },
    { id: '12', email: 'b@x.com' },
  ];

  it('theo id — id backend là chuỗi (BIGINT), so bằng String nên số cũng khớp', () => {
    expect(findEmployeeAfterAdd(list, { id: '12' })).toBe(list[1]);
    expect(findEmployeeAfterAdd(list, { id: 12 })).toBe(list[1]);
  });

  it('không có id (backend cũ) → theo email, không phân biệt hoa/thường và khoảng trắng', () => {
    expect(findEmployeeAfterAdd(list, { email: '  B@X.com ' })).toBe(list[1]);
  });

  it('id không có trong danh sách nhưng email khớp → dùng email', () => {
    expect(findEmployeeAfterAdd(list, { id: '999', email: 'a@x.com' })).toBe(list[0]);
  });

  it('không tìm được / danh sách hỏng → null', () => {
    expect(findEmployeeAfterAdd(list, { id: '999', email: 'zzz@x.com' })).toBeNull();
    expect(findEmployeeAfterAdd(null, { id: '12' })).toBeNull();
    expect(findEmployeeAfterAdd(list, {})).toBeNull();
  });
});

describe('getEmployeeErrorInfo', () => {
  it('đọc code + message từ lỗi axios', () => {
    const err = { response: { data: { code: 'USERNAME_TAKEN', message: 'trùng' } } };
    expect(getEmployeeErrorInfo(err)).toEqual({ code: 'USERNAME_TAKEN', message: 'trùng' });
  });
  it('backend cũ không có code → code rỗng; lỗi mạng không có response → cả hai rỗng', () => {
    expect(getEmployeeErrorInfo({ response: { data: { message: 'x' } } })).toEqual({ code: '', message: 'x' });
    expect(getEmployeeErrorInfo(new Error('Network Error'))).toEqual({ code: '', message: '' });
    expect(getEmployeeErrorInfo(undefined)).toEqual({ code: '', message: '' });
  });
});
