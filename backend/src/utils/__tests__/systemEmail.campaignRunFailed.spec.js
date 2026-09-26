/**
 * PLAN_ON_DINH_GUI_CHIEN_DICH_2026-09-26, PR-3 — email báo chủ khi lượt chạy hỏng. Tên chiến dịch do
 * nhân viên đặt, còn `reason` ở nhánh mặc định mang nguyên message lỗi gốc → phải escape khi vào
 * HTML, nếu không một tên chiến dịch chứa thẻ <a> sẽ thành đường link thật trong thư hệ thống.
 */
import { describe, expect, it } from '@jest/globals';
import { buildCampaignRunFailedEmail } from '../systemEmail.util.js';

const BASE = {
  fullName: 'Chủ Shop',
  campaignName: 'Nhắc lịch hội thảo',
  reason: 'Tài khoản Zalo dùng để gửi chưa sẵn sàng (có thể đang mất kết nối).',
  actionHint: 'Vào Cài đặt Zalo, kết nối lại tài khoản rồi chạy lại chiến dịch.',
  appUrl: 'https://founderai.biz/app/campaigns',
};

describe('buildCampaignRunFailedEmail', () => {
  it('subject + thân thư nói đúng chiến dịch, lý do, việc cần làm, link', () => {
    const { subject, html } = buildCampaignRunFailedEmail(BASE);

    expect(subject).toBe('[Founder AI] Chiến dịch «Nhắc lịch hội thảo» gặp lỗi, lượt chạy đã dừng');
    expect(html).toContain('Chủ Shop');
    expect(html).toContain('«Nhắc lịch hội thảo»');
    expect(html).toContain(BASE.reason);
    expect(html).toContain(BASE.actionHint);
    expect(html).toContain(`href="${BASE.appUrl}"`);
  });

  it('escape tên chiến dịch, tên chủ và lý do trong HTML (không thành thẻ thật)', () => {
    const { html, subject } = buildCampaignRunFailedEmail({
      ...BASE,
      fullName: '<b>A</b>',
      campaignName: 'Ưu đãi <a href="https://x.example">bấm</a>',
      reason: 'Lỗi hệ thống khi chạy chiến dịch (value < 0 & "x").',
    });

    expect(html).not.toContain('<a href="https://x.example">');
    expect(html).toContain('Ưu đãi &lt;a href=&quot;https://x.example&quot;&gt;bấm&lt;/a&gt;');
    expect(html).not.toContain('<b>A</b>');
    expect(html).toContain('&lt;b&gt;A&lt;/b&gt;');
    expect(html).toContain('value &lt; 0 &amp; &quot;x&quot;');
    // Subject là text thuần — không escape, nếu không khách đọc thấy "&lt;".
    expect(subject).toContain('Ưu đãi <a href="https://x.example">bấm</a>');
  });
});
