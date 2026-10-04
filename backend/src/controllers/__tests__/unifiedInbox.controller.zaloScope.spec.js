/**
 * PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G2 — controller Hộp thư:
 *  - mọi handler đụng hội thoại / tin Zalo cá nhân tính phạm vi tài khoản (null = chủ, mảng = nhân viên) và truyền xuống service;
 *  - lỗi 403 ZALO_ACCOUNT_NOT_ASSIGNED từ service trả đúng 403 + mã đó (KHÔNG bị nhánh "hết hạn mức gói" của gửi / gửi lại nuốt);
 *  - chủ luôn thấy hết (phạm vi null, không đụng bảng giao).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const svc = {
  getConversations: jest.fn(),
  getAvailableChannels: jest.fn(),
  getConversation: jest.fn(),
  getMessages: jest.fn(),
  markAsRead: jest.fn(),
  markAllAsRead: jest.fn(),
  getUnreadCount: jest.fn(),
  sendMessage: jest.fn(),
  retryMessage: jest.fn(),
  setConversationAiPaused: jest.fn(),
  getOutboxMessages: jest.fn(),
  getOutboxMessage: jest.fn(),
  deleteConversation: jest.fn(),
};
const mockGetAccessible = jest.fn();
const mockLogWorkspace = jest.fn();

jest.unstable_mockModule('../../services/chatbot/unifiedInbox.service.js', () => ({ default: svc }));
jest.unstable_mockModule('../../services/chatbot/chatAttachment.service.js', () => ({
  CHAT_ATTACHMENT_SOURCES: { INBOX_OUTBOUND: 'inbox_outbound' },
  persistChatBlob: jest.fn(),
}));
jest.unstable_mockModule('../../utils/userSendLimit.util.js', () => ({ checkSendQuota: jest.fn() }));
jest.unstable_mockModule('../../services/storage/storageQuota.service.js', () => ({
  resolveWorkspaceOwnerId: (user) => (user?.activeContext?.type === 'employee' ? user.activeContext.ownerId : user.id),
}));
jest.unstable_mockModule('../../services/audit.service.js', () => ({
  AUDIT_ACTIONS: new Proxy({}, { get: (_t, key) => String(key) }),
  AUDIT_ENTITY_TYPES: new Proxy({}, { get: (_t, key) => String(key) }),
  logWorkspace: (...args) => mockLogWorkspace(...args),
}));
jest.unstable_mockModule('../../utils/auditContext.util.js', () => ({ getWorkspaceAuditContext: () => ({}) }));
jest.unstable_mockModule('../../services/quota/sendQuotaKey.service.js', () => ({
  resolveRequestIdempotencyKey: (key) => key || 'idem-key',
}));
jest.unstable_mockModule('../../services/sseTicket.service.js', () => ({ issueSseTicket: jest.fn() }));
jest.unstable_mockModule('../../services/user/memberChannelAccess.service.js', () => ({
  getAccessibleZaloAccountIds: (...args) => mockGetAccessible(...args),
  isZaloAccountNotAssignedError: (error) => error?.code === 'ZALO_ACCOUNT_NOT_ASSIGNED',
}));

const { default: controller } = await import('../unifiedInbox.controller.js');

const OWNER_ID = 100;
const EMPLOYEE_ID = 200;
const ownerUser = { id: OWNER_ID, role: 'user' };
const employeeUser = {
  id: EMPLOYEE_ID,
  role: 'user',
  activeContext: { type: 'employee', ownerId: OWNER_ID, membershipId: 7, permissions: {} },
};

const makeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.set = () => res;
  return res;
};

/** Chạy handler với một res mới và TRẢ res (handler có nhánh `return;` không trả gì sau khi đã trả lời). */
const call = async (invoke) => {
  const res = makeRes();
  await invoke(res);
  return res;
};

const notAssignedError = () => Object.assign(new Error('Tài khoản Zalo này chưa được giao cho bạn.'), {
  status: 403,
  statusCode: 403,
  code: 'ZALO_ACCOUNT_NOT_ASSIGNED',
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAccessible.mockResolvedValue([5]);
  for (const fn of Object.values(svc)) fn.mockResolvedValue({ conversations: [], messages: [], hasMore: false, messageId: 1, sendStatus: 'sent' });
});

