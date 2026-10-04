/**
 * PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G3 — Studio: danh sách tài khoản Zalo cá nhân + bật/tắt chatbot cho tài khoản chỉ
 * trong phạm vi tài khoản ĐƯỢC GIAO cho nhân viên. Kiểm TRƯỚC `findOtherEnabledChatbot` (câu 409 nêu tên chatbot đang giữ tài
 * khoản — không được lộ cho người chưa được giao). Chủ thấy hết; lỗi đọc việc giao → chặn.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFindAssigned = jest.fn();
const mockFindOtherEnabledChatbot = jest.fn();
const mockSetEnabled = jest.fn();
const mockListAccountsForUser = jest.fn();
const mockInvalidateAccountCache = jest.fn();

const realMemberRepo = await import('../../repositories/user/memberChannelAccount.repository.js');
jest.unstable_mockModule('../../repositories/user/memberChannelAccount.repository.js', () => ({
  ...realMemberRepo,
  findAssignedZaloAccountIds: mockFindAssigned,
}));
jest.unstable_mockModule('../../repositories/chatbot/chatbotZaloAccount.repository.js', () => ({
  default: {
    findOtherEnabledChatbot: mockFindOtherEnabledChatbot,
    setEnabled: mockSetEnabled,
    listAccountsForUser: mockListAccountsForUser,
  },
}));
jest.unstable_mockModule('../../services/chatbot/zaloInbox.service.js', () => ({
  default: { invalidateAccountCache: mockInvalidateAccountCache },
}));
jest.unstable_mockModule('../../services/audit.service.js', () => ({
  AUDIT_ACTIONS: new Proxy({}, { get: (_t, prop) => String(prop) }),
  AUDIT_ENTITY_TYPES: new Proxy({}, { get: (_t, prop) => String(prop) }),
  logWorkspace: jest.fn().mockResolvedValue(undefined),
  logSystem: jest.fn().mockResolvedValue(undefined),
  default: {},
}));

const { default: controller } = await import('../chatbot.controller.js');

const OWNER = 7;
const owner = { id: OWNER, role: 'user', activeContext: { type: 'self' } };
const employee = {
  id: 20,
  role: 'user',
  activeContext: { type: 'employee', ownerId: OWNER, membershipId: 3, permissions: { chatbot_channels_manage: true } },
};
const superAdmin = { id: 1, role: 'admin', activeContext: { type: 'self' } };

function makeRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}
const toggleReq = (user, zaloSettingId, body) => ({ user, params: { zaloSettingId: String(zaloSettingId) }, body, headers: {} });

describe('Studio — bật/tắt chatbot cho tài khoản Zalo cá nhân (G3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFindAssigned.mockResolvedValue([34]);
    mockFindOtherEnabledChatbot.mockResolvedValue(null);
    mockSetEnabled.mockResolvedValue({ id: 500, is_enabled: true });
  });

  it('nhân viên CHƯA được giao tài khoản → 403 ZALO_ACCOUNT_NOT_ASSIGNED, không tra chatbot đang giữ, không ghi, không xoá cache', async () => {
    mockFindAssigned.mockResolvedValue([35]);
    mockFindOtherEnabledChatbot.mockResolvedValue({ id: 11, name: 'Bot bí mật' });
    const res = makeRes();
    await controller.toggleZaloAccountChatbot(toggleReq(employee, 34, { enabled: true, id_chatbot: 12 }), res);

    expect(res.status).toHaveBeenCalledWith(403);
    const body = res.json.mock.calls[0][0];
    expect(body).toEqual({ success: false, code: 'ZALO_ACCOUNT_NOT_ASSIGNED', message: 'Tài khoản Zalo này chưa được giao cho bạn.' });
    expect(JSON.stringify(body)).not.toContain('Bot bí mật');
    expect(mockFindOtherEnabledChatbot).not.toHaveBeenCalled();
    expect(mockSetEnabled).not.toHaveBeenCalled();
    expect(mockInvalidateAccountCache).not.toHaveBeenCalled();
  });

  it('TẮT chatbot cũng bị chặn khi chưa được giao (không có đường vòng bằng enabled=false)', async () => {
    mockFindAssigned.mockResolvedValue([]);
    const res = makeRes();
    await controller.toggleZaloAccountChatbot(toggleReq(employee, 34, { enabled: false, id_chatbot: 12 }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockSetEnabled).not.toHaveBeenCalled();
  });

  it('tài khoản KHÔNG tồn tại cho cùng một 403 với tài khoản chưa giao (không lộ id nào có thật)', async () => {
    const missing = makeRes();
    await controller.toggleZaloAccountChatbot(toggleReq(employee, 99999, { enabled: true, id_chatbot: 12 }), missing);
    mockFindAssigned.mockResolvedValue([35]);
    const notAssigned = makeRes();
    await controller.toggleZaloAccountChatbot(toggleReq(employee, 34, { enabled: true, id_chatbot: 12 }), notAssigned);
    expect(missing.status).toHaveBeenCalledWith(403);
    expect(notAssigned.status).toHaveBeenCalledWith(403);
    expect(missing.json.mock.calls[0][0]).toEqual(notAssigned.json.mock.calls[0][0]);
  });

  it('nhân viên ĐƯỢC giao → bật được, setEnabled nhận danh sách được giao (phòng thủ lớp repo)', async () => {
    const res = makeRes();
    await controller.toggleZaloAccountChatbot(toggleReq(employee, 34, { enabled: true, id_chatbot: 12 }), res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(mockFindAssigned).toHaveBeenCalledWith(OWNER, 20);
    expect(mockSetEnabled).toHaveBeenCalledWith(OWNER, 34, 12, true, { accessibleZaloIds: [34] });
    expect(mockInvalidateAccountCache).toHaveBeenCalled();
  });

  it('nhân viên được giao nhưng bot khác đang giữ tài khoản → vẫn 409 như cũ (luật S-12 không đổi)', async () => {
    mockFindOtherEnabledChatbot.mockResolvedValue({ id: 11, name: 'Bot Tư vấn' });
    const res = makeRes();
    await controller.toggleZaloAccountChatbot(toggleReq(employee, 34, { enabled: true, id_chatbot: 12 }), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockSetEnabled).not.toHaveBeenCalled();
  });

  it('FAIL-CLOSED: đọc bảng giao lỗi → 403', async () => {
    mockFindAssigned.mockRejectedValue(new Error('db down'));
    const res = makeRes();
    await controller.toggleZaloAccountChatbot(toggleReq(employee, 34, { enabled: true, id_chatbot: 12 }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockSetEnabled).not.toHaveBeenCalled();
  });

  it('CHỦ bật được tài khoản bất kỳ, KHÔNG đọc bảng giao', async () => {
    mockFindAssigned.mockResolvedValue([]);
    const res = makeRes();
    await controller.toggleZaloAccountChatbot(toggleReq(owner, 34, { enabled: true, id_chatbot: 12 }), res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(mockFindAssigned).not.toHaveBeenCalled();
    expect(mockSetEnabled).toHaveBeenCalledWith(OWNER, 34, 12, true, { accessibleZaloIds: null });
  });

  it('super admin không bị lọc', async () => {
    const res = makeRes();
    await controller.toggleZaloAccountChatbot(toggleReq(superAdmin, 34, { enabled: true, id_chatbot: 12 }), res);
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(mockFindAssigned).not.toHaveBeenCalled();
  });
});

describe('Studio — danh sách tài khoản Zalo cá nhân (G3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFindAssigned.mockResolvedValue([34, 36]);
    mockListAccountsForUser.mockResolvedValue([{ id: 34 }, { id: 36 }]);
  });

  it('nhân viên: repo nhận đúng danh sách được giao', async () => {
    const res = makeRes();
    await controller.listZaloAccountsWithChatbotSettings({ user: employee, query: { chatbot_id: '5' } }, res);
    expect(mockListAccountsForUser).toHaveBeenCalledWith(OWNER, 5, [34, 36]);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [{ id: 34 }, { id: 36 }] });
  });

  it('nhân viên chưa được giao gì: repo nhận [] (không phải null)', async () => {
    mockFindAssigned.mockResolvedValue([]);
    await controller.listZaloAccountsWithChatbotSettings({ user: employee, query: {} }, makeRes());
    expect(mockListAccountsForUser).toHaveBeenCalledWith(OWNER, null, []);
  });

  it('FAIL-CLOSED: đọc bảng giao lỗi → repo nhận []', async () => {
    mockFindAssigned.mockRejectedValue(new Error('db down'));
    await controller.listZaloAccountsWithChatbotSettings({ user: employee, query: {} }, makeRes());
    expect(mockListAccountsForUser).toHaveBeenCalledWith(OWNER, null, []);
  });

  it('CHỦ thấy hết: repo nhận null, không đọc bảng giao', async () => {
    await controller.listZaloAccountsWithChatbotSettings({ user: owner, query: {} }, makeRes());
    expect(mockListAccountsForUser).toHaveBeenCalledWith(OWNER, null, null);
    expect(mockFindAssigned).not.toHaveBeenCalled();
  });

  it('super admin: null', async () => {
    await controller.listZaloAccountsWithChatbotSettings({ user: superAdmin, query: {} }, makeRes());
    expect(mockListAccountsForUser).toHaveBeenCalledWith(1, null, null);
  });
});
