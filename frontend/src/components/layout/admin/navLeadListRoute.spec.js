/**
 * Màn "Khách để lại thông tin" (`/app/landing-leads`) gộp 2 tab — "Từ landing page" cần quyền `leads`, "Từ biểu
 * mẫu" cần quyền `forms`. Nên CẢ cổng route lẫn mục menu phải cho vào bằng MỘT TRONG HAI quyền; nếu một trong
 * hai chỉ còn `leads`, nhân viên chỉ được cấp `forms` hoặc không thấy menu, hoặc bấm vào là bị chặn.
 *
 * Kiểm tĩnh trên mã nguồn App.jsx (cùng cách `navRoutes.spec.jsx` — App quá nặng để render cả cây).
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { userMenuItems } from './navConfig';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_SOURCE = fs.readFileSync(path.resolve(__dirname, '../../../App.jsx'), 'utf8');

const t = (key) => key;

function routePermissions(routePath) {
  const line = APP_SOURCE.split('\n').find((l) => l.includes(`<Route path="${routePath}"`));
  if (!line) return null;
  const match = line.match(/<PermissionRoute permission=\{(\[[^\]]*\])\}/);
  if (match) return JSON.parse(match[1].replace(/'/g, '"'));
  const single = line.match(/<PermissionRoute permission="([^"]+)"/);
  return single ? [single[1]] : null;
}

describe('/app/landing-leads: cổng route và mục menu cùng cho vào bằng leads HOẶC forms', () => {
  it('route', () => {
    expect(routePermissions('landing-leads')?.slice().sort()).toEqual(['forms', 'leads']);
  });

  it('mục menu lead_list', () => {
    const item = userMenuItems(t).find((i) => i.key === 'lead_list');
    expect(item.path).toBe('/app/landing-leads');
    expect(item.permission.slice().sort()).toEqual(['forms', 'leads']);
  });
});
