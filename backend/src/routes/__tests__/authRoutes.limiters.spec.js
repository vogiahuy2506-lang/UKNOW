/**
 * PLAN_SUA_SAU_NGHIEM_THU_2026-09-29 mục 1.F — kiểm đúng route gắn đúng limiter bằng cách đọc
 * router.stack của auth.routes.js (so sánh THAM CHIẾU hàm, vì express-rate-limit v8 trả về hàm vô
 * danh — .name rỗng, không dùng để nhận diện được).
 */
import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import authRoutes from '../auth.routes.js';
import {
  loginAccountLimiter,
  loginIpLimiter,
  authCredentialLimiter,
} from '../../middleware/rateLimiter.middleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function middlewaresFor(method, routePath) {
  const layer = authRoutes.stack.find((l) => l.route?.path === routePath && l.route.methods[method]);
  if (!layer) throw new Error(`route not found: ${method.toUpperCase()} ${routePath}`);
  return layer.route.stack.map((l) => l.handle);
}

describe('auth.routes.js — limiter đúng chỗ (PR-C)', () => {
  it('POST /login có loginAccountLimiter + loginIpLimiter', () => {
    const handles = middlewaresFor('post', '/login');
    expect(handles).toContain(loginAccountLimiter);
    expect(handles).toContain(loginIpLimiter);
    expect(handles).not.toContain(authCredentialLimiter);
  });

  it('POST /google-login có loginIpLimiter, KHÔNG có loginAccountLimiter (không có username để khoá theo tài khoản)', () => {
    const handles = middlewaresFor('post', '/google-login');
    expect(handles).toContain(loginIpLimiter);
    expect(handles).not.toContain(loginAccountLimiter);
  });

  it.each([
    ['/register', 'post'],
    ['/forgot-password', 'post'],
    ['/reset-password', 'post'],
    ['/activate', 'post'],
    ['/change-password', 'post'],
  ])('%s có authCredentialLimiter', (routePath, method) => {
    const handles = middlewaresFor(method, routePath);
    expect(handles).toContain(authCredentialLimiter);
  });

  it.each([
    ['/me', 'get'],
    ['/features', 'get'],
    ['/refresh-token', 'post'],
    ['/logout', 'post'],
    ['/invitation-info', 'get'],
  ])('%s KHÔNG có limiter nào trong 3 bộ mới (chỉ còn globalLimiter chung ở app.js)', (routePath, method) => {
    const handles = middlewaresFor(method, routePath);
    expect(handles).not.toContain(loginAccountLimiter);
    expect(handles).not.toContain(loginIpLimiter);
    expect(handles).not.toContain(authCredentialLimiter);
  });

  it('app.js không còn chuỗi "authLimiter" (đã bỏ gắn cho cả router /api/auth)', () => {
    const appJsPath = path.resolve(__dirname, '../../app.js');
    const content = fs.readFileSync(appJsPath, 'utf8');
    expect(content).not.toContain('authLimiter');
  });
});
