/**
 * Chia sẻ chiến dịch / landing page qua email: 30 lượt / giờ / tài khoản, mỗi loại một bucket,
 * lượt 31 → 429. Limiter thật (skip tắt) dựng qua factory; route gắn đúng instance.
 */
import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import request from 'supertest';
import {
  SHARE_INVITE_LIMITER_CONFIG,
  createShareInviteLimiter,
  campaignShareLimiter,
  landingPageShareLimiter,
} from '../rateLimiter.middleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const makeApp = (limiter) => {
  const app = express();
  app.use((req, _res, next) => {
    req.user = { id: Number(req.headers['x-uid']) };
    next();
  });
  app.post('/share', limiter, (_req, res) => res.json({ ok: true }));
  return app;
};

describe('share invite limiter', () => {
  it('cấu hình: 30 lượt / 1 giờ, hai bucket khác nhau cho chiến dịch và landing page', () => {
    expect(SHARE_INVITE_LIMITER_CONFIG.max).toBe(30);
    expect(SHARE_INVITE_LIMITER_CONFIG.windowMs).toBe(60 * 60 * 1000);
    expect(typeof campaignShareLimiter).toBe('function');
    expect(typeof landingPageShareLimiter).toBe('function');
    expect(campaignShareLimiter).not.toBe(landingPageShareLimiter);
  });

  it('30 lượt đầu qua, lượt 31 → 429 đúng mã; tài khoản khác không bị ảnh hưởng', async () => {
    const app = makeApp(createShareInviteLimiter({ prefix: 'spec-share:', skip: () => false }));
    for (let i = 1; i <= 30; i += 1) {
      const res = await request(app).post('/share').set('x-uid', '701');
      expect(res.status).toBe(200);
    }
    const blocked = await request(app).post('/share').set('x-uid', '701');
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('SHARE_RATE_LIMIT_EXCEEDED');
    const other = await request(app).post('/share').set('x-uid', '702');
    expect(other.status).toBe(200);
  });

  it('route POST /:id/share của chiến dịch và landing page gắn limiter', () => {
    // Đọc mã route (nạp router thật kéo theo toàn bộ controller/DB) — lấy đúng khối khai báo route.
    const shareRouteBlock = (file) => {
      const source = fs.readFileSync(path.resolve(__dirname, '../../routes', file), 'utf8');
      const start = source.indexOf("router.post('/:id/share',");
      expect(start).toBeGreaterThanOrEqual(0);
      return source.slice(start, source.indexOf(');', start));
    };
    expect(shareRouteBlock('campaign.routes.js')).toContain('campaignShareLimiter,');
    expect(shareRouteBlock('adminLandingPage.routes.js')).toContain('landingPageShareLimiter,');
  });
});
