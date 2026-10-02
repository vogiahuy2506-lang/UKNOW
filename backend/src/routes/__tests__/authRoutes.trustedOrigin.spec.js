/**
 * Route đọc cookie refresh token phải đi qua requireTrustedAppOrigin TRƯỚC mọi handler khác
 * (so sánh THAM CHIẾU hàm trong router.stack, cùng cách authRoutes.limiters.spec.js).
 */
import { describe, it, expect } from '@jest/globals';
import authRoutes from '../auth.routes.js';
import authMiddleware from '../../middleware/auth.middleware.js';
import { requireTrustedAppOrigin } from '../../middleware/dynamicCors.middleware.js';

function middlewaresFor(method, routePath) {
  const layer = authRoutes.stack.find((l) => l.route?.path === routePath && l.route.methods[method]);
  if (!layer) throw new Error(`route not found: ${method.toUpperCase()} ${routePath}`);
  return layer.route.stack.map((l) => l.handle);
}

describe('auth.routes.js — chốt origin cho route dùng cookie refresh token', () => {
  it('POST /refresh-token: requireTrustedAppOrigin đứng đầu', () => {
    const handles = middlewaresFor('post', '/refresh-token');
    expect(handles[0]).toBe(requireTrustedAppOrigin);
  });

  it('POST /logout: requireTrustedAppOrigin đứng đầu, trước authMiddleware', () => {
    const handles = middlewaresFor('post', '/logout');
    expect(handles[0]).toBe(requireTrustedAppOrigin);
    expect(handles.indexOf(authMiddleware)).toBeGreaterThan(0);
  });

  it.each([
    ['/login', 'post'],
    ['/register', 'post'],
    ['/google-login', 'post'],
    ['/me', 'get'],
  ])('%s không gắn chốt (không đọc cookie refresh token)', (routePath, method) => {
    expect(middlewaresFor(method, routePath)).not.toContain(requireTrustedAppOrigin);
  });
});
