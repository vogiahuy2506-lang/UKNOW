/**
 * IP khách ghi vào DB lấy từ req.ip (đã áp `trust proxy`), không đọc thẳng X-Forwarded-For —
 * header đó client tự đặt được.
 *   - POST /api/contact           → contact.controller.submitContact
 *   - pixel mở email (công khai)  → customer.controller.trackEmailOpen
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockSubmitContactForm = jest.fn();
jest.unstable_mockModule('../../services/contact.service.js', () => ({
  submitContactForm: mockSubmitContactForm,
}));

const mockTrackEmailOpen = jest.fn();
jest.unstable_mockModule('../../services/customer/customerEmailTracking.service.js', () => ({
  default: { trackEmailOpen: mockTrackEmailOpen },
}));
jest.unstable_mockModule('../../services/customer/customerHelper.service.js', () => ({
  default: {
    getTrackingPixelResponse: () => ({ buffer: Buffer.from('GIF'), headers: { 'Content-Type': 'image/gif' } }),
    mapJourneyEvent: (row) => row,
  },
}));

const { submitContact } = await import('../contact.controller.js');
const { default: customerController } = await import('../customer.controller.js');

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.send = jest.fn(() => res);
  res.set = jest.fn(() => res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSubmitContactForm.mockResolvedValue({ id: 1 });
  mockTrackEmailOpen.mockResolvedValue();
});

describe('IP khách lấy từ req.ip', () => {
  it('contact: bỏ qua X-Forwarded-For giả, dùng req.ip', async () => {
    const req = {
      body: { name: 'An', email: 'a@x.vn', message: 'Xin tư vấn gói doanh nghiệp' },
      headers: { 'x-forwarded-for': '6.6.6.6, 10.0.0.1' },
      ip: '203.0.113.20',
      socket: { remoteAddress: '10.0.0.1' },
    };
    const res = makeRes();
    await submitContact(req, res);
    expect(mockSubmitContactForm).toHaveBeenCalledWith(expect.objectContaining({ ipAddress: '203.0.113.20' }));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('pixel mở email: bỏ qua X-Forwarded-For giả, dùng req.ip', async () => {
    const req = {
      params: { token: 'tok' },
      headers: { 'x-forwarded-for': '6.6.6.6' },
      ip: '198.51.100.7',
      socket: { remoteAddress: '10.0.0.1' },
      get: () => null,
    };
    const res = makeRes();
    await customerController.trackEmailOpen(req, res);
    expect(mockTrackEmailOpen).toHaveBeenCalledWith(expect.objectContaining({ token: 'tok', clientIp: '198.51.100.7' }));
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
