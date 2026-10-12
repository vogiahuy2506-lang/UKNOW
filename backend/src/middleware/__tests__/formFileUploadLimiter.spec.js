/**
 * PR-4b — limiter xin URL tải tệp lên (không auth): 40 lượt / 15 phút / IP. Dựng app mini với limiter THẬT (skip tắt) để thấy 429.
 */
import { describe, expect, it } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import {
  FORM_FILE_UPLOAD_LIMITER_CONFIG,
  createFormFileUploadLimiter,
  formFileUploadLimiter,
} from '../rateLimiter.middleware.js';

describe('formFileUploadLimiter', () => {
  it('cấu hình 40 lần / 15 phút, mã lỗi riêng', () => {
    expect(FORM_FILE_UPLOAD_LIMITER_CONFIG.max).toBe(40);
    expect(FORM_FILE_UPLOAD_LIMITER_CONFIG.windowMs).toBe(15 * 60 * 1000);
    expect(FORM_FILE_UPLOAD_LIMITER_CONFIG.code).toBe('FORM_FILE_UPLOAD_RATE_LIMIT_EXCEEDED');
    expect(typeof formFileUploadLimiter).toBe('function');
  });

  it('lượt thứ 41 từ cùng một IP bị chặn 429 kèm mã lỗi; lượt 1..40 qua', async () => {
    const app = express();
    app.post('/uploads', createFormFileUploadLimiter({ skip: () => false }), (_req, res) => res.json({ ok: true }));

    for (let i = 0; i < FORM_FILE_UPLOAD_LIMITER_CONFIG.max; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).post('/uploads');
      expect(res.status).toBe(200);
    }
    const blocked = await request(app).post('/uploads');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ success: false, code: 'FORM_FILE_UPLOAD_RATE_LIMIT_EXCEEDED' });
  });

  it('mặc định bỏ qua khi NODE_ENV=test (instance dùng trong route không làm đỏ integration)', async () => {
    const app = express();
    app.post('/uploads', formFileUploadLimiter, (_req, res) => res.json({ ok: true }));
    for (let i = 0; i < 45; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).post('/uploads');
      expect(res.status).toBe(200);
    }
  });
});
