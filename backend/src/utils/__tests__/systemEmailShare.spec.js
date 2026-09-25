/**
 * PR-1 + PR-2 + PR-3 share notification (2026-09-25).
 *
 * Unit test cho 3 builder email:
 *   buildLandingPageSharedEmail() — landing page share (PR-1)
 *   buildCampaignSharedEmail()    — campaign share (PR-2, có thêm canRun badge)
 *   buildChatbotSharedEmail()     — chatbot share (PR-3, clone cơ chế, có clonedNote)
 */
import { describe, it, expect } from '@jest/globals';
import {
  buildLandingPageSharedEmail,
  buildCampaignSharedEmail,
  buildChatbotSharedEmail,
} from '../systemEmailShare.util.js';

describe('buildLandingPageSharedEmail', () => {
  const baseArgs = {
    senderName: 'Nguyễn Văn A',
    landingPageTitle: 'Landing Page Demo',
    landingPageUrl: 'https://demo.founderai.biz',
    shareType: 'view',
    recipientName: 'Trần Thị B',
  };

  it('user đã có tài khoản → "đã chia sẻ" + "Mở landing page"', () => {
    const { subject, html } = buildLandingPageSharedEmail({
      ...baseArgs,
      isExistingUser: true,
    });
    expect(subject).toContain('đã chia sẻ');
    expect(subject).not.toContain('muốn chia sẻ');
    expect(html).toContain('Mở landing page');
    expect(html).not.toContain('Đăng ký để xem');
    expect(html).toContain(baseArgs.recipientName);
    expect(html).toContain(baseArgs.senderName);
    expect(html).toContain(baseArgs.landingPageTitle);
    expect(html).toContain(baseArgs.landingPageUrl);
  });

  it('user CHƯA có tài khoản → "muốn chia sẻ" + "Đăng ký để xem"', () => {
    const { subject, html } = buildLandingPageSharedEmail({
      ...baseArgs,
      isExistingUser: false,
    });
    expect(subject).toContain('muốn chia sẻ');
    expect(html).toContain('Đăng ký để xem');
    expect(html).not.toContain('Mở landing page');
  });

  it('escape HTML trong tên người gửi / tên page (chống XSS)', () => {
    const xss = '<script>alert("xss")</script>';
    const { html } = buildLandingPageSharedEmail({
      senderName: `Sender ${xss}`,
      landingPageTitle: `Page ${xss}`,
      landingPageUrl: 'https://demo.founderai.biz',
      shareType: 'view',
      isExistingUser: true,
    });
    // Thẻ script gốc phải được escape — không còn dạng HTML executable.
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
    // Ký tự đặc biệt khác cũng phải escape.
    expect(html).toContain('&quot;xss&quot;');
  });

  it('share_type=edit → dùng từ "chỉnh sửa"', () => {
    const { subject, html } = buildLandingPageSharedEmail({
      ...baseArgs,
      shareType: 'edit',
      isExistingUser: true,
    });
    expect(html).toContain('chỉnh sửa');
    // 'view' thì dùng 'xem'
    const viewVariant = buildLandingPageSharedEmail({
      ...baseArgs,
      shareType: 'view',
      isExistingUser: true,
    });
    expect(viewVariant.html).toContain('xem');
    expect(viewVariant.html).not.toContain('chỉnh sửa');
  });

  it('thiếu recipientName → vẫn render OK, không crash', () => {
    const { html } = buildLandingPageSharedEmail({
      senderName: 'Sender',
      landingPageTitle: 'Page',
      landingPageUrl: 'https://demo.founderai.biz',
      shareType: 'view',
      isExistingUser: true,
      // recipientName bỏ qua cố ý
    });
    expect(html).toContain('Xin chào,');
  });

  it('thiếu landingPageUrl → vẫn render, không có preview card', () => {
    const { html } = buildLandingPageSharedEmail({
      senderName: 'Sender',
      landingPageTitle: 'Page',
      shareType: 'view',
      isExistingUser: true,
    });
    // Không có Landing Page Preview Card
    expect(html).not.toContain('Landing page</p>');
    // Vẫn có CTA
    expect(html).toContain('Mở landing page');
  });
});

