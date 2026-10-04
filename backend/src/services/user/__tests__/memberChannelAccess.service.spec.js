import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFindAssigned = jest.fn();
const mockListOwnerAccounts = jest.fn();
const mockReplace = jest.fn();

jest.unstable_mockModule('../../../repositories/user/memberChannelAccount.repository.js', () => ({
  findAssignedZaloAccountIds: mockFindAssigned,
  listOwnerZaloAccountsWithAssignment: mockListOwnerAccounts,
  replaceZaloAccountAssignments: mockReplace,
}));

const {
  getAccessibleZaloAccountIds,
  assertZaloAccountAccess,
  isAssignmentScopedContext,
  isZaloAccountAccessible,
  listZaloAssignmentsForOwner,
  setZaloAssignmentsForEmployee,
  ZALO_ACCOUNT_NOT_ASSIGNED_CODE,
  ZALO_ACCOUNT_NOT_ASSIGNED_MESSAGE,
} = await import('../memberChannelAccess.service.js');

const ownerCtx = { actorUserId: 10, workspaceOwnerId: 10, contextType: 'self', isSuperAdmin: false };
const superAdminCtx = { actorUserId: 1, workspaceOwnerId: 1, contextType: 'self', isSuperAdmin: true };
const employeeCtx = { actorUserId: 20, workspaceOwnerId: 10, contextType: 'employee', isSuperAdmin: false };

describe('getAccessibleZaloAccountIds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('chủ (self) thấy tất cả → null, không chạm CSDL', async () => {
    await expect(getAccessibleZaloAccountIds(ownerCtx)).resolves.toBeNull();
    expect(mockFindAssigned).not.toHaveBeenCalled();
  });

  it('super admin thấy tất cả → null, kể cả khi đang ở ngữ cảnh nhân viên', async () => {
    await expect(getAccessibleZaloAccountIds(superAdminCtx)).resolves.toBeNull();
    await expect(getAccessibleZaloAccountIds({ ...employeeCtx, isSuperAdmin: true })).resolves.toBeNull();
    expect(mockFindAssigned).not.toHaveBeenCalled();
  });

  it('nhân viên → đúng mảng id được giao (đọc theo chủ + người thao tác)', async () => {
    mockFindAssigned.mockResolvedValue([5, 7]);
    await expect(getAccessibleZaloAccountIds(employeeCtx)).resolves.toEqual([5, 7]);
    expect(mockFindAssigned).toHaveBeenCalledWith(10, 20);
  });

  it('nhân viên chưa được giao gì → [] (không phải null)', async () => {
    mockFindAssigned.mockResolvedValue([]);
    const ids = await getAccessibleZaloAccountIds(employeeCtx);
    expect(ids).toEqual([]);
    expect(ids).not.toBeNull();
  });

  it('FAIL-CLOSED: lỗi CSDL khi đọc bảng giao → [] (không bao giờ null)', async () => {
    mockFindAssigned.mockRejectedValue(new Error('connection terminated'));
    const ids = await getAccessibleZaloAccountIds(employeeCtx);
    expect(ids).toEqual([]);
    expect(ids).not.toBeNull();
  });

  it('FAIL-CLOSED: bảng giao chưa tồn tại (42P01) → []', async () => {
    mockFindAssigned.mockRejectedValue(Object.assign(new Error('relation does not exist'), { code: '42P01' }));
    await expect(getAccessibleZaloAccountIds(employeeCtx)).resolves.toEqual([]);
  });

  it('FAIL-CLOSED: ngữ cảnh thiếu hoặc id hỏng → [] và không gọi CSDL', async () => {
    await expect(getAccessibleZaloAccountIds(undefined)).resolves.toEqual([]);
    await expect(getAccessibleZaloAccountIds({ contextType: 'employee' })).resolves.toEqual([]);
    await expect(getAccessibleZaloAccountIds({ ...employeeCtx, actorUserId: 'abc' })).resolves.toEqual([]);
    expect(mockFindAssigned).not.toHaveBeenCalled();
  });
});

describe('isAssignmentScopedContext', () => {
  it('chỉ nhân viên (không phải super admin) bị lọc; thiếu ngữ cảnh cũng bị lọc', () => {
    expect(isAssignmentScopedContext(employeeCtx)).toBe(true);
    expect(isAssignmentScopedContext(ownerCtx)).toBe(false);
    expect(isAssignmentScopedContext(superAdminCtx)).toBe(false);
    expect(isAssignmentScopedContext(undefined)).toBe(true);
  });
});

