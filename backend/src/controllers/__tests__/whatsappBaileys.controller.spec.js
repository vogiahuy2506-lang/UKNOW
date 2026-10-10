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
const dbQuery = jest.fn(async () => ({ rows: [] }));
jest.unstable_mockModule('../../config/database.js', () => ({
  default: { getClient: jest.fn(async () => txClient), query: dbQuery },
}));
jest.unstable_mockModule('../../utils/userResourceLimit.util.js', () => ({ enforceResourceLimitTx }));
jest.unstable_mockModule('../../utils/topupLockGate.util.js', () => ({
  whatsappSessionIsLocked,
  lockedChannelAccountRefs: jest.fn(async () => new Set()),
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

// ─── PLAN_GIAO_TK_TG_WA PR-H1: nhân viên nối lại khoá đã tồn tại / tạo khoá mới / xoá phiên ───────────────────────────
describe('whatsappBaileys.controller — giao tài khoản cho nhân viên (PR-H1)', () => {
  const employee = { id: 20, role: 'user', activeContext: { type: 'employee', ownerId: 7, membershipId: 3, permissions: {} } };
  const sqlOf = (call) => String(call[0]).replace(/\s+/g, ' ');

  beforeEach(() => {
    jest.clearAllMocks();
    svc.getSession.mockReturnValue(undefined);
    svc.listPersistedSessions.mockResolvedValue([]);
    enforceResourceLimitTx.mockResolvedValue(undefined);
    svc.connectSession.mockResolvedValue({ status: 'qr', lastQr: 'data:x' });
    dbQuery.mockImplementation(async () => ({ rows: [] }));
  });

  it('nhân viên nối lại khoá ĐÃ TỒN TẠI mà chưa được giao → 403 CHANNEL_ACCOUNT_NOT_ASSIGNED, KHÔNG connectSession, không ghi gì', async () => {
    svc.listPersistedSessions.mockResolvedValue(['7-default']);
    dbQuery.mockResolvedValue({ rows: [] }); // bảng giao: nhân viên chưa có hàng nào
    const res = makeRes();
    await controller.connect(makeReq({ user: employee, body: { sessionKey: 'default' } }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ success: false, code: 'CHANNEL_ACCOUNT_NOT_ASSIGNED' });
    expect(svc.connectSession).not.toHaveBeenCalled();
    expect(txClient.query).not.toHaveBeenCalled();
  });

  it('khoá đang sống trong bộ nhớ (chưa có creds) cũng coi là đã tồn tại → 403 nếu chưa giao', async () => {
    svc.getSession.mockReturnValue({ status: 'open' });
    const res = makeRes();
    await controller.connect(makeReq({ user: employee, body: { sessionKey: 'default' } }), res);
    expect(res.statusCode).toBe(403);
    expect(svc.connectSession).not.toHaveBeenCalled();
  });

  it('nhân viên nối lại khoá ĐƯỢC GIAO → connectSession bình thường, không enforce hạn mức', async () => {
    svc.listPersistedSessions.mockResolvedValue(['7-default']);
    dbQuery.mockResolvedValue({ rows: [{ account_ref: '7-default' }] });
    const res = makeRes();
    await controller.connect(makeReq({ user: employee, body: { sessionKey: 'default' } }), res);
    expect(res.body.success).toBe(true);
    expect(svc.connectSession).toHaveBeenCalledWith('7-default');
    expect(enforceResourceLimitTx).not.toHaveBeenCalled();
    const assignedQuery = dbQuery.mock.calls[0];
    expect(String(assignedQuery[0])).toMatch(/member_channel_accounts/);
    expect(assignedQuery[1]).toEqual([7, 20, 'whatsapp_baileys']);
  });

  it('nhân viên tạo khoá MỚI → trong CÙNG giao dịch: enforce hạn mức, xoá hàng cũ cùng khoá, chèn self_login, rồi connectSession, COMMIT', async () => {
    const res = makeRes();
    await controller.connect(makeReq({ user: employee, body: { sessionKey: 'moi' } }), res);
    expect(res.body.success).toBe(true);
    const sqls = txClient.query.mock.calls.map(sqlOf);
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls.at(-1)).toBe('COMMIT');
    const del = txClient.query.mock.calls.findIndex((c) => /^DELETE FROM member_channel_accounts/.test(sqlOf(c)));
    const ins = txClient.query.mock.calls.findIndex((c) => /INSERT INTO member_channel_accounts/.test(sqlOf(c)));
    expect(del).toBeGreaterThan(0);
    expect(ins).toBeGreaterThan(del);
    expect(txClient.query.mock.calls[del][1]).toEqual(['whatsapp_baileys', '7-moi']);
    expect(sqlOf(txClient.query.mock.calls[ins])).toMatch(/'self_login'/);
    expect(txClient.query.mock.calls[ins][1]).toEqual([7, 20, 'whatsapp_baileys', '7-moi']);
    expect(enforceResourceLimitTx.mock.invocationCallOrder[0]).toBeLessThan(svc.connectSession.mock.invocationCallOrder[0]);
    expect(svc.connectSession).toHaveBeenCalledWith('7-moi');
  });

  it('nhân viên tạo khoá mới nhưng vượt hạn mức → ROLLBACK, không connectSession (hàng self_login không được giữ lại)', async () => {
    enforceResourceLimitTx.mockRejectedValue(Object.assign(new Error('đạt giới hạn'), { code: 'RESOURCE_LIMIT_EXCEEDED', statusCode: 400 }));
    const res = makeRes();
    await controller.connect(makeReq({ user: employee, body: { sessionKey: 'moi' } }), res);
    expect(res.statusCode).toBe(400);
    expect(svc.connectSession).not.toHaveBeenCalled();
    expect(txClient.query.mock.calls.map(sqlOf)).toEqual(['BEGIN', 'ROLLBACK']);
  });

  it('CHỦ tạo khoá mới / nối lại khoá cũ → KHÔNG đụng bảng giao', async () => {
    const res = makeRes();
    await controller.connect(makeReq({ body: { sessionKey: 'moi' } }), res);
    expect(res.body.success).toBe(true);
    expect(txClient.query.mock.calls.map(sqlOf)).toEqual(['BEGIN', 'COMMIT']);
    svc.listPersistedSessions.mockResolvedValue(['7-cu']);
    const res2 = makeRes();
    await controller.connect(makeReq({ body: { sessionKey: 'cu' } }), res2);
    expect(res2.body.success).toBe(true);
    // Không truy vấn nào chạm bảng giao (chỉ còn dòng cấu hình gửi `whatsapp_account_settings` có sẵn từ trước).
    const touched = [...dbQuery.mock.calls, ...txClient.query.mock.calls].filter((c) => /member_channel_accounts/.test(String(c[0])));
    expect(touched).toHaveLength(0);
  });

  it('remove → dọn mọi hàng giao của khoá đó (khoá dùng lại được sau khi xoá); lỗi dọn không làm hỏng việc xoá', async () => {
    svc.deleteSessionFiles.mockResolvedValue(true);
    const res = makeRes();
    await controller.remove(makeReq(), res);
    expect(res.body).toEqual({ success: true });
    const cleanup = dbQuery.mock.calls.find((c) => /^DELETE FROM member_channel_accounts/.test(sqlOf(c)));
    expect(cleanup[1]).toEqual(['whatsapp_baileys', '7-default']);

    dbQuery.mockRejectedValueOnce(new Error('db down'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const res2 = makeRes();
    await controller.remove(makeReq(), res2);
    expect(res2.body).toEqual({ success: true });
  });

  it('remove thất bại (deleteSessionFiles = false) → KHÔNG dọn việc giao', async () => {
    svc.deleteSessionFiles.mockResolvedValue(false);
    await controller.remove(makeReq(), makeRes());
    expect(dbQuery.mock.calls.filter((c) => /member_channel_accounts/.test(String(c[0])))).toHaveLength(0);
  });
});

// ─── PLAN_GIAO_TK_TG_WA PR-H2: nhân viên chỉ thao tác phiên ĐƯỢC GIAO ───────────────────────────────────────────────────
describe('whatsappBaileys.controller — chặn phiên chưa giao (PR-H2)', () => {
  const employee = { id: 20, role: 'user', activeContext: { type: 'employee', ownerId: 7, membershipId: 3, permissions: {} } };
  const assigned = (...keys) => dbQuery.mockImplementation(async () => ({ rows: keys.map((account_ref) => ({ account_ref })) }));

  beforeEach(() => {
    jest.clearAllMocks();
    svc.getSession.mockReturnValue(undefined);
    svc.listPersistedSessions.mockResolvedValue([]);
    svc.listSessions.mockReturnValue([]);
    dbQuery.mockImplementation(async () => ({ rows: [] }));
  });

  const cases = [
    ['status', (req) => controller.status(req, makeRes())],
    ['disconnect', (req) => controller.disconnect(req, makeRes())],
    ['remove', (req) => controller.remove(req, makeRes())],
    ['updateSession', (req) => controller.updateSession(req, makeRes())],
    ['sendMessage', (req) => controller.sendMessage(req, makeRes())],
  ];

  it.each(cases)('%s trên phiên CHƯA giao → 403 CHANNEL_ACCOUNT_NOT_ASSIGNED, KHÔNG chạm dịch vụ WhatsApp', async (name) => {
    const res = makeRes();
    const req = makeReq({ user: employee, params: { key: 'hai' }, body: { to: '0912345678', text: 'hi', nickname: 'x' } });
    await controller[name](req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ success: false, code: 'CHANNEL_ACCOUNT_NOT_ASSIGNED' });
    expect(svc.disconnectSession).not.toHaveBeenCalled();
    expect(svc.deleteSessionFiles).not.toHaveBeenCalled();
    expect(svc.updateSessionNickname).not.toHaveBeenCalled();
    expect(svc.sendMessage).not.toHaveBeenCalled();
    expect(svc.getSession).not.toHaveBeenCalled();
  });

  it('phiên ĐƯỢC giao → qua cổng (status trả bản ghi phiên)', async () => {
    assigned('7-mot');
    svc.getSession.mockReturnValue({ sessionKey: '7-mot', status: 'open' });
    const res = makeRes();
    await controller.status(makeReq({ user: employee, params: { key: 'mot' } }), res);
    expect(res.body).toEqual({ success: true, data: { sessionKey: '7-mot', status: 'open' } });
  });

  it('CHỦ làm được trên phiên bất kỳ, không đọc bảng giao', async () => {
    svc.disconnectSession.mockResolvedValue(true);
    const res = makeRes();
    await controller.disconnect(makeReq({ params: { key: 'hai' } }), res);
    expect(res.body).toEqual({ success: true });
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it('list: nhân viên chỉ thấy phiên được giao; chủ thấy hết', async () => {
    svc.listSessions.mockReturnValue([]);
    svc.listPersistedSessions.mockResolvedValue(['7-mot', '7-hai']);
    assigned('7-mot');
    const emp = makeRes();
    await controller.list(makeReq({ user: employee }), emp);
    expect(emp.body.data.map((s) => s.sessionKey)).toEqual(['7-mot']);

    const own = makeRes();
    await controller.list(makeReq(), own);
    expect(own.body.data.map((s) => s.sessionKey).sort()).toEqual(['7-hai', '7-mot']);
  });

  it('list: lỗi đọc việc giao → danh sách RỖNG (hỏng thì chặn), không lộ phiên', async () => {
    svc.listPersistedSessions.mockResolvedValue(['7-mot']);
    dbQuery.mockRejectedValue(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    await controller.list(makeReq({ user: employee }), res);
    expect(res.body.data).toEqual([]);
  });
});