/** Mỗi handler + request tối thiểu + chỗ phạm vi phải xuất hiện trong lời gọi service. */
const HANDLERS = {
  getConversations: {
    run: (user) => call((res) => controller.getConversations({ user, query: {} }, res)),
    scopeOf: () => svc.getConversations.mock.calls[0][1].accessibleZaloAccountIds,
  },
  getAvailableChannels: {
    run: (user) => call((res) => controller.getAvailableChannels({ user }, res)),
    scopeOf: () => svc.getAvailableChannels.mock.calls[0][1].accessibleZaloAccountIds,
  },
  getConversation: {
    run: (user) => call((res) => controller.getConversation({ user, params: { id: '5' }, query: { type: 'zalo_personal' } }, res)),
    scopeOf: () => svc.getConversation.mock.calls[0][3].accessibleZaloAccountIds,
  },
  getMessages: {
    run: (user) => call((res) => controller.getMessages({ user, params: { id: '5' }, query: { type: 'zalo_personal' } }, res)),
    scopeOf: () => svc.getMessages.mock.calls[0][3].accessibleZaloAccountIds,
  },
  markAsRead: {
    run: (user) => call((res) => controller.markAsRead({ user, params: { id: '5' }, body: { type: 'zalo_personal' } }, res)),
    scopeOf: () => svc.markAsRead.mock.calls[0][3].accessibleZaloAccountIds,
  },
  markAllAsRead: {
    run: (user) => call((res) => controller.markAllAsRead({ user, body: { zaloAccountId: '5' } }, res)),
    scopeOf: () => svc.markAllAsRead.mock.calls[0][1].accessibleZaloAccountIds,
  },
  getUnreadCount: {
    run: (user) => call((res) => controller.getUnreadCount({ user, query: {} }, res)),
    scopeOf: () => svc.getUnreadCount.mock.calls[0][1].accessibleZaloAccountIds,
  },
  sendMessage: {
    run: (user) => call((res) => controller.sendMessage({ user, params: { id: '5' }, body: { type: 'zalo_personal', content: 'hi' }, headers: {} }, res)),
    scopeOf: () => svc.sendMessage.mock.calls[0][5].accessibleZaloAccountIds,
  },
  retryMessage: {
    run: (user) => call((res) => controller.retryMessage({ user, params: { messageId: '42' }, body: { type: 'zalo_personal' }, headers: {} }, res)),
    scopeOf: () => svc.retryMessage.mock.calls[0][1].accessibleZaloAccountIds,
  },
  setAiPaused: {
    run: (user) => call((res) => controller.setAiPaused({ user, params: { id: '5' }, body: { type: 'zalo_personal', paused: true } }, res)),
    scopeOf: () => svc.setConversationAiPaused.mock.calls[0][4].accessibleZaloAccountIds,
  },
  getOutboxMessages: {
    run: (user) => call((res) => controller.getOutboxMessages({ user, query: {} }, res)),
    scopeOf: () => svc.getOutboxMessages.mock.calls[0][1].accessibleZaloAccountIds,
  },
  getOutboxMessage: {
    run: (user) => call((res) => controller.getOutboxMessage({ user, params: { id: '9' } }, res)),
    scopeOf: () => svc.getOutboxMessage.mock.calls[0][2].accessibleZaloAccountIds,
  },
  deleteConversation: {
    run: (user) => call((res) => controller.deleteConversation({ user, params: { id: '5' }, query: { type: 'zalo_personal' } }, res)),
    scopeOf: () => svc.deleteConversation.mock.calls[0][3].accessibleZaloAccountIds,
  },
};

const SERVICE_OF = {
  getConversations: 'getConversations',
  getAvailableChannels: 'getAvailableChannels',
  getConversation: 'getConversation',
  getMessages: 'getMessages',
  markAsRead: 'markAsRead',
  markAllAsRead: 'markAllAsRead',
  getUnreadCount: 'getUnreadCount',
  sendMessage: 'sendMessage',
  retryMessage: 'retryMessage',
  setAiPaused: 'setConversationAiPaused',
  getOutboxMessages: 'getOutboxMessages',
  getOutboxMessage: 'getOutboxMessage',
  deleteConversation: 'deleteConversation',
};

const BY_ID_HANDLERS = new Set([
  'getConversation', 'getMessages', 'markAsRead', 'sendMessage', 'retryMessage', 'setAiPaused', 'deleteConversation',
]);

