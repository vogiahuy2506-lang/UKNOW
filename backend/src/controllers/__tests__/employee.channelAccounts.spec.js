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

  it('chủ lấy từ token; trả danh sách tài khoản (cả Telegram / WhatsApp) kèm cờ đã giao', async () => {
    const payload = {
      zaloAccounts: [{ id: 5, assigned: true, source: 'legacy' }],
      telegramAccounts: [{ id: 3, assigned: false }],
      whatsappAccounts: [{ sessionKey: '10-a', assigned: true }],
    };
    mockGet.mockResolvedValue(payload);
    const res = makeRes();
    await getChannelAccounts({ user: owner, params: { id: '20' }, query: { ownerId: '999' } }, res);

    expect(mockGet).toHaveBeenCalledWith(10, 20);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: payload });
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

  const lists = { zaloAccounts: [{ id: 6, assigned: true }], telegramAccounts: [], whatsappAccounts: [] };

  it('lưu: gọi service với chủ + nhân viên + từng danh sách + người thao tác, ghi audit trước/sau cho kênh có gửi', async () => {
    mockSet.mockResolvedValue({ ...lists, changes: { zalo: { before: [5], after: [6] }, telegram: null, whatsapp: null } });
    const res = makeRes();
    await updateChannelAccounts({
      user: owner,
      params: { id: '20' },
      body: { zaloAccountIds: [6, 777] },
      ip: '1.1.1.1',
      get: () => 'jest',
    }, res);

    expect(mockSet).toHaveBeenCalledWith(10, 20, { zaloAccountIds: [6, 777], telegramAccountIds: undefined, whatsappSessionKeys: undefined }, 10);
    expect(mockLogWorkspace).toHaveBeenCalledTimes(1);
    const [, action, entityType, entityId, details] = mockLogWorkspace.mock.calls[0];
    expect(action).toBe('EMPLOYEE_CHANNEL_ACCOUNTS_UPDATED');
    expect(entityType).toBe('employee');
    expect(entityId).toBe(20);
    expect(details).toEqual({ channel: 'zalo_personal', before: [5], after: [6] });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Đã cập nhật tài khoản được giao',
      data: lists,
    });
  });

  it('PR-H1: gửi cả ba kênh → ba dòng audit, mỗi dòng đúng tên kênh (zalo_personal / telegram / whatsapp_baileys)', async () => {
    mockSet.mockResolvedValue({
      ...lists,
      changes: {
        zalo: { before: [5], after: [6] },
        telegram: { before: [], after: ['3'] },
        whatsapp: { before: ['10-a'], after: [] },
      },
    });
    const res = makeRes();
    await updateChannelAccounts({
      user: owner,
      params: { id: '20' },
      body: { zaloAccountIds: [6], telegramAccountIds: [3], whatsappSessionKeys: [] },
      ip: '1.1.1.1',
      get: () => 'jest',
    }, res);

    expect(mockSet).toHaveBeenCalledWith(10, 20, { zaloAccountIds: [6], telegramAccountIds: [3], whatsappSessionKeys: [] }, 10);
    const details = mockLogWorkspace.mock.calls.map((c) => c[4]);
    expect(details).toEqual([
      { channel: 'zalo_personal', before: [5], after: [6] },
      { channel: 'telegram', before: [], after: ['3'] },
      { channel: 'whatsapp_baileys', before: ['10-a'], after: [] },
    ]);
  });

  it('PR-H1: chỉ gửi Telegram (khoá Zalo vắng) → chỉ ghi audit kênh Telegram', async () => {
    mockSet.mockResolvedValue({ ...lists, changes: { zalo: null, telegram: { before: [], after: ['3'] }, whatsapp: null } });
    const res = makeRes();
    await updateChannelAccounts({ user: owner, params: { id: '20' }, body: { telegramAccountIds: [3] }, ip: '1.1.1.1', get: () => 'jest' }, res);
    expect(mockLogWorkspace).toHaveBeenCalledTimes(1);
    expect(mockLogWorkspace.mock.calls[0][4].channel).toBe('telegram');
  });

  it('PR-H1: body không có khoá danh sách nào → 400, KHÔNG gọi service, KHÔNG ghi audit', async () => {
    const res = makeRes();
    await updateChannelAccounts({ user: owner, params: { id: '20' }, body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSet).not.toHaveBeenCalled();
    expect(mockLogWorkspace).not.toHaveBeenCalled();
  });

  it('nhân viên không thuộc chủ → 404, không ghi audit', async () => {
    mockSet.mockRejectedValue({ status: 404, message: 'Không tìm thấy nhân viên' });
    const res = makeRes();
    await updateChannelAccounts({ user: owner, params: { id: '99' }, body: { zaloAccountIds: [5] } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockLogWorkspace).not.toHaveBeenCalled();
  });
});
