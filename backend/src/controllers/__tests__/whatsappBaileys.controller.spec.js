/**
 * PR-W1 — whatsappBaileys.controller: nhật ký hoạt động cho connect/disconnect/remove/updateSession và
 * `_inject` bị chặn ở production.
 */
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';

const svc = {
  connectSession: jest.fn(),
  disconnectSession: jest.fn(),
  deleteSessionFiles: jest.fn(),
  updateSessionNickname: jest.fn(),
  listSessions: jest.fn(() => []),
};
const logWorkspace = jest.fn(async () => {});

jest.unstable_mockModule('../../services/chatbot/whatsappBaileys.service.js', () => svc);
jest.unstable_mockModule('../../services/storage/storageQuota.service.js', () => ({
  resolveWorkspaceOwnerId: (user) => user.activeContext?.ownerId ?? user.id,
}));
jest.unstable_mockModule('../../services/audit.service.js', () => ({
  logWorkspace,
  AUDIT_ACTIONS: {
    WHATSAPP_ACCOUNT_CONNECT_STARTED: 'WHATSAPP_ACCOUNT_CONNECT_STARTED',
    WHATSAPP_ACCOUNT_DISCONNECTED: 'WHATSAPP_ACCOUNT_DISCONNECTED',
    WHATSAPP_ACCOUNT_DELETED: 'WHATSAPP_ACCOUNT_DELETED',
    WHATSAPP_ACCOUNT_RENAMED: 'WHATSAPP_ACCOUNT_RENAMED',
  },
  AUDIT_ENTITY_TYPES: { WHATSAPP_ACCOUNT: 'whatsapp_account' },
}));

const { default: controller } = await import('../whatsappBaileys.controller.js');

const makeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};
const makeReq = (extra = {}) => ({
  user: { id: 7, activeContext: { type: 'self' } },
  params: { key: 'default' },
  body: {},
  headers: {},
  ip: '1.2.3.4',
  get: () => 'jest',
  ...extra,
});

describe('whatsappBaileys.controller — audit', () => {
  beforeEach(() => jest.clearAllMocks());

  it('connect -> WHATSAPP_ACCOUNT_CONNECT_STARTED, details.channel + sessionKey, không SĐT', async () => {
    svc.connectSession.mockResolvedValue({ status: 'qr', lastQr: 'data:x' });
    const res = makeRes();
    await controller.connect(makeReq({ body: { sessionKey: 'default' } }), res);
    expect(res.body.success).toBe(true);
    expect(logWorkspace).toHaveBeenCalledTimes(1);
    const [ctx, action, entityType, entityId, details] = logWorkspace.mock.calls[0];
    expect(ctx.ownerId).toBe(7);
    expect(action).toBe('WHATSAPP_ACCOUNT_CONNECT_STARTED');
    expect(entityType).toBe('whatsapp_account');
    expect(entityId).toBeNull(); // audit_logs.entity_id là BIGINT — sessionKey là chuỗi
    expect(details).toMatchObject({ channel: 'whatsapp_baileys', sessionKey: '7-default' });
    expect(JSON.stringify(details)).not.toMatch(/\d{9,}/);
  });

  it('disconnect thành công -> WHATSAPP_ACCOUNT_DISCONNECTED; thất bại (false) -> không ghi', async () => {
    svc.disconnectSession.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await controller.disconnect(makeReq(), makeRes());
    expect(logWorkspace).toHaveBeenCalledTimes(1);
    expect(logWorkspace.mock.calls[0][1]).toBe('WHATSAPP_ACCOUNT_DISCONNECTED');
    await controller.disconnect(makeReq(), makeRes());
    expect(logWorkspace).toHaveBeenCalledTimes(1);
  });

  it('remove -> await deleteSessionFiles rồi WHATSAPP_ACCOUNT_DELETED; success là boolean, không phải Promise', async () => {
    svc.deleteSessionFiles.mockResolvedValue(true);
    const res = makeRes();
    await controller.remove(makeReq(), res);
    expect(res.body).toEqual({ success: true });
    expect(logWorkspace.mock.calls[0][1]).toBe('WHATSAPP_ACCOUNT_DELETED');
    expect(logWorkspace.mock.calls[0][4]).toMatchObject({ channel: 'whatsapp_baileys', sessionKey: '7-default' });
  });

  it('updateSession -> WHATSAPP_ACCOUNT_RENAMED', async () => {
    const res = makeRes();
    await controller.updateSession(makeReq({ body: { nickname: '  Shop A ' } }), res);
    expect(svc.updateSessionNickname).toHaveBeenCalledWith('7-default', 'Shop A');
    expect(logWorkspace.mock.calls[0][1]).toBe('WHATSAPP_ACCOUNT_RENAMED');
    expect(logWorkspace.mock.calls[0][4]).toMatchObject({ nickname: 'Shop A' });
  });

  it('ghi nhật ký lỗi không làm hỏng thao tác chính', async () => {
    logWorkspace.mockRejectedValueOnce(new Error('db down'));
    svc.disconnectSession.mockResolvedValue(true);
    const res = makeRes();
    await controller.disconnect(makeReq(), res);
    expect(res.body).toEqual({ success: true });
  });
});

describe('whatsappBaileys.controller — _inject', () => {
  const prev = process.env.NODE_ENV;
  afterEach(() => { process.env.NODE_ENV = prev; });

  it('NODE_ENV=production -> 403, không đụng session', async () => {
    process.env.NODE_ENV = 'production';
    const res = makeRes();
    await controller.injectTestMessage(makeReq({ body: { text: 'x' } }), res);
    expect(res.statusCode).toBe(403);
    expect(svc.listSessions).not.toHaveBeenCalled();
  });
});
