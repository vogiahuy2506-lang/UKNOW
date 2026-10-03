import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Ghim cách App.jsx tải trang: nạp App.jsx thật vào test là nạp cả trăm module nên đọc mã nguồn.
const appSource = fs.readFileSync(path.resolve(__dirname, 'App.jsx'), 'utf8');
const layoutSource = fs.readFileSync(path.resolve(__dirname, 'layouts/MainLayout.jsx'), 'utf8');

// Khung và màn đầu tiên phải giữ import tĩnh (xem PLAN_TACH_BUNDLE_FRONTEND mục 3).
const STATIC_PAGE_IMPORTS = new Set([
  'Login',
  'Register',
  'UnauthorizedScreen',
  'LandingHtmlModeGate',
  'PolicyArchivedVersionPage', // đã tự lazy bên trong, không lazy hai lớp
  'PostAuthGateModals',
]);

describe('App.jsx tải trang theo route', () => {
  it('trang/feature chỉ import tĩnh khi nằm trong danh sách giữ tĩnh', () => {
    const staticImports = [...appSource.matchAll(/^import (\w+) from '\.\/(?:pages|features)\/[^']+';$/gm)].map((m) => m[1]);
    const unexpected = staticImports.filter((n) => !STATIC_PAGE_IMPORTS.has(n));
    expect(unexpected).toEqual([]);
  });

  it('mọi trang lazy đi qua lazyWithRetry, không dùng lazy() trần', () => {
    const lazyLines = appSource.split('\n').filter((l) => /^const \w+ = lazy/.test(l));
    expect(lazyLines.length).toBeGreaterThan(80);
    expect(lazyLines.every((l) => l.includes('lazyWithRetry(() => import('))).toBe(true);
  });

  it('một Suspense bọc toàn bộ <Routes> với LoadingScreen', () => {
    const open = appSource.indexOf('<Suspense fallback={<LoadingScreen />}>\n          <Routes>');
    const routesEnd = appSource.indexOf('</Routes>');
    const close = appSource.indexOf('</Suspense>', routesEnd);
    expect(open).toBeGreaterThan(-1);
    expect(routesEnd).toBeGreaterThan(open);
    expect(close).toBeGreaterThan(routesEnd);
  });

  it('nhánh tên miền riêng (LpRendererByHost) có Suspense riêng vì nằm ngoài <Routes>', () => {
    expect(appSource).toMatch(/<Suspense fallback=\{<LoadingScreen \/>\}>\s*<LpRendererByHost \/>\s*<\/Suspense>/);
  });

  it('MainLayout bọc <Outlet /> trong Suspense để đổi trang không mất sidebar', () => {
    const wraps = layoutSource.match(/<Suspense fallback=\{<MainContentFallback \/>\}>\{children \?\? <Outlet \/>\}<\/Suspense>/g) || [];
    expect(wraps.length).toBe(2); // layout mobile + desktop
  });
});
