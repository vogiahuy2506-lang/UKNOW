/**
 * PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G3 — controller "Giám sát gửi tin" truyền danh sách tài khoản Zalo được giao xuống
 * service: nhân viên → mảng (rỗng nếu chưa giao / lỗi đọc), chủ / super admin → null.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFindAssigned = jest.fn();
const mockOverview = jest.fn();

const realMemberRepo = await import('../../repositories/user/memberChannelAccount.repository.js');
jest.unstable_mockModule('../../repositories/user/memberChannelAccount.repository.js', () => ({
  ...realMemberRepo,
  findAssignedZaloAccountIds: mockFindAssigned,
}));
const realService = await import('../../services/user/userDeliveryMonitor.service.js');
jest.unstable_mockModule('../../services/user/userDeliveryMonitor.service.js', () => ({
  ...realService,
  getUserDeliveryMonitorOverview: mockOverview,
}));

const { overview } = await import('../userDeliveryMonitor.controller.js');

const OWNER = 7;
const owner = { id: OWNER, role: 'user', activeContext: { type: 'self' } };
const employee = { id: 20, role: 'user', activeContext: { type: 'employee', ownerId: OWNER, membershipId: 3, permissions: { campaigns_view: true } } };
const superAdmin = { id: 1, role: 'admin', activeContext: { type: 'self' } };

const makeRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });

describe('userDeliveryMonitor.controller.overview — tài khoản Zalo được giao (G3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockOverview.mockResolvedValue({ today: {} });
    mockFindAssigned.mockResolvedValue([11, 12]);
  });

  it('nhân viên: service nhận id CHỦ + danh sách được giao', async () => {
    const res = makeRes();
    await overview({ user: employee }, res);
    expect(mockFindAssigned).toHaveBeenCalledWith(OWNER, 20);
    expect(mockOverview).toHaveBeenCalledWith({ userId: OWNER, accessibleZaloAccountIds: [11, 12] });
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { today: {} } });
  });

  it('nhân viên chưa được giao gì → [] (không phải null)', async () => {
    mockFindAssigned.mockResolvedValue([]);
    await overview({ user: employee }, makeRes());
    expect(mockOverview).toHaveBeenCalledWith({ userId: OWNER, accessibleZaloAccountIds: [] });
  });

  it('FAIL-CLOSED: đọc bảng giao lỗi → [] (không bao giờ null)', async () => {
    mockFindAssigned.mockRejectedValue(new Error('db down'));
    await overview({ user: employee }, makeRes());
    expect(mockOverview).toHaveBeenCalledWith({ userId: OWNER, accessibleZaloAccountIds: [] });
  });

  it('CHỦ thấy hết: null, không đọc bảng giao', async () => {
    await overview({ user: owner }, makeRes());
    expect(mockFindAssigned).not.toHaveBeenCalled();
    expect(mockOverview).toHaveBeenCalledWith({ userId: OWNER, accessibleZaloAccountIds: null });
  });

  it('super admin: null', async () => {
    await overview({ user: superAdmin }, makeRes());
    expect(mockOverview).toHaveBeenCalledWith(expect.objectContaining({ accessibleZaloAccountIds: null }));
  });
});
