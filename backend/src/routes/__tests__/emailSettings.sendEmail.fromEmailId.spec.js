import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// B5b: POST /email-settings/send-email nhận fromEmailId trống/thiếu (dùng tài khoản mặc định, service quyết); id sai vẫn bị chặn 400.

const mockSendCustomEmail = jest.fn((req, res) => res.json({ success: true }));
jest.unstable_mockModule('../../controllers/emailSettings.controller.js', () => ({
  default: new Proxy({}, {
    get: (_target, prop) => (prop === 'sendCustomEmail' ? mockSendCustomEmail : () => {}),
  }),
}));

const passThrough = (_req, _res, next) => next();
jest.unstable_mockModule('../../middleware/auth.middleware.js', () => ({ default: passThrough }));
jest.unstable_mockModule('../../middleware/authorization.middleware.js', () => ({
  requirePermission: () => passThrough,
  requireActivePlan: passThrough,
  requirePasswordChange: passThrough,
  requirePhone: passThrough,
}));

const { default: router } = await import('../emailSettings.routes.js');

const app = express();
app.use(express.json());
app.use('/api/email-settings', router);

describe('POST /email-settings/send-email — fromEmailId', () => {
  beforeEach(() => mockSendCustomEmail.mockClear());
  const base = { to: 'a@example.com', subject: 'S', content: 'C' };

  it.each([
    ['thieu truong', {}],
    ['chuoi rong', { fromEmailId: '' }],
    ['null', { fromEmailId: null }],
  ])('%s -> qua validate, controller duoc goi', async (_name, extra) => {
    const res = await request(app).post('/api/email-settings/send-email').send({ ...base, ...extra });
    expect(res.status).toBe(200);
    expect(mockSendCustomEmail).toHaveBeenCalledTimes(1);
  });

  it.each([['abc'], [0], [-3]])('fromEmailId=%p khong hop le -> 400, controller khong duoc goi', async (bad) => {
    const res = await request(app).post('/api/email-settings/send-email').send({ ...base, fromEmailId: bad });
    expect(res.status).toBe(400);
    expect(mockSendCustomEmail).not.toHaveBeenCalled();
  });

  it('fromEmailId so hop le -> qua', async () => {
    const res = await request(app).post('/api/email-settings/send-email').send({ ...base, fromEmailId: 12 });
    expect(res.status).toBe(200);
  });
});
