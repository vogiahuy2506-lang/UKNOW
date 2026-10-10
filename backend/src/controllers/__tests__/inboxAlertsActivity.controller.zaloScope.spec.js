/**
 * PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G2 — "Liên hệ khách để lại" và "Báo cáo hoạt động AI / bật lại AI hàng loạt" trong
 * Hộp thư: nhân viên chỉ thấy / chạm được dữ liệu của tài khoản Zalo được giao; chủ luôn thấy hết (phạm vi null).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGetAccessible = jest.fn();
const alertRepo = {
  listForOwner: jest.fn(),
  markHandled: jest.fn(),
  unmarkHandled: jest.fn(),
};
const activityService = {
  getActivityReport: jest.fn(),
  resumeAllAi: jest.fn(),
};
const mockLogWorkspace = jest.fn();

jest.unstable_mockModule('../../repositories/chatbot/chatbotContactAlert.repository.js', () => ({ default: alertRepo }));
jest.unstable_mockModule('../../repositories/chatbot/chatbotDigest.repository.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/chatbot/aiActivity.service.js', () => ({ default: activityService }));
jest.unstable_mockModule('../../middleware/aiCredit.middleware.js', () => ({ chargeAiCredit: jest.fn() }));
jest.unstable_mockModule('../../services/storage/storageQuota.service.js', () => ({
  resolveWorkspaceOwnerId: (user) => (user?.activeContext?.type === 'employee' ? user.activeContext.ownerId : user.id),
}));
jest.unstable_mockModule('../../services/audit.service.js', () => ({
  AUDIT_ACTIONS: new Proxy({}, { get: (_t, key) => String(key) }),
  AUDIT_ENTITY_TYPES: new Proxy({}, { get: (_t, key) => String(key) }),
  logWorkspace: (...args) => mockLogWorkspace(...args),
}));
jest.unstable_mockModule('../../utils/auditContext.util.js', () => ({ getWorkspaceAuditContext: () => ({}) }));
jest.unstable_mockModule('../../utils/aiErrorPayload.util.js', () => ({ buildAiErrorPayload: () => ({}) }));
jest.unstable_mockModule('../../services/user/memberChannelAccess.service.js', () => ({
  getAccessibleZaloAccountIds: (...a) => mockGetAccessible(...a),
  getAccessibleChannelScope: async () => ({ telegram: ['7'], whatsapp_baileys: [] }),
}));

const { default: alertController } = await import('../chatbot/chatbotContactAlert.controller.js');
const { default: activityController } = await import('../chatbot/aiActivity.controller.js');

const OWNER = 100;
const EMPLOYEE = 200;
const ownerUser = { id: OWNER, role: 'user' };
const employeeUser = { id: EMPLOYEE, role: 'user', activeContext: { type: 'employee', ownerId: OWNER, membershipId: 7, permissions: {} } };

const makeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};
const call = async (controller, method, req) => {
  const res = makeRes();
  await controller[method](req, res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockGetAccessible.mockResolvedValue([5]);
  alertRepo.listForOwner.mockResolvedValue({ items: [], total: 0, openCount: 0 });
  alertRepo.markHandled.mockResolvedValue({ id: 3 });
  alertRepo.unmarkHandled.mockResolvedValue({ id: 3 });
  activityService.getActivityReport.mockResolvedValue({ conversations: [] });
  activityService.resumeAllAi.mockResolvedValue({ resumedCount: 2 });
});

describe('Liên hệ khách để lại', () => {
  it('danh sách: nhân viên → phạm vi [5] đi cùng bộ lọc; chủ → null', async () => {
    await call(alertController, 'listAlerts', { user: employeeUser, query: { accountId: '77' } });
    expect(mockGetAccessible).toHaveBeenCalledWith(expect.objectContaining({ contextType: 'employee', actorUserId: EMPLOYEE, workspaceOwnerId: OWNER }));
    expect(alertRepo.listForOwner).toHaveBeenCalledWith(OWNER, expect.objectContaining({ accountId: '77', accessibleZaloAccountIds: [5] }));

    jest.clearAllMocks();
    mockGetAccessible.mockResolvedValue(null);
    await call(alertController, 'listAlerts', { user: ownerUser, query: {} });
    expect(alertRepo.listForOwner).toHaveBeenCalledWith(OWNER, expect.objectContaining({ accessibleZaloAccountIds: null }));
  });

  it('đánh dấu / bỏ đánh dấu đã liên hệ: phạm vi đi xuống repository; không khớp (tài khoản chưa giao) → 404 "không có quyền"', async () => {
    await call(alertController, 'markHandled', { user: employeeUser, params: { id: '3' } });
    expect(alertRepo.markHandled).toHaveBeenCalledWith(3, OWNER, EMPLOYEE, undefined, { accessibleZaloAccountIds: [5], accessibleChannelRefs: { telegram: ['7'], whatsapp_baileys: [] } });

    await call(alertController, 'unmarkHandled', { user: employeeUser, params: { id: '3' } });
    expect(alertRepo.unmarkHandled).toHaveBeenCalledWith(3, OWNER, undefined, { accessibleZaloAccountIds: [5], accessibleChannelRefs: { telegram: ['7'], whatsapp_baileys: [] } });

    alertRepo.markHandled.mockResolvedValue(null);
    alertRepo.unmarkHandled.mockResolvedValue(null);
    const res1 = await call(alertController, 'markHandled', { user: employeeUser, params: { id: '4' } });
    const res2 = await call(alertController, 'unmarkHandled', { user: employeeUser, params: { id: '4' } });
    expect(res1.statusCode).toBe(404);
    expect(res2.statusCode).toBe(404);
  });

  it('chủ: đánh dấu với phạm vi null', async () => {
    mockGetAccessible.mockResolvedValue(null);
    await call(alertController, 'markHandled', { user: ownerUser, params: { id: '3' } });

    expect(alertRepo.markHandled).toHaveBeenCalledWith(3, OWNER, OWNER, undefined, { accessibleZaloAccountIds: null, accessibleChannelRefs: { telegram: ['7'], whatsapp_baileys: [] } });
  });
});

describe('Báo cáo hoạt động AI + bật lại AI hàng loạt', () => {
  it('báo cáo: nhân viên → phạm vi [5]; chủ → null', async () => {
    await call(activityController, 'getActivityReport', { user: employeeUser, query: { date: '2026-10-04', accountId: '77' } });
    expect(activityService.getActivityReport).toHaveBeenCalledWith(expect.objectContaining({ userId: OWNER, accountId: 77, accessibleZaloAccountIds: [5] }));

    jest.clearAllMocks();
    mockGetAccessible.mockResolvedValue(null);
    await call(activityController, 'getActivityReport', { user: ownerUser, query: {} });
    expect(activityService.getActivityReport).toHaveBeenCalledWith(expect.objectContaining({ accessibleZaloAccountIds: null }));
  });

  it('bật lại hàng loạt: nhân viên → chỉ tài khoản được giao, audit ghi scope assigned_accounts; chủ → null + scope all', async () => {
    await call(activityController, 'resumeAllAi', { user: employeeUser });
    expect(activityService.resumeAllAi).toHaveBeenCalledWith({ userId: OWNER, accessibleZaloAccountIds: [5] });
    expect(mockLogWorkspace.mock.calls[0][4]).toMatchObject({ scope: 'assigned_accounts', resumedCount: 2 });

    jest.clearAllMocks();
    mockGetAccessible.mockResolvedValue(null);
    await call(activityController, 'resumeAllAi', { user: ownerUser });
    expect(activityService.resumeAllAi).toHaveBeenCalledWith({ userId: OWNER, accessibleZaloAccountIds: null });
    expect(mockLogWorkspace.mock.calls[0][4]).toMatchObject({ scope: 'all', resumedCount: 2 });
  });
});
