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
  getSession: jest.fn(() => undefined),
  listPersistedSessions: jest.fn(async () => []),
  sendMessage: jest.fn(),
};
const whatsappSessionIsLocked = jest.fn(async () => false);
const txClient = { query: jest.fn(async () => ({ rows: [] })), release: jest.fn() };
const enforceResourceLimitTx = jest.fn(async () => {});
jest.unstable_mockModule('../../config/database.js', () => ({
  default: { getClient: jest.fn(async () => txClient) },
}));
jest.unstable_mockModule('../../utils/userResourceLimit.util.js', () => ({ enforceResourceLimitTx }));
jest.unstable_mockModule('../../utils/topupLockGate.util.js', () => ({
  whatsappSessionIsLocked,
  CHANNEL_ACCOUNT_LOCKED_MESSAGE: 'Tài khoản đang bị khoá do vượt hạn mức gói',
}));
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
  beforeEach(() => {
    jest.clearAllMocks();
    svc.getSession.mockReturnValue(undefined);
    svc.listPersistedSessions.mockResolvedValue([]);
    enforceResourceLimitTx.mockResolvedValue(undefined);
  });

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

describe('whatsappBaileys.controller — W5 hạn mức số tài khoản', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    svc.getSession.mockReturnValue(undefined);
    svc.listPersistedSessions.mockResolvedValue([]);
    enforceResourceLimitTx.mockResolvedValue(undefined);
    svc.connectSession.mockResolvedValue({ status: 'qr', lastQr: 'data:x' });
  });

  it('phiên MỚI -> enforce whatsappAccounts trong giao dịch rồi mới connectSession, COMMIT', async () => {
    const res = makeRes();
    await controller.connect(makeReq({ user: { id: 7, role: 'user', activeContext: { type: 'self' } }, body: { sessionKey: 'a' } }), res);
    expect(enforceResourceLimitTx).toHaveBeenCalledTimes(1);
    expect(enforceResourceLimitTx.mock.calls[0][1]).toEqual({ userId: 7, roleCode: 'user', resourceKey: 'whatsappAccounts' });
    expect(enforceResourceLimitTx.mock.invocationCallOrder[0]).toBeLessThan(svc.connectSession.mock.invocationCallOrder[0]);
    expect(txClient.query.mock.calls.map((c) => c[0])).toEqual(['BEGIN', 'COMMIT']);
    expect(res.body.success).toBe(true);
  });

  it('kết nối lại phiên ĐÃ có creds -> KHÔNG enforce (không tốn thêm chỗ)', async () => {
    svc.listPersistedSessions.mockResolvedValue(['7-a']);
    const res = makeRes();
    await controller.connect(makeReq({ body: { sessionKey: 'a' } }), res);
    expect(enforceResourceLimitTx).not.toHaveBeenCalled();
    expect(svc.connectSession).toHaveBeenCalledWith('7-a');
    expect(res.body.success).toBe(true);
  });

  it('vượt hạn mức -> 400 RESOURCE_LIMIT_EXCEEDED, KHÔNG connectSession, ROLLBACK', async () => {
    const err = Object.assign(new Error('Tài khoản đã đạt giới hạn'), { code: 'RESOURCE_LIMIT_EXCEEDED', statusCode: 400, resource: 'whatsappAccounts' });
    enforceResourceLimitTx.mockRejectedValue(err);
    const res = makeRes();
    await controller.connect(makeReq({ body: { sessionKey: 'b' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ success: false, code: 'RESOURCE_LIMIT_EXCEEDED', limitReached: true });
    expect(svc.connectSession).not.toHaveBeenCalled();
    expect(txClient.query.mock.calls.map((c) => c[0])).toEqual(['BEGIN', 'ROLLBACK']);
    expect(txClient.release).toHaveBeenCalled();
  });
});

// P8a — nút "Gửi thử" trên trang kênh dùng POST /sessions/:key/messages: chuẩn hoá SĐT, chặn phiên bị khoá.
describe('whatsappBaileys.controller — sendMessage (gửi thử, P8a)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    whatsappSessionIsLocked.mockResolvedValue(false);
    svc.sendMessage.mockResolvedValue({ key: { id: 'MSG1' } });
  });

  it.each([
    ['0912 345 678', '84912345678'],
    ['+84 912-345-678', '84912345678'],
    ['84912345678', '84912345678'],
  ])('SĐT "%s" gửi tới %s trên đúng phiên của chủ', async (input, expected) => {
    const res = makeRes();
    await controller.sendMessage(makeReq({ body: { to: input, text: 'Xin chào' } }), res);
    expect(res.body).toEqual({ success: true, data: { messageId: 'MSG1' } });
    expect(svc.sendMessage).toHaveBeenCalledWith('7-default', expected, 'Xin chào');
  });

  it('SĐT sai định dạng -> 400, KHÔNG gửi', async () => {
    const res = makeRes();
    await controller.sendMessage(makeReq({ body: { to: '12ab', text: 'x' } }), res);
    expect(res.statusCode).toBe(400);
    expect(svc.sendMessage).not.toHaveBeenCalled();
  });

  it('thiếu to/text -> 400', async () => {
    const res = makeRes();
    await controller.sendMessage(makeReq({ body: { to: '0912345678' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('phiên bị khoá vượt gói -> 403 WHATSAPP_ACCOUNT_LOCKED, KHÔNG gửi', async () => {
    whatsappSessionIsLocked.mockResolvedValue(true);
    const res = makeRes();
    await controller.sendMessage(makeReq({ body: { to: '0912345678', text: 'x' } }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ success: false, code: 'WHATSAPP_ACCOUNT_LOCKED' });
    expect(whatsappSessionIsLocked).toHaveBeenCalledWith('7-default');
    expect(svc.sendMessage).not.toHaveBeenCalled();
  });

  it('nội dung dài bị cắt 1000 ký tự', async () => {
    const res = makeRes();
    await controller.sendMessage(makeReq({ body: { to: '0912345678', text: 'a'.repeat(1500) } }), res);
    expect(svc.sendMessage.mock.calls[0][2]).toHaveLength(1000);
  });
});
