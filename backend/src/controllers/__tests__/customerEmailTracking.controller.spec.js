/**
 * PLAN_RA_SOAT_DOT3 PR-Q1 việc 6 — controller tracking email luôn trả pixel / redirect, kể cả khi service ném lỗi
 * (db.getClient() cạn pool nằm TRƯỚC try của service nên lỗi lọt ra thành 500 cho client email / người bấm link).
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { default: customerController } = await import('../customer.controller.js');
const { default: customerEmailTrackingService } = await import('../../services/customer/customerEmailTracking.service.js');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.set = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  res.type = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  res.redirect = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}
const mockReq = (extra = {}) => ({
  params: { token: 'tok-1' },
  query: {},
  ip: '203.0.113.9',
  get: jest.fn().mockReturnValue(null),
  ...extra,
});

describe('customer.controller — tracking email không bao giờ 500 (PR-Q1 việc 6)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('pixel: service ném lỗi (cạn pool) -> VẪN trả ảnh pixel, không ném', async () => {
    jest.spyOn(customerEmailTrackingService, 'trackEmailOpen').mockRejectedValue(new Error('timeout exceeded when trying to connect'));
    const sendPixel = jest.spyOn(customerController, 'sendTrackingPixel').mockImplementation(() => 'pixel');

    const result = await customerController.trackEmailOpen(mockReq(), mockRes());

    expect(sendPixel).toHaveBeenCalledTimes(1);
    expect(result).toBe('pixel');
  });

  it('click: service ném lỗi -> VẪN redirect 302 (về FRONTEND_URL), không ném', async () => {
    process.env.FRONTEND_URL = 'https://app.example.test';
    jest.spyOn(customerEmailTrackingService, 'trackEmailClick').mockRejectedValue(new Error('timeout exceeded when trying to connect'));
    const res = mockRes();

    await customerController.trackEmailClick(mockReq({ query: { url: 'https://dich.example/a' } }), res);

    expect(res.redirect).toHaveBeenCalledWith(302, 'https://app.example.test');
  });

  it('ĐỐI CHỨNG click: service ổn -> redirect tới URL service trả về', async () => {
    jest.spyOn(customerEmailTrackingService, 'trackEmailClick').mockResolvedValue({ redirectUrl: 'https://dich.example/a?utm_source=email_campaign' });
    const res = mockRes();

    await customerController.trackEmailClick(mockReq(), res);

    expect(res.redirect).toHaveBeenCalledWith(302, 'https://dich.example/a?utm_source=email_campaign');
  });
});