describe('controller Hộp thư — phạm vi tài khoản Zalo được giao', () => {
  for (const [name, { run, scopeOf }] of Object.entries(HANDLERS)) {
    describe(name, () => {
      it('NHÂN VIÊN: tính phạm vi từ ngữ cảnh nhân viên (chủ + người thao tác) và truyền mảng id xuống service', async () => {
        await run(employeeUser);

        expect(mockGetAccessible).toHaveBeenCalledTimes(1);
        expect(mockGetAccessible).toHaveBeenCalledWith(expect.objectContaining({
          contextType: 'employee',
          actorUserId: EMPLOYEE_ID,
          workspaceOwnerId: OWNER_ID,
        }));
        expect(scopeOf()).toEqual([5]);
      });

      it('CHỦ: phạm vi null (thấy hết) được truyền xuống — không phải undefined', async () => {
        mockGetAccessible.mockResolvedValue(null);
        await run(ownerUser);

        expect(mockGetAccessible).toHaveBeenCalledWith(expect.objectContaining({ contextType: 'self', actorUserId: OWNER_ID }));
        expect(scopeOf()).toBeNull();
      });

      // Đường theo id hội thoại / tin: service ném 403. Đường danh sách / đếm chỉ LỌC (không bao giờ ném 403).
      if (BY_ID_HANDLERS.has(name)) {
        it('service ném 403 ZALO_ACCOUNT_NOT_ASSIGNED → trả 403 đúng mã đó', async () => {
          svc[SERVICE_OF[name]].mockRejectedValue(notAssignedError());
          const res = await run(employeeUser);

          expect(res.statusCode).toBe(403);
          expect(res.body).toMatchObject({ success: false, code: 'ZALO_ACCOUNT_NOT_ASSIGNED', message: 'Tài khoản Zalo này chưa được giao cho bạn.' });
        });
      }
    });
  }

  it('gửi tin: 403 ZALO_ACCOUNT_NOT_ASSIGNED KHÔNG bị nhánh "hết hạn mức gói" (RESOURCE_LIMIT_EXCEEDED, upgradeRequired) nuốt', async () => {
    svc.sendMessage.mockRejectedValue(notAssignedError());
    const res = await HANDLERS.sendMessage.run(employeeUser);

    expect(res.body.code).toBe('ZALO_ACCOUNT_NOT_ASSIGNED');
    expect(res.body.upgradeRequired).toBeUndefined();
    expect(res.body.resource).toBeUndefined();
    // Không ghi audit "đã gửi" cho lần bị chặn.
    expect(mockLogWorkspace).not.toHaveBeenCalled();
  });

  it('gửi lại tin: 403 ZALO_ACCOUNT_NOT_ASSIGNED KHÔNG bị gộp thành RESOURCE_LIMIT_EXCEEDED', async () => {
    svc.retryMessage.mockRejectedValue(notAssignedError());
    const res = await HANDLERS.retryMessage.run(employeeUser);

    expect(res.body.code).toBe('ZALO_ACCOUNT_NOT_ASSIGNED');
    expect(mockLogWorkspace).not.toHaveBeenCalled();
  });

  it('xoá hội thoại bị chặn → không ghi audit "đã xoá"', async () => {
    svc.deleteConversation.mockRejectedValue(notAssignedError());
    await HANDLERS.deleteConversation.run(employeeUser);

    expect(mockLogWorkspace).not.toHaveBeenCalled();
  });

  it('hạn mức thật (403 RESOURCE_LIMIT_EXCEEDED không mang mã ZALO_ACCOUNT_NOT_ASSIGNED) vẫn trả như cũ', async () => {
    svc.sendMessage.mockRejectedValue(Object.assign(new Error('Đã hết hạn mức'), { status: 403, code: 'SEND_QUOTA_EXCEEDED' }));
    const res = await HANDLERS.sendMessage.run(employeeUser);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: 'RESOURCE_LIMIT_EXCEEDED', upgradeRequired: true });
  });

  it('"Conversation not found" vẫn là 404 (hội thoại không có / không thuộc chủ)', async () => {
    svc.getConversation.mockRejectedValue(new Error('Conversation not found'));
    const res = await HANDLERS.getConversation.run(employeeUser);

    expect(res.statusCode).toBe(404);
  });

  it('bộ lọc zaloAccountId nhân viên gửi lên vẫn đi nguyên xuống service (phạm vi là điều kiện AND thêm vào, không thay thế)', async () => {
    await controller.getConversations({ user: employeeUser, query: { zaloAccountId: '77', channel: 'zalo_personal' } }, makeRes());

    expect(svc.getConversations.mock.calls[0][1]).toMatchObject({ zaloAccountId: '77', channel: 'zalo_personal', accessibleZaloAccountIds: [5] });
  });

  it('gửi tin: phạm vi đi chung options với người thao tác (không thay actorUserId / ownerContextId)', async () => {
    await HANDLERS.sendMessage.run(employeeUser);

    expect(svc.sendMessage.mock.calls[0][5]).toMatchObject({
      actorUserId: EMPLOYEE_ID,
      ownerContextId: OWNER_ID,
      accessibleZaloAccountIds: [5],
    });
  });
});
