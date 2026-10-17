import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Ghim route và link của chi tiết chiến dịch hai tab (PLAN_HAI_TAB_TUNG_BUOC_SO_DO_2026-10-17). Nạp App.jsx thật vào test là nạp
// cả trăm module nên đọc mã nguồn, như App.lazyRoutes.spec.js.
const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');
const appSource = read('App.jsx');

describe('App.jsx — chi tiết chiến dịch có hai tab', () => {
  it('/app/campaigns/:id chuyển về tab Từng bước (simple), KHÔNG về trình dựng', () => {
    expect(appSource).toMatch(/<Route path="campaigns\/:id" element=\{<Navigate to="simple" replace \/>\} \/>/);
    expect(appSource).not.toMatch(/<Route path="campaigns\/:id" element=\{<Navigate to="builder"/);
  });

  it('/app/campaigns/:id/simple là trang sửa (lazy), cần quyền xem chiến dịch; /builder giữ nguyên cần quyền tạo', () => {
    expect(appSource).toMatch(/const CampaignSimpleEdit = lazyWithRetry\(\(\) => import\('\.\/pages\/campaigns\/CampaignSimpleEdit'\)\);/);
    expect(appSource).toMatch(/path="campaigns\/:id\/simple" element=\{<PermissionRoute permission="campaigns_view"><CampaignSimpleEdit \/><\/PermissionRoute>\}/);
    expect(appSource).toMatch(/path="campaigns\/:id\/builder" element=\{<PermissionRoute permission="campaigns_create"><CampaignBuilder \/><\/PermissionRoute>\}/);
  });

  it('danh sách chiến dịch: bấm tên và nút Sửa mở /app/campaigns/:id (vào Từng bước); chỉ chỗ cố ý mở trình dựng mới giữ /builder', () => {
    const list = read('pages/campaigns/Campaigns.jsx');
    expect(list).toMatch(/to=\{`\/app\/campaigns\/\$\{campaign\.id\}`\}/);
    expect(list).toMatch(/navigate\(`\/app\/campaigns\/\$\{campaign\.id\}`\)/);
    expect(list).not.toMatch(/campaigns\/\$\{campaign\.id\}\/builder/);
    // Tạo chiến dịch TRỐNG bằng trình dựng: cố ý vào sơ đồ khối.
    expect(list).toMatch(/navigate\(`\/app\/campaigns\/\$\{createdCampaignId\}\/builder`\)/);
  });

  it('màn kết quả tạo mới có nút "Xem chiến dịch" trỏ /app/campaigns/:id, không còn trỏ /builder', () => {
    const screens = read('features/campaigns/simple/ResultScreens.jsx');
    expect(screens).toMatch(/to=\{`\/app\/campaigns\/\$\{result\.campaignId\}`\}/);
    expect(screens).not.toMatch(/\/builder/);
  });
});
