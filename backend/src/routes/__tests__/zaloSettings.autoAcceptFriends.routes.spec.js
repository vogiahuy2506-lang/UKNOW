import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

/**
 * PLAN_ZALO_TU_DONG_DONG_Y_KET_BAN_2026-10-17 Việc 6 — đấu dây route PATCH /api/zalo/accounts/:id/auto-accept-friends.
 *
 * Validator thật (express-validator + handleValidationErrors), controller/auth/quyền được giả để chỉ ghim:
 *  - `enabled` BẮT BUỘC có và phải là boolean (thiếu -> 400, không hiểu ngầm thành tắt/bật);
 *  - `enabled: false` là giá trị hợp lệ (không bị coi là "thiếu");
 *  - controller nhận boolean THẬT (đã toBoolean), kể cả khi client gửi chuỗi "true"/"false";
 *  - route đòi quyền `zalo_settings`.
 */
const mockAuth = (req, res, next) => {
  req.user = { id: 1, role: 'user', phone: '0900000001', activeContext: { type: 'self', contextPlanId: 1 } };
  next();
};

jest.unstable_mockModule('../../middleware/auth.middleware.js', () => ({
  default: mockAuth,
  resolveUserContext: jest.fn(),
  optionalAuthMiddleware: (req, res, next) => next(),
  attachUserIdForRateLimit: (req, res, next) => next(),
  attachSseUserIdForRateLimit: (req, res, next) => next(),
}));

const passThrough = (req, res, next) => next();
jest.unstable_mockModule('../../middleware/authorization.middleware.js', () => ({
  // Giả lập quyền: header x-deny-permission = tên quyền bị từ chối -> 403. Ghi lại quyền đã được đòi.
  requirePermission: (permission) => (req, res, next) => {
    (req.requestedPermissions ||= []).push(permission);
    if (req.headers['x-deny-permission'] === permission) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    return next();
  },
  requireAnyPermission: () => passThrough,
  requireActivePlan: passThrough,
  requirePasswordChange: passThrough,
  requirePhone: passThrough,
}));

const reached = jest.fn();
const makeProxyController = new Proxy({
  updateAutoAcceptFriendRequests: (req, res) => {
    reached(req.body, req.params.id, req.requestedPermissions);
    res.json({ success: true });
  },
}, {
  get: (target, prop) => target[prop] || ((req, res) => res.json({ success: true, method: String(prop) })),
});
jest.unstable_mockModule('../../controllers/zaloSettings.controller.js', () => ({ default: makeProxyController }));

const { default: zaloSettingsRoutes } = await import('../zaloSettings.routes.js');

const app = express();
app.use(express.json());
app.use('/api/zalo', zaloSettingsRoutes);

const patch = (id = 5) => request(app).patch(`/api/zalo/accounts/${id}/auto-accept-friends`);

describe('PATCH /api/zalo/accounts/:id/auto-accept-friends — đấu dây route', () => {
  beforeEach(() => {
    reached.mockClear();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('thiếu enabled -> 400, controller không bị gọi', async () => {
    const res = await patch().send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(reached).not.toHaveBeenCalled();
  });

  it.each([
    ['null', { enabled: null }],
    ['chuỗi lạ', { enabled: 'maybe' }],
    ['số 2', { enabled: 2 }],
    ['mảng', { enabled: [true] }],
  ])('enabled = %s -> 400', async (_label, body) => {
    const res = await patch().send(body);
    expect(res.status).toBe(400);
    expect(reached).not.toHaveBeenCalled();
  });

  it.each([['abc'], ['0'], ['-3']])('id tài khoản không hợp lệ (%s) -> 400', async (id) => {
    const res = await patch(id).send({ enabled: true });
    expect(res.status).toBe(400);
    expect(reached).not.toHaveBeenCalled();
  });

  it('enabled: true -> tới controller với boolean true', async () => {
    const res = await patch().send({ enabled: true });
    expect(res.status).toBe(200);
    expect(reached).toHaveBeenCalledTimes(1);
    expect(reached.mock.calls[0][0]).toEqual({ enabled: true });
    expect(reached.mock.calls[0][1]).toBe('5');
  });

  it('enabled: false là giá trị HỢP LỆ (không bị coi là thiếu), tới controller là false', async () => {
    const res = await patch().send({ enabled: false });
    expect(res.status).toBe(200);
    expect(reached.mock.calls[0][0]).toEqual({ enabled: false });
  });

  it('chuỗi "true"/"false" được chuẩn hoá thành boolean thật trước khi tới controller', async () => {
    await patch().send({ enabled: 'true' });
    await patch().send({ enabled: 'false' });
    expect(reached.mock.calls[0][0].enabled).toBe(true);
    expect(reached.mock.calls[1][0].enabled).toBe(false);
  });

  it('đòi quyền zalo_settings: bị từ chối quyền -> 403 và controller không bị gọi', async () => {
    const allowed = await patch().send({ enabled: true });
    expect(allowed.status).toBe(200);
    expect(reached.mock.calls[0][2]).toContain('zalo_settings');

    reached.mockClear();
    const denied = await patch().set('x-deny-permission', 'zalo_settings').send({ enabled: true });
    expect(denied.status).toBe(403);
    expect(reached).not.toHaveBeenCalled();
  });
});