describe('buildCampaignSharedEmail (PR-2)', () => {
  const baseArgs = {
    senderName: 'Nguyễn Văn A',
    campaignName: 'Chiến dịch Black Friday',
    shareType: 'view',
    recipientName: 'Trần Thị B',
  };

  it('user đã có tài khoản → "đã chia sẻ" + "Mở chiến dịch"', () => {
    const { subject, html } = buildCampaignSharedEmail({
      ...baseArgs,
      isExistingUser: true,
    });
    expect(subject).toContain('đã chia sẻ');
    expect(subject).not.toContain('muốn chia sẻ');
    expect(html).toContain('Mở chiến dịch');
    expect(html).toContain(baseArgs.campaignName);
    // canRun mặc định false → không hiển thị badge
    expect(html).not.toContain('Có thể chạy');
  });

  it('user CHƯA có tài khoản → "muốn chia sẻ" + "Đăng ký để xem"', () => {
    const { subject, html } = buildCampaignSharedEmail({
      ...baseArgs,
      isExistingUser: false,
    });
    expect(subject).toContain('muốn chia sẻ');
    expect(html).toContain('Đăng ký để xem');
    expect(html).not.toContain('Mở chiến dịch');
  });

  it('canRun=true → render badge "Có thể chạy"', () => {
    const { html } = buildCampaignSharedEmail({
      ...baseArgs,
      isExistingUser: true,
      canRun: true,
    });
    expect(html).toContain('Có thể chạy');
    expect(html).toContain('chạy chiến dịch');
  });

  it('escape HTML trong tên người gửi / tên campaign (chống XSS)', () => {
    const xss = '<script>alert("xss")</script>';
    const { html } = buildCampaignSharedEmail({
      senderName: `Sender ${xss}`,
      campaignName: `Campaign ${xss}`,
      shareType: 'view',
      isExistingUser: true,
    });
    // Thẻ script gốc phải được escape — không còn dạng HTML executable.
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;xss&quot;');
  });
});


describe('buildChatbotSharedEmail (PR-3)', () => {
  const baseArgs = {
    senderName: 'Nguyễn Văn A',
    chatbotName: 'Bot Tư Vấn Khóa Học',
    recipientName: 'Trần Thị B',
  };

  it('user đã có tài khoản → "đã chia sẻ" + "Mở chatbot"', () => {
    const { subject, html } = buildChatbotSharedEmail({
      ...baseArgs,
      isExistingUser: true,
      clonedChatbotName: 'Bot Tư Vấn Khóa Học (Copy)',
    });
    expect(subject).toContain('đã chia sẻ');
    expect(subject).not.toContain('muốn chia sẻ');
    expect(html).toContain('Mở chatbot');
    expect(html).toContain(baseArgs.chatbotName);
    expect(html).toContain('Bot Tư Vấn Khóa Học (Copy)');
    expect(html).toContain('Bản sao');
  });

  it('user CHƯA có tài khoản → "muốn chia sẻ" + "Đăng ký để nhận"', () => {
    const { subject, html } = buildChatbotSharedEmail({
      ...baseArgs,
      isExistingUser: false,
    });
    expect(subject).toContain('muốn chia sẻ');
    expect(html).toContain('Đăng ký để nhận');
    expect(html).not.toContain('Mở chatbot');
  });

  it('thiếu recipientName → vẫn render OK', () => {
    const { html } = buildChatbotSharedEmail({
      senderName: 'Sender',
      chatbotName: 'Bot',
      isExistingUser: true,
    });
    expect(html).toContain('Xin chào,');
    expect(html).toContain('Mở chatbot');
  });

  it('escape HTML trong tên người gửi / tên chatbot (chống XSS)', () => {
    const xss = '<script>alert("xss")</script>';
    const { html } = buildChatbotSharedEmail({
      senderName: `Sender ${xss}`,
      chatbotName: `Bot ${xss}`,
      isExistingUser: true,
    });
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;xss&quot;');
  });
});
