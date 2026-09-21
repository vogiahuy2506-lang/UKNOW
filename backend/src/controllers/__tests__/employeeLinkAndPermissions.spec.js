/**
 * PR-1 (PLAN_NHAN_VIEN_KHONG_THAY_CHIEN_DICH mục 3): audit "link nhân viên" phải mang id nhân viên
 * (P3 — trước đây `member.employee_id` không tồn tại → `audit_logs.entity_id` rỗng), và
 * PATCH permissions nhận `[]` như `{}` (P4).
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockLogWorkspace = jest.fn();
const mockLinkUserAsEmployee = jest.fn();
const mockSetEmployeePermissions = jest.fn();

jest.unstable_mockModule('../../services/audit.service.js', () => ({
  AUDIT_ACTIONS: {
    EMPLOYEE_ADDED: 'EMPLOYEE_ADDED',
    EMPLOYEE_PERMISSIONS_UPDATED: 'EMPLOYEE_PERMISSIONS_UPDATED',
  },
  AUDIT_ENTITY_TYPES: { EMPLOYEE: 'EMPLOYEE' },
  logWorkspace: mockLogWorkspace,
}));
jest.unstable_mockModule('../../services/user/employee.service.js', () => ({
  linkUserAsEmployee: mockLinkUserAsEmployee,
  setEmployeePermissions: mockSetEmployeePermissions,
}));

const { linkEmployee, updatePermissions } = await import('../employee.controller.js');

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('linkEmployee', () => {
  it('audit EMPLOYEE_ADDED mang entity_id = id nhân viên, response trả data.id', async () => {
    mockLinkUserAsEmployee.mockResolvedValue({ id: 42, permissions: {}, memberStatus: 'active' });
    const req = { user: { id: 7 }, body: { email: 'nv@example.com' } };
    const res = makeRes();

    await linkEmployee(req, res);

    expect(mockLogWorkspace).toHaveBeenCalledTimes(1);
    const [, action, entityType, entityId, details] = mockLogWorkspace.mock.calls[0];
    expect(action).toBe('EMPLOYEE_ADDED');
    expect(entityType).toBe('EMPLOYEE');
    expect(entityId).toBe(42);
    expect(details).toEqual({ email: 'nv@example.com', method: 'link' });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].data.id).toBe(42);
  });
});

describe('updatePermissions', () => {
  const run = async (permissions) => {
    mockSetEmployeePermissions.mockResolvedValue({ permissions: {} });
    const req = { user: { id: 7 }, params: { id: '42' }, body: { permissions } };
    const res = makeRes();
    await updatePermissions(req, res);
    return res;
  };

  it('mảng rỗng được xử lý như {} (service + audit đều thấy {})', async () => {
    await run([]);

    expect(mockSetEmployeePermissions).toHaveBeenCalledWith(7, 42, {});
    expect(mockLogWorkspace.mock.calls[0][4]).toEqual({ permissions: {} });
  });

  it('object thường đi qua nguyên vẹn', async () => {
    await run({ campaigns_view: true });

    expect(mockSetEmployeePermissions).toHaveBeenCalledWith(7, 42, { campaigns_view: true });
  });
});
