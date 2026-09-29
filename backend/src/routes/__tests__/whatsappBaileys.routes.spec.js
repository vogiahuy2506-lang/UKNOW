/**
 * PR-W1 — whatsappBaileys.routes.js: quyền `chatbot_channels_manage` ở mọi route, limiter cho route gửi thử,
 * `_inject` bị chặn với nhân viên thiếu quyền. Mock controller + auth; `requirePermission` là bản THẬT.
 */
import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const ok = (name) => jest.fn((req, res) => res.json({ success: true, handler: name }));
const controllerMock = {
  connect: ok('connect'),
  status: ok('status'),
  list: ok('list'),
  disconnect: ok('disconnect'),
  remove: ok('remove'),
  updateSession: ok('updateSession'),
  sendMessage: ok('sendMessage'),
  injectTestMessage: ok('injectTestMessage'),
};

jest.unstable_mockModule('../../controllers/whatsappBaileys.controller.js', () => ({ default: controllerMock }));
// Auth giả: đọc user từ header x-test-user (JSON).
jest.unstable_mockModule('../../middleware/auth.middleware.js', () => ({
  default: (req, res, next) => {
    req.user = JSON.parse(req.headers['x-test-user'] || '{}');
    next();
  },
}));

// requirePasswordChange/requirePhone đọc DB/hồ sơ — cho qua; requirePermission giữ bản thật.
const realAuthorization = await import('../../middleware/authorization.middleware.js');
jest.unstable_mockModule('../../middleware/authorization.middleware.js', () => ({
  ...realAuthorization,
  requirePasswordChange: (req, res, next) => next(),
  requirePhone: (req, res, next) => next(),
}));

const { default: router } = await import('../whatsappBaileys.routes.js');
const { whatsappTestSendLimiter } = await import('../../middleware/rateLimiter.middleware.js');

const owner = { id: 1, role: 'user', activeContext: { type: 'self' }, phone_verified: true };
const employee = (permissions) => ({
  id: 9,
  role: 'user',
  activeContext: { type: 'employee', ownerId: 1, permissions },
});

const app = express();
app.use(express.json());
app.use('/api/whatsapp-qr', router);

const call = (method, url, user) =>
  request(app)[method](`/api/whatsapp-qr${url}`).set('x-test-user', JSON.stringify(user)).send({});

const ROUTES = [
  ['get', '/sessions', 'list'],
  ['post', '/sessions', 'connect'],
  ['get', '/sessions/abc', 'status'],
  ['post', '/sessions/abc/disconnect', 'disconnect'],
  ['delete', '/sessions/abc', 'remove'],
  ['patch', '/sessions/abc', 'updateSession'],
  ['post', '/sessions/abc/messages', 'sendMessage'],
];

describe('whatsappBaileys.routes — quyền chatbot_channels_manage', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(ROUTES)('%s %s: nhân viên THIẾU quyền -> 403, controller không chạy', async (method, url, handler) => {
    const res = await call(method, url, employee({ chatbots_manage: true }));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
    expect(controllerMock[handler]).not.toHaveBeenCalled();
  });

  it.each(ROUTES)('%s %s: nhân viên CÓ quyền -> qua', async (method, url, handler) => {
    const res = await call(method, url, employee({ chatbot_channels_manage: true }));
    expect(res.status).toBe(200);
    expect(controllerMock[handler]).toHaveBeenCalledTimes(1);
  });

  it('DELETE /sessions/:key: nhân viên thiếu quyền bị chặn, chủ tài khoản (self context) được qua', async () => {
    const denied = await call('delete', '/sessions/abc', employee({}));
    expect(denied.status).toBe(403);
    expect(controllerMock.remove).not.toHaveBeenCalled();
    const allowed = await call('delete', '/sessions/abc', owner);
    expect(allowed.status).toBe(200);
    expect(controllerMock.remove).toHaveBeenCalledTimes(1);
  });

  it('_inject cũng bị chặn với nhân viên thiếu quyền', async () => {
    const res = await call('post', '/sessions/abc/_inject', employee({}));
    expect(res.status).toBe(403);
    expect(controllerMock.injectTestMessage).not.toHaveBeenCalled();
  });
});

describe('whatsappBaileys.routes — limiter gửi thử', () => {
  it('POST /sessions/:key/messages gắn whatsappTestSendLimiter (so tham chiếu hàm)', () => {
    const layer = router.stack.find((l) => l.route?.path === '/sessions/:key/messages' && l.route.methods.post);
    expect(layer).toBeTruthy();
    expect(layer.route.stack.map((l) => l.handle)).toContain(whatsappTestSendLimiter);
  });

  it('các route khác KHÔNG bị limiter gửi thử', () => {
    const others = router.stack.filter(
      (l) => l.route && !(l.route.path === '/sessions/:key/messages' && l.route.methods.post),
    );
    expect(others.length).toBeGreaterThan(0);
    for (const l of others) {
      expect(l.route.stack.map((s) => s.handle)).not.toContain(whatsappTestSendLimiter);
    }
  });
});
