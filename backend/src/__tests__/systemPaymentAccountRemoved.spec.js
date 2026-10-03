/**
 * H1 mục 1 (PLAN_SUA_AI_DOT3, D-02): route công khai /api/system/payment-account (+ /qr) đã gỡ.
 *
 * Route này chỉ phục vụ luồng VietQR trong khung chat tư vấn trang chủ (đã gỡ). Nó CORS allow-all, không cần đăng nhập và trả thông
 * tin tài khoản ngân hàng công ty cho bất kỳ ai gọi — không còn lý do tồn tại. Bảng `system_payment_accounts` (migration 230) được
 * GIỮ nguyên (không DROP), chỉ code dùng nó bị gỡ.
 *
 * Kiểm bằng cách đọc chồng middleware của Express (không phát request nên không chạm CSDL — mọi request thật đều đi qua dynamicCors
 * và domainResolver đọc DB, xem healthReadiness.spec.js). Phép đo "404 thật" nằm ở integration test systemPaymentAccountGone.test.js.
 */
import { describe, expect, it } from '@jest/globals';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pathOf = (rel) => fileURLToPath(new URL(rel, import.meta.url));

/** Mọi router con được mount có tiền tố khớp `urlPath` (layer `router` của Express 4). */
function routersMatching(app, urlPath) {
  return app._router.stack.filter((layer) => layer.name === 'router' && layer.regexp.test(urlPath));
}

describe('route /api/system/payment-account đã gỡ', () => {
  it('app không mount router nào cho /api/system/payment-account và /api/system/payment-account/qr', async () => {
    const { createApp } = await import('../app.js');
    const app = createApp();
    expect(routersMatching(app, '/api/system/payment-account').map((l) => String(l.regexp))).toEqual([]);
    expect(routersMatching(app, '/api/system/payment-account/qr').map((l) => String(l.regexp))).toEqual([]);
  }, 60000);

  it('phép đo có nhạy: router quản trị mount ở /api/admin/system vẫn được phát hiện (để biết bộ lọc không mù)', async () => {
    const { createApp } = await import('../app.js');
    const app = createApp();
    expect(routersMatching(app, '/api/admin/system/anything').length).toBeGreaterThan(0);
  }, 60000);

  it('tệp route và service không còn, app.js không còn import/mount', () => {
    expect(existsSync(pathOf('../routes/systemPaymentAccount.routes.js'))).toBe(false);
    expect(existsSync(pathOf('../services/systemPaymentAccount.service.js'))).toBe(false);
    const appSrc = readFileSync(pathOf('../app.js'), 'utf8');
    expect(appSrc).not.toMatch(/systemPaymentAccount/);
    expect(appSrc).not.toContain("'/api/system'");
  });
});
