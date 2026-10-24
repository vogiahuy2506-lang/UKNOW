import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { userMenuItems } from './components/layout/admin/navConfig';

// PLAN_MOT_NUT_GUI (23/10/2026) — Gửi nhanh bỏ hẳn: mọi lần gửi đi qua chiến dịch. Kiểm tĩnh mã App.jsx (App quá nặng để render
// cả cây trong vitest), như App.campaignTabs.spec.js.
const appSource = fs.readFileSync(path.resolve(__dirname, 'App.jsx'), 'utf8');
const t = (key) => key;

describe('Gửi nhanh đã bỏ — chỉ còn một lối gửi qua chiến dịch', () => {
  it('menu khách không còn mục Gửi nhanh (key quick_send, path /app/quick-send)', () => {
    const items = userMenuItems(t);
    expect(items.some((item) => item.key === 'quick_send')).toBe(false);
    expect(items.some((item) => item.path === '/app/quick-send')).toBe(false);
  });

  it('/app/quick-send (link/đánh dấu cũ) chuyển về /app/campaigns/simple, KHÔNG còn trang QuickSend', () => {
    expect(appSource).toMatch(/<Route path="quick-send" element=\{<Navigate to="\/app\/campaigns\/simple" replace \/>\} \/>/);
    expect(appSource).not.toMatch(/pages\/campaigns\/QuickSend/);
    expect(appSource).not.toMatch(/<QuickSend\b/);
  });

  it('/app/campaigns/simple là trang thật cho người có quyền tạo chiến dịch (đích của link cũ)', () => {
    expect(appSource).toMatch(/<Route path="campaigns\/simple" element=\{<PermissionRoute permission="campaigns_create"><SimpleCampaign \/><\/PermissionRoute>\} \/>/);
  });
});
