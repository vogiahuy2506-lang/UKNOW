/**
 * PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G1 — service giao tài khoản Zalo cho nhân viên: chỉ nhân viên CỦA CHỦ NÀY
 * (findEmployeeByIdAndOwner) mới được xem/đổi việc giao; nhân viên của chủ khác → 404, không chạm bảng giao.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFindEmployeeByIdAndOwner = jest.fn();
const mockList = jest.fn();
const mockSet = jest.fn();

const realEmployeeRepo = await import('../../../repositories/user/employee.repository.js');
jest.unstable_mockModule('../../../repositories/user/employee.repository.js', () => ({
  ...realEmployeeRepo,
  findEmployeeByIdAndOwner: mockFindEmployeeByIdAndOwner,
}));
jest.unstable_mockModule('../memberChannelAccess.service.js', () => ({
  listZaloAssignmentsForOwner: mockList,
  setZaloAssignmentsForEmployee: mockSet,
}));

const { getEmployeeChannelAccounts, setEmployeeChannelAccounts } = await import('../employee.service.js');

async function catchError(promise) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('Kỳ vọng ném lỗi nhưng không ném');
}

describe('getEmployeeChannelAccounts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('nhân viên của chủ → trả danh sách tài khoản Zalo kèm cờ đã giao', async () => {
    mockFindEmployeeByIdAndOwner.mockResolvedValue({ id: 20 });
    mockList.mockResolvedValue([{ id: 5, assigned: true }]);
    await expect(getEmployeeChannelAccounts(10, 20)).resolves.toEqual({ zaloAccounts: [{ id: 5, assigned: true }] });
    expect(mockFindEmployeeByIdAndOwner).toHaveBeenCalledWith(20, 10);
    expect(mockList).toHaveBeenCalledWith(10, 20);
  });

  it('nhân viên của chủ KHÁC → 404, không đọc bảng giao', async () => {
    mockFindEmployeeByIdAndOwner.mockResolvedValue(null);
    const err = await catchError(getEmployeeChannelAccounts(10, 99));
    expect(err).toMatchObject({ status: 404 });
    expect(mockList).not.toHaveBeenCalled();
  });
});

describe('setEmployeeChannelAccounts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('thay việc giao: truyền chủ, nhân viên, danh sách, người thao tác; trả danh sách mới + trước/sau', async () => {
    mockFindEmployeeByIdAndOwner.mockResolvedValue({ id: 20 });
    mockSet.mockResolvedValue({ before: [5], after: [6] });
    mockList.mockResolvedValue([{ id: 6, assigned: true }]);

    const result = await setEmployeeChannelAccounts(10, 20, [6, 777], 10);

    expect(mockSet).toHaveBeenCalledWith({ ownerId: 10, employeeId: 20, accountIds: [6, 777], actorUserId: 10 });
    expect(result).toEqual({ zaloAccounts: [{ id: 6, assigned: true }], before: [5], after: [6] });
  });

  it('nhân viên của chủ KHÁC → 404 và KHÔNG ghi gì', async () => {
    mockFindEmployeeByIdAndOwner.mockResolvedValue(null);
    const err = await catchError(setEmployeeChannelAccounts(10, 99, [5], 10));
    expect(err).toMatchObject({ status: 404 });
    expect(mockSet).not.toHaveBeenCalled();
  });
});