describe('isZaloAccountAccessible', () => {
  it('null = qua hết; mảng = chỉ id có trong mảng; kiểu không phải mảng = chặn', () => {
    expect(isZaloAccountAccessible(99, null)).toBe(true);
    expect(isZaloAccountAccessible('5', [5, 7])).toBe(true);
    expect(isZaloAccountAccessible(6, [5, 7])).toBe(false);
    expect(isZaloAccountAccessible(5, [])).toBe(false);
    expect(isZaloAccountAccessible(5, undefined)).toBe(false);
    expect(isZaloAccountAccessible('abc', [5])).toBe(false);
  });
});

describe('assertZaloAccountAccess', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('chủ và super admin luôn qua, kể cả id lạ', async () => {
    await expect(assertZaloAccountAccess(ownerCtx, 12345)).resolves.toBeUndefined();
    await expect(assertZaloAccountAccess(superAdminCtx, 12345)).resolves.toBeUndefined();
    expect(mockFindAssigned).not.toHaveBeenCalled();
  });

  it('nhân viên được giao → qua', async () => {
    mockFindAssigned.mockResolvedValue([5]);
    await expect(assertZaloAccountAccess(employeeCtx, '5')).resolves.toBeUndefined();
  });

  it('nhân viên chưa được giao → 403 ZALO_ACCOUNT_NOT_ASSIGNED, câu tiếng Việt', async () => {
    mockFindAssigned.mockResolvedValue([5]);
    await expect(assertZaloAccountAccess(employeeCtx, 6)).rejects.toMatchObject({
      status: 403,
      statusCode: 403,
      code: ZALO_ACCOUNT_NOT_ASSIGNED_CODE,
      message: 'Tài khoản Zalo này chưa được giao cho bạn.',
    });
    expect(ZALO_ACCOUNT_NOT_ASSIGNED_MESSAGE).toBe('Tài khoản Zalo này chưa được giao cho bạn.');
  });

  it('FAIL-CLOSED: lỗi CSDL → nhân viên bị chặn 403, không lọt', async () => {
    mockFindAssigned.mockRejectedValue(new Error('boom'));
    await expect(assertZaloAccountAccess(employeeCtx, 5)).rejects.toMatchObject({ status: 403, code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
  });
});

describe('listZaloAssignmentsForOwner / setZaloAssignmentsForEmployee', () => {
  beforeEach(() => jest.clearAllMocks());

  it('map hàng CSDL sang đối tượng có cờ assigned + source', async () => {
    mockListOwnerAccounts.mockResolvedValue([
      { id: '5', display_name: 'Shop', zalo_name: 'Z', zalo_phone: '09', status: 'connected', is_active: true, is_default: true, assignment_source: 'legacy' },
      { id: '6', display_name: 'Gia dinh', zalo_name: null, zalo_phone: null, status: 'disconnected', is_active: false, is_default: false, assignment_source: null },
    ]);
    const items = await listZaloAssignmentsForOwner(10, 20);
    expect(mockListOwnerAccounts).toHaveBeenCalledWith(10, 20);
    expect(items).toEqual([
      { id: 5, displayName: 'Shop', zaloName: 'Z', zaloPhone: '09', status: 'connected', isActive: true, isDefault: true, assigned: true, source: 'legacy' },
      { id: 6, displayName: 'Gia dinh', zaloName: '', zaloPhone: '', status: 'disconnected', isActive: false, isDefault: false, assigned: false, source: null },
    ]);
  });

  it('thay việc giao: chuyển đủ chủ, nhân viên, danh sách và người thao tác xuống repo', async () => {
    mockReplace.mockResolvedValue({ before: [5], after: [6] });
    const result = await setZaloAssignmentsForEmployee({ ownerId: 10, employeeId: 20, accountIds: [6], actorUserId: 10 });
    expect(mockReplace).toHaveBeenCalledWith({ ownerId: 10, employeeId: 20, accountIds: [6], actorUserId: 10 });
    expect(result).toEqual({ before: [5], after: [6] });
  });
});
