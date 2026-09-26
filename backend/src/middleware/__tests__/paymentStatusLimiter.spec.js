import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from '@jest/globals';
import {
  paymentStatusLimiter,
  PAYMENT_STATUS_WINDOW_MS,
  PAYMENT_STATUS_MAX,
  PAYMENT_STATUS_POLL_INTERVAL_SECONDS,
} from '../rateLimiter.middleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROUTES_PATH = path.resolve(__dirname, '../../routes/payment.routes.js');

// PR-7 (PLAN_VA_LOI_LUONG_TIEN_2026-09-26) — /payments/status/:orderCode cần limiter RIÊNG, đủ
// rộng cho nhịp hỏi 3 giây của CheckoutPage suốt thời hạn một mã QR PayOS. Rate limiter thật (đếm
// request) bị `skip: skipInTest` tắt hẳn trong môi trường test (NODE_ENV=test) nên không thể kiểm
// bằng cách bắn N request thật — kiểm ĐÚNG phép tính (Việc a) và ĐÚNG middleware được gắn vào route
// (đọc mã nguồn, giống cronJobRegistry.spec.js "Case 6" đã dùng trong repo) thay vào đó.
describe('paymentStatusLimiter — PR-7', () => {
  it('phép tính: max = ceil(thời hạn QR giây / nhịp hỏi giây)', () => {
    expect(PAYMENT_STATUS_POLL_INTERVAL_SECONDS).toBe(3);
    expect(PAYMENT_STATUS_MAX).toBe(
      Math.ceil((PAYMENT_STATUS_WINDOW_MS / 1000) / PAYMENT_STATUS_POLL_INTERVAL_SECONDS)
    );
  });

  it('với PAYOS_PENDING_WINDOW_MINUTES mặc định (15 phút): windowMs=900000, max=300', () => {
    // Chỉ đúng khi không có ai đặt PAYOS_PENDING_WINDOW_MINUTES khác trong môi trường test.
    if (process.env.PAYOS_PENDING_WINDOW_MINUTES) {
      return;
    }
    expect(PAYMENT_STATUS_WINDOW_MS).toBe(900000);
    expect(PAYMENT_STATUS_MAX).toBe(300);
  });

  it('rộng hơn hẳn publicLeadLimiter cũ (25 lần/15 phút) — không còn dùng chung bucket đó', () => {
    expect(PAYMENT_STATUS_MAX).toBeGreaterThan(25);
  });

  it('paymentStatusLimiter là một middleware Express (function 3 tham số)', () => {
    expect(typeof paymentStatusLimiter).toBe('function');
    expect(paymentStatusLimiter.length).toBe(3);
  });

  it('route GET /status/:orderCode phải gắn paymentStatusLimiter, không phải publicLeadLimiter', () => {
    const source = fs.readFileSync(ROUTES_PATH, 'utf8');
    const statusRouteLine = source
      .split('\n')
      .find((line) => line.includes("router.get('/status/:orderCode'"));
    expect(statusRouteLine).toBeDefined();
    expect(statusRouteLine).toContain('paymentStatusLimiter');
    expect(statusRouteLine).not.toContain('publicLeadLimiter');
  });
});
