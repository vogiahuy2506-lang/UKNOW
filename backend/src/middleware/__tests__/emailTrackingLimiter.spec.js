/**
 * PLAN_RA_SOAT_DOT3 PR-Q1 việc 4 — pixel mở thư / link bấm / link huỷ đăng ký dưới globalLimiter: proxy ảnh của Gmail
 * dùng chung IP cho nghìn hộp thư nên 429 làm mất lượt mở đã xảy ra thật. Ghim danh sách đường bị bỏ qua.
 */
import { describe, it, expect } from '@jest/globals';
import { isEmailTrackingPath, shouldSkipGlobalLimiter } from '../rateLimiter.middleware.js';

const TOKEN = '3f2b8c1e-9d4a-4e6f-8a7b-1c2d3e4f5a6b';
const get = (originalUrl) => ({ method: 'GET', originalUrl });

describe('shouldSkipGlobalLimiter — đường tracking email (PR-Q1 việc 4)', () => {
  it.each([
    ['pixel mở thư', `/api/customers/email-tracking/open/${TOKEN}`],
    ['link bấm (có query url/lk/label)', `/api/customers/email-tracking/click/${TOKEN}?url=https%3A%2F%2Fa.vn&lk=email-link-1`],
    ['link huỷ đăng ký', `/api/customers/email-tracking/unsubscribe/${TOKEN}`],
  ])('bỏ qua globalLimiter: %s', (_label, url) => {
    expect(isEmailTrackingPath(get(url))).toBe(true);
    expect(shouldSkipGlobalLimiter(get(url))).toBe(true);
  });

  it.each([
    ['route xác thực cùng router /api/customers', '/api/customers'],
    ['route xác thực /api/customers/123', '/api/customers/123'],
    ['loại tracking lạ trong email-tracking', `/api/customers/email-tracking/export/${TOKEN}`],
    ['thiếu token', '/api/customers/email-tracking/open/'],
    ['tracking Zalo (không phải proxy ảnh dùng chung IP)', `/api/customers/zalo-tracking/click/${TOKEN}`],
    ['đường không liên quan', '/api/auth/login'],
  ])('VẪN bị globalLimiter đếm: %s', (_label, url) => {
    expect(isEmailTrackingPath(get(url))).toBe(false);
    expect(shouldSkipGlobalLimiter(get(url))).toBe(false);
  });

  it('chỉ GET: POST tới cùng đường dẫn vẫn bị đếm', () => {
    const req = { method: 'POST', originalUrl: `/api/customers/email-tracking/unsubscribe/${TOKEN}` };
    expect(shouldSkipGlobalLimiter(req)).toBe(false);
  });

  it('không làm mất các đường đã bỏ qua từ trước (luồng inbox, poll chat công khai)', () => {
    expect(shouldSkipGlobalLimiter(get('/api/chatbot-public/custom-chatbot/abc123/messages?sessionId=s1'))).toBe(true);
  });
});
