import { describe, it, expect } from '@jest/globals';
import {
  isSuperAdmin,
  isUserAdmin,
  isEmployeeContext,
  isEmployee,
  isAdminRole,
  buildUserScopeClause,
} from '../roleScope.util.js';

describe('roleScope.util', () => {
  describe('isSuperAdmin', () => {
    it('trả true với role "admin"', () => {
      expect(isSuperAdmin('admin')).toBe(true);
    });

    it('không phân biệt hoa thường', () => {
      expect(isSuperAdmin('ADMIN')).toBe(true);
      expect(isSuperAdmin('Admin')).toBe(true);
    });

    it('tự trim khoảng trắng', () => {
      expect(isSuperAdmin('  admin  ')).toBe(true);
    });

    it('trả false với role khác', () => {
      expect(isSuperAdmin('user')).toBe(false);
      expect(isSuperAdmin('employee')).toBe(false);
    });

    it('trả false với null/undefined/empty', () => {
      expect(isSuperAdmin(null)).toBe(false);
      expect(isSuperAdmin(undefined)).toBe(false);
      expect(isSuperAdmin('')).toBe(false);
      expect(isSuperAdmin('   ')).toBe(false);
    });

    it('xử lý input không phải string', () => {
      expect(isSuperAdmin(123)).toBe(false);
      expect(isSuperAdmin({})).toBe(false);
    });
  });

  describe('isUserAdmin', () => {
    it('trả true với role "user"', () => {
      expect(isUserAdmin('user')).toBe(true);
      expect(isUserAdmin('USER')).toBe(true);
      expect(isUserAdmin('  user  ')).toBe(true);
    });

    it('trả false với role khác', () => {
      expect(isUserAdmin('admin')).toBe(false);
      expect(isUserAdmin('employee')).toBe(false);
    });

    it('trả false với null/undefined', () => {
      expect(isUserAdmin(null)).toBe(false);
      expect(isUserAdmin(undefined)).toBe(false);
    });
  });

  describe('isEmployeeContext', () => {
    it('trả true khi activeContext.type === "employee"', () => {
      expect(isEmployeeContext({ type: 'employee' })).toBe(true);
      expect(isEmployeeContext({ type: 'employee', ownerId: 42 })).toBe(true);
    });

    it('trả false khi type khác', () => {
      expect(isEmployeeContext({ type: 'self' })).toBe(false);
      expect(isEmployeeContext({ type: 'admin' })).toBe(false);
    });

    it('trả false với null/undefined', () => {
      expect(isEmployeeContext(null)).toBe(false);
      expect(isEmployeeContext(undefined)).toBe(false);
    });

    it('trả false khi không có thuộc tính type', () => {
      expect(isEmployeeContext({})).toBe(false);
    });
  });

  describe('isEmployee (deprecated)', () => {
    it('vẫn nhận diện role "employee" (giữ tương thích)', () => {
      expect(isEmployee('employee')).toBe(true);
      expect(isEmployee('EMPLOYEE')).toBe(true);
    });

    it('trả false với role khác', () => {
      expect(isEmployee('admin')).toBe(false);
      expect(isEmployee('user')).toBe(false);
      expect(isEmployee(null)).toBe(false);
    });
  });

  describe('isAdminRole', () => {
    it('là alias của isSuperAdmin', () => {
      expect(isAdminRole('admin')).toBe(true);
      expect(isAdminRole('user')).toBe(false);
      expect(isAdminRole(null)).toBe(false);
    });
  });

  describe('buildUserScopeClause', () => {
    it('superadmin: không thêm clause, params giữ nguyên', () => {
      const result = buildUserScopeClause({
        tableAlias: 'c',
        userId: 10,
        role: 'admin',
        params: ['existing'],
      });
      expect(result.clause).toBe('');
      expect(result.params).toEqual(['existing']);
      expect(result.nextParamIndex).toBe(2);
    });

    it('employee context: dùng activeContext.ownerId', () => {
      const result = buildUserScopeClause({
        tableAlias: 'c',
        userId: 99,
        role: 'user',
        activeContext: { type: 'employee', ownerId: 7 },
      });
      expect(result.clause).toBe('c.id_user = $1');
      expect(result.params).toEqual([7]);
      expect(result.nextParamIndex).toBe(2);
    });

    it('employee context: fallback ownerId từ argument khi activeContext.ownerId null', () => {
      const result = buildUserScopeClause({
        tableAlias: 't',
        userId: 99,
        role: 'user',
        activeContext: { type: 'employee', ownerId: null },
        ownerId: 55,
      });
      expect(result.clause).toBe('t.id_user = $1');
      expect(result.params).toEqual([55]);
    });

    it('legacy employee role (không có activeContext) dùng ownerId', () => {
      const result = buildUserScopeClause({
        tableAlias: 'c',
        userId: 1,
        role: 'employee',
        ownerId: 42,
      });
      expect(result.clause).toBe('c.id_user = $1');
      expect(result.params).toEqual([42]);
    });

    it('user_admin: lọc theo userId của chính mình', () => {
      const result = buildUserScopeClause({
        tableAlias: 'tbl',
        userId: 123,
        role: 'user',
      });
      expect(result.clause).toBe('tbl.id_user = $1');
      expect(result.params).toEqual([123]);
      expect(result.nextParamIndex).toBe(2);
    });

    it('cộng dồn placeholder $N theo params hiện có', () => {
      const result = buildUserScopeClause({
        tableAlias: 'x',
        userId: 9,
        role: 'user',
        params: ['a', 'b', 'c'],
      });
      expect(result.clause).toBe('x.id_user = $4');
      expect(result.params).toEqual(['a', 'b', 'c', 9]);
      expect(result.nextParamIndex).toBe(5);
    });

    it('không mutate mảng params gốc (giữ tính purity)', () => {
      const original = ['a'];
      buildUserScopeClause({
        tableAlias: 'c',
        userId: 1,
        role: 'user',
        params: original,
      });
      expect(original).toEqual(['a']);
    });

    it('employee role nhưng không có ownerId → rơi xuống nhánh user_admin', () => {
      const result = buildUserScopeClause({
        tableAlias: 'c',
        userId: 100,
        role: 'employee',
      });
      expect(result.clause).toBe('c.id_user = $1');
      expect(result.params).toEqual([100]);
    });
  });
});
