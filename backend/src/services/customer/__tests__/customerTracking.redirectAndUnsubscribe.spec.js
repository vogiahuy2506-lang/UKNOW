import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const { default: db } = await import('../../../config/database.js');
const { default: emailTrackingService } = await import('../customerEmailTracking.service.js');
const { default: zaloTrackingService } = await import('../customerZaloTracking.service.js');
const { default: emailTrackingRepository } = await import('../../../repositories/customer/customerEmailTracking.repository.js');
const { default: zaloTrackingRepository } = await import('../../../repositories/customer/customerZaloTracking.repository.js');

/**
 * PR-C1 việc 3 (open redirect) + việc 6 (GET huỷ đăng ký không đổi trạng thái) — mức đơn vị, không cần DB.
 */
const DEFAULT_REDIRECT = 'https://app.example.test';
const EVIL = 'https://evil.example/phish';

let fakeClient;
let originalFrontendUrl;

beforeEach(() => {
  originalFrontendUrl = process.env.FRONTEND_URL;
  process.env.FRONTEND_URL = DEFAULT_REDIRECT;
  fakeClient = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
  jest.spyOn(db, 'getClient').mockResolvedValue(fakeClient);
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
  else process.env.FRONTEND_URL = originalFrontendUrl;
  jest.restoreAllMocks();
});

describe('trackEmailClick — open redirect', () => {
  it('không có token → về FRONTEND_URL dù url là trang lạ', async () => {
    const result = await emailTrackingService.trackEmailClick({ token: '', rawUrl: EVIL, label: null, linkKey: null });
    expect(result.redirectUrl).toBe(DEFAULT_REDIRECT);
  });

  it('token không tìm thấy → về FRONTEND_URL', async () => {
    jest.spyOn(emailTrackingRepository, 'findEmailMessageByTokenForUpdate').mockResolvedValue(null);
    const result = await emailTrackingService.trackEmailClick({ token: 'sai', rawUrl: EVIL, label: null, linkKey: null });
    expect(result.redirectUrl).toBe(DEFAULT_REDIRECT);
  });

  it('lỗi DB trước khi xác minh được token → về FRONTEND_URL (không rò URL tuỳ ý)', async () => {
    jest.spyOn(emailTrackingRepository, 'findEmailMessageByTokenForUpdate').mockRejectedValue(new Error('db down'));
    const result = await emailTrackingService.trackEmailClick({ token: 'x', rawUrl: EVIL, label: null, linkKey: null });
    expect(result.redirectUrl).toBe(DEFAULT_REDIRECT);
  });

  it('token hợp lệ → giữ url đích (http/https)', async () => {
    jest.spyOn(emailTrackingRepository, 'findEmailMessageByTokenForUpdate').mockResolvedValue({
      id: 1, id_campaign: null, id_customer: null, id_run: null,
    });
    jest.spyOn(emailTrackingRepository, 'updateEmailMessageOnClick').mockResolvedValue();
    const result = await emailTrackingService.trackEmailClick({ token: 'ok', rawUrl: 'https://example.com/a', label: null, linkKey: null });
    expect(result.redirectUrl).toBe('https://example.com/a');
  });
});

describe('trackZaloClick — open redirect', () => {
  it('không có token → về FRONTEND_URL, không mở kết nối DB', async () => {
    const result = await zaloTrackingService.trackZaloClick({ token: '', redirectUrl: EVIL, linkKey: null });
    expect(result.redirectUrl).toBe(DEFAULT_REDIRECT);
    expect(db.getClient).not.toHaveBeenCalled();
  });

  it('token không tìm thấy → về FRONTEND_URL', async () => {
    jest.spyOn(zaloTrackingRepository, 'findZaloMessageByToken').mockResolvedValue(null);
    const result = await zaloTrackingService.trackZaloClick({ token: 'sai', redirectUrl: EVIL, linkKey: null });
    expect(result.redirectUrl).toBe(DEFAULT_REDIRECT);
  });

  it('lỗi DB khi tra token → về FRONTEND_URL', async () => {
    jest.spyOn(zaloTrackingRepository, 'findZaloMessageByToken').mockRejectedValue(new Error('db down'));
    const result = await zaloTrackingService.trackZaloClick({ token: 'x', redirectUrl: EVIL, linkKey: null });
    expect(result.redirectUrl).toBe(DEFAULT_REDIRECT);
  });

  it('token hợp lệ → giữ url đích', async () => {
    jest.spyOn(zaloTrackingRepository, 'findZaloMessageByToken').mockResolvedValue({
      id: 1, id_campaign: null, id_run: null, id_customer: null, group_id: null, channel: 'zalo_personal',
    });
    jest.spyOn(zaloTrackingRepository, 'incrementZaloMessageClickCount').mockResolvedValue(1);
    jest.spyOn(zaloTrackingRepository, 'getCampaignUserId').mockResolvedValue(null);
    const result = await zaloTrackingService.trackZaloClick({ token: 'ok', redirectUrl: 'https://example.com/b', linkKey: null });
    expect(result.redirectUrl).toBe('https://example.com/b');
  });
});

describe('trackEmailUnsubscribe — GET không đổi trạng thái', () => {
  it('confirm=false (GET) → trả trang có form POST, KHÔNG mở DB, KHÔNG huỷ', async () => {
    const unsubscribe = jest.spyOn(emailTrackingRepository, 'unsubscribeCustomerEmail').mockResolvedValue();
    const result = await emailTrackingService.trackEmailUnsubscribe({
      token: 'tok', privacyPolicyUrl: 'https://p.example', confirm: false,
    });
    expect(result.statusCode).toBe(200);
    expect(result.html).toContain('<form method="POST">');
    expect(db.getClient).not.toHaveBeenCalled();
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('confirm mặc định (không truyền) cũng là GET an toàn', async () => {
    const result = await emailTrackingService.trackEmailUnsubscribe({ token: 'tok', privacyPolicyUrl: 'https://p.example' });
    expect(result.html).toContain('<form method="POST">');
    expect(db.getClient).not.toHaveBeenCalled();
  });

  it('confirm=true (POST) → thực sự huỷ đăng ký', async () => {
    jest.spyOn(emailTrackingRepository, 'findEmailMessageByToken').mockResolvedValue({
      id: 5, id_campaign: 2, id_customer: 9, id_run: null,
    });
    jest.spyOn(emailTrackingRepository, 'setEmailMessageUnsubscribed').mockResolvedValue();
    const unsubscribe = jest.spyOn(emailTrackingRepository, 'unsubscribeCustomerEmail').mockResolvedValue();
    jest.spyOn(emailTrackingRepository, 'hasJourneyEmailUnsubscribed').mockResolvedValue(true);
    const result = await emailTrackingService.trackEmailUnsubscribe({
      token: 'tok', privacyPolicyUrl: 'https://p.example', confirm: true,
    });
    expect(result.statusCode).toBe(200);
    expect(unsubscribe).toHaveBeenCalledWith(fakeClient, 9);
  });

  it('thiếu token → 400 dù GET hay POST', async () => {
    const result = await emailTrackingService.trackEmailUnsubscribe({ token: '', privacyPolicyUrl: 'x', confirm: false });
    expect(result.statusCode).toBe(400);
  });
});
