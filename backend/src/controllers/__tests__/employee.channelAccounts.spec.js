/**
 * PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G1 — controller giao tài khoản Zalo: lấy chủ từ token (không từ body/query),
 * ghi audit EMPLOYEE_CHANNEL_ACCOUNTS_UPDATED kèm trước/sau, lỗi service (404) ra đúng mã.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGet = jest.fn();
const mockSet = jest.fn();
const mockLogWorkspace = jest.fn();

const realService = await import('../../services/user/employee.service.js');
jest.unstable_mockModule('../../services/user/employee.service.js', () => ({
  ...realService,
  getEmployeeChannelAccounts: mockGet,
  setEmployeeChannelAccounts: mockSet,
}));

const realAudit = await import('../../services/audit.service.js');
jest.unstable_mockModule('../../services/audit.service.js', () => ({
  ...realAudit,
  logWorkspace: mockLogWorkspace,
}));

const { getChannelAccounts, updateChannelAccounts } = await import('../employee.controller.js');

const makeRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
const owner = { id: 10, role: 'user', activeContext: { type: 'self', ownerId: 10 } };

describe('GET /employees/:id/channel-accounts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('chủ lấy từ token; trả danh sách tài khoản kèm cờ đã giao', async () => {
    mockGet.mockResolvedValue({ zaloAccounts: [{ id: 5, assigned: true, source: 'legacy' }] });
    const res = makeRes();
    await getChannelAccounts({ user: owner, params: { id: '20' }, query: { ownerId: '999' } }, res);

    expect(mockGet).toHaveBeenCalledWith(10, 20);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { zaloAccounts: [{ id: 5, assigned: true, source: 'legacy' }] } });
  });

  it('nhân viên không thuộc chủ → 404 từ service, giữ nguyên mã', async () => {
    mockGet.mockRejectedValue({ status: 404, message: 'Không tìm thấy nhân viên' });
    const res = makeRes();
    await getChannelAccounts({ user: owner, params: { id: '99' } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('PUT /employees/:id/channel-accounts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lưu: gọi service với chủ + nhân viên + danh sách + người thao tác, ghi audit trước/sau', async () => {
    mockSet.mockResolvedValue({ zaloAccounts: [{ id: 6, assigned: true }], before: [5], after: [6] });
    const res = makeRes();
    await updateChannelAccounts({
      user: owner,
      params: { id: '20' },
      body: { zaloAccountIds: [6, 777] },
      ip: '1.1.1.1',
      get: () => 'jest',
    }, res);

    expect(mockSet).toHaveBeenCalledWith(10, 20, [6, 777], 10);
    expect(mockLogWorkspace).toHaveBeenCalledTimes(1);
    const [, action, entityType, entityId, details] = mockLogWorkspace.mock.calls[0];
    expect(action).toBe('EMPLOYEE_CHANNEL_ACCOUNTS_UPDATED');
    expect(entityType).toBe('employee');
    expect(entityId).toBe(20);
    expect(details).toEqual({ channel: 'zalo_personal', before: [5], after: [6] });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Đã cập nhật tài khoản Zalo được giao',
      data: { zaloAccounts: [{ id: 6, assigned: true }] },
    });
  });

  it('nhân viên không thuộc chủ → 404, không ghi audit', async () => {
    mockSet.mockRejectedValue({ status: 404, message: 'Không tìm thấy nhân viên' });
    const res = makeRes();
    await updateChannelAccounts({ user: owner, params: { id: '99' }, body: { zaloAccountIds: [5] } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockLogWorkspace).not.toHaveBeenCalled();
  });
});
