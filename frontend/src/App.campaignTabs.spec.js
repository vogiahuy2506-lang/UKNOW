import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CAMPAIGN_DETAIL_PATH } from './components/layout/admin/campaignDetailPath';

// Ghim route và link của chi tiết chiến dịch hai tab Thiết lập | Sơ đồ khối (PLAN_THIET_LAP_VA_SO_DO_2026-10-17). Nạp App.jsx thật
// vào test là nạp cả trăm module nên đọc mã nguồn, như App.lazyRoutes.spec.js.
const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');
const appSource = read('App.jsx');

describe('App.jsx — chi tiết chiến dịch có hai tab Thiết lập | Sơ đồ khối', () => {
  it('/app/campaigns/:id mở thẳng trình dựng (CampaignBuilder) cần quyền xem — KHÔNG chuyển sang /simple hay /builder', () => {
    expect(appSource).toMatch(/<Route path="campaigns\/:id" element=\{<PermissionRoute permission="campaigns_view"><CampaignBuilder \/><\/PermissionRoute>\} \/>/);
    expect(appSource).not.toMatch(/<Route path="campaigns\/:id" element=\{<Navigate/);
  });

  it('/app/campaigns/:id/simple (link cũ) chuyển về /app/campaigns/:id (replace); App không còn nạp CampaignSimpleEdit', () => {
    expect(appSource).toMatch(/path="campaigns\/:id\/simple" element=\{<CampaignSimpleRedirect \/>\}/);
    expect(appSource).toMatch(/const CampaignSimpleRedirect = \(\) => \{\s+const \{ id \} = useParams\(\);\s+return <Navigate to=\{`\/app\/campaigns\/\$\{id\}`\} replace \/>;/);
    expect(appSource).not.toMatch(/CampaignSimpleEdit/);
  });

  it('/app/campaigns/:id/builder (link cũ, AI) giữ nguyên: cùng trang, cần quyền tạo', () => {
    expect(appSource).toMatch(/path="campaigns\/:id\/builder" element=\{<PermissionRoute permission="campaigns_create"><CampaignBuilder \/><\/PermissionRoute>\}/);
  });

  it('danh sách chiến dịch: bấm tên và nút Sửa mở /app/campaigns/:id (tab Thiết lập); chỉ chỗ cố ý mở sơ đồ mới thêm ?tab=flow', () => {
    const list = read('pages/campaigns/Campaigns.jsx');
    expect(list).toMatch(/to=\{`\/app\/campaigns\/\$\{campaign\.id\}`\}/);
    expect(list).toMatch(/navigate\(`\/app\/campaigns\/\$\{campaign\.id\}`\)/);
    expect(list).not.toMatch(/campaigns\/\$\{campaign\.id\}\/builder/);
    // Tạo chiến dịch TRỐNG bằng "Thủ công": cố ý vào sơ đồ khối.
    expect(list).toMatch(/navigate\(`\/app\/campaigns\/\$\{createdCampaignId\}\?tab=flow`\)/);
  });

  it('màn kết quả tạo mới có nút "Xem chiến dịch" trỏ /app/campaigns/:id, không còn trỏ /builder', () => {
    const screens = read('features/campaigns/simple/ResultScreens.jsx');
    expect(screens).toMatch(/to=\{`\/app\/campaigns\/\$\{result\.campaignId\}`\}/);
    expect(screens).not.toMatch(/\/builder/);
  });

  it('trợ lý AI mở chiến dịch vừa tạo ở /app/campaigns/:id (không /builder); chiến dịch MỚI vẫn vào /new/builder', () => {
    const ai = read('features/ai/AiChatbot.jsx');
    expect(ai).not.toMatch(/campaigns\/\$\{res\.campaignId\}\/builder/);
    expect(ai.match(/navigate\(`\/app\/campaigns\/\$\{res\.campaignId\}`\)/g)).toHaveLength(2);
    expect(ai).toMatch(/navigate\(`\/app\/campaigns\/\$\{msg\.data\.campaignId\}`\)/);
  });

  it('trình dựng lưu lần đầu chuyển sang /app/campaigns/:id?tab=…; nhân bản mở /app/campaigns/:id', () => {
    const builder = read('pages/campaigns/CampaignBuilder.jsx');
    expect(builder).toMatch(/navigate\(`\/app\/campaigns\/\$\{savedCampaignId\}\?tab=\$\{activeTab\}`, \{ replace: true \}\)/);
    expect(builder).toMatch(/navigate\(`\/app\/campaigns\/\$\{targetId\}`\)/);
    expect(builder).not.toMatch(/CampaignTabSwitchModal/);
  });
});

describe('Sidebar — CAMPAIGN_DETAIL_PATH tô sáng mục Chiến dịch', () => {
  it.each([
    ['/app/campaigns/391', true],
    ['/app/campaigns/391/', true],
    ['/app/campaigns/391/builder', true],
    ['/app/campaigns/391/simple', true],
    ['/app/campaigns/new/builder', true],
    ['/app/campaigns/simple', false],
    ['/app/campaigns/new', false],
    ['/app/campaigns', false],
    ['/app/campaigns/391abc', false],
    ['/app/campaigns/simple/extra', false],
  ])('%s → %s', (pathname, expected) => {
    expect(CAMPAIGN_DETAIL_PATH.test(pathname)).toBe(expected);
  });
});
