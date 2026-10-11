/**
 * PLAN_RA_SOAT_DOT3 PR-Q2 việc g — RFC 8058: Gmail/Yahoo POST `List-Unsubscribe=One-Click` (form-urlencoded) thẳng vào
 * URL trong header List-Unsubscribe, KHÔNG có người bấm nút xác nhận. Ghim rằng route công khai thật nhận POST đó
 * và coi là đã xác nhận (confirm=true), còn GET (trình quét link) vẫn chỉ hiện trang xác nhận.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const { default: customerRoutes } = await import('../../routes/customer.routes.js');
const { default: customerEmailTrackingService } = await import('../../services/customer/customerEmailTracking.service.js');

const TOKEN = '3f2c9d52-7a41-4b6e-9c10-0a1b2c3d4e5f';
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use('/api/customers', customerRoutes);

describe('POST một chạm vào URL huỷ đăng ký (RFC 8058)', () => {
  let spy;
  beforeEach(() => {
    spy = jest.spyOn(customerEmailTrackingService, 'trackEmailUnsubscribe')
      .mockResolvedValue({ statusCode: 200, html: '<p>ok</p>' });
  });

  it('POST body List-Unsubscribe=One-Click (form-urlencoded) → confirm=true, 200, không cần nút', async () => {
    const res = await request(app)
      .post(`/api/customers/email-tracking/unsubscribe/${TOKEN}`)
      .type('form')
      .send('List-Unsubscribe=One-Click');

    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ token: TOKEN, confirm: true }));
  });

  it('POST không body (nút trong trang xác nhận) cũng là xác nhận', async () => {
    await request(app).post(`/api/customers/email-tracking/unsubscribe/${TOKEN}`);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ confirm: true }));
  });

  it('ĐỐI CHỨNG: GET (trình quét link) KHÔNG xác nhận', async () => {
    await request(app).get(`/api/customers/email-tracking/unsubscribe/${TOKEN}`);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ confirm: false }));
  });
});
