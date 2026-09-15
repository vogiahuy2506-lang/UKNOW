/**
 * Mọi mục trong menu (Sidebar) phải có route thật trong App.jsx.
 *
 * 07/09/2026 commit "fix(lint)" (1a992e76) xoá hai route `/app/affiliate` và `/admin/affiliate`
 * cùng import của chúng, nhưng giữ nguyên mục menu. Bấm "Chương trình đối tác" rơi vào route
 * không khớp và bị đẩy về `/app` suốt 8 ngày, không test nào đỏ — trang vẫn tồn tại, vẫn có
 * người sửa tiếp (50c05cd2), chỉ là không còn đường vào. Phát hiện 15/09 khi Nhật Minh bấm thử.
 *
 * Kiểm tĩnh trên mã nguồn App.jsx (App quá nặng để render cả cây trong vitest): với đường dẫn
 * `/app/a/b` chấp nhận `path="a/b"`, hoặc route lồng `path="a"` + `path="b"`.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { superAdminMenuItems, userMenuItems } from './navConfig';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_SOURCE = fs.readFileSync(path.resolve(__dirname, '../../../App.jsx'), 'utf8');

const routePathsIn = (source) => new Set([...source.matchAll(/path="([^"]+)"/g)].map((m) => m[1]));

// Tách theo khu: `path="affiliate"` có ở cả /app lẫn /admin — gộp chung một tập thì xoá một
// trong hai sẽ không bị bắt. Khu /app nằm trước khu /admin trong App.jsx.
const APP_START = APP_SOURCE.indexOf('path="/app"');
const ADMIN_START = APP_SOURCE.indexOf('path="/admin"');
const SECTIONS = {
  '/app/': routePathsIn(APP_SOURCE.slice(APP_START, ADMIN_START)),
  '/admin/': routePathsIn(APP_SOURCE.slice(ADMIN_START)),
};
const ALL_ROUTE_PATHS = routePathsIn(APP_SOURCE);

const t = (key) => key;

function hasRoute(menuPath) {
  const clean = menuPath.split('?')[0];
  if (ALL_ROUTE_PATHS.has(clean)) return true;
  const prefix = Object.keys(SECTIONS).find((p) => clean.startsWith(p));
  if (!prefix) return clean === '/app' || clean === '/admin';
  const sectionPaths = SECTIONS[prefix];
  const rel = clean.slice(prefix.length);
  if (sectionPaths.has(rel)) return true;
  const segments = rel.split('/');
  return segments.length > 1 && segments.every((segment) => sectionPaths.has(segment));
}

it('App.jsx có đủ hai khu /app rồi /admin (điều kiện để tách route theo khu)', () => {
  expect(APP_START).toBeGreaterThan(-1);
  expect(ADMIN_START).toBeGreaterThan(APP_START);
});

describe('menu ↔ route trong App.jsx', () => {
  it.each([
    ['người dùng', userMenuItems(t)],
    ['super admin', superAdminMenuItems(t)],
  ])('mọi mục menu %s đều có route', (_label, items) => {
    const missing = items
      .filter((item) => typeof item.path === 'string')
      .filter((item) => !hasRoute(item.path))
      .map((item) => `${item.key} → ${item.path}`);

    expect(missing).toEqual([]);
  });
});
