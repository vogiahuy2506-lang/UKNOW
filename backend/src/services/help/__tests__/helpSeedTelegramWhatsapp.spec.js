/**
 * PLAN_WHATSAPP_DOT3, W7c — ghim nội dung 4 bài hướng dẫn liên quan Telegram/WhatsApp để không quay về
 * bản cũ (bản cũ nói "áp dụng y như các kênh khác", "chiến dịch chỉ có Email và Zalo", "hộp thư không có
 * WhatsApp/Telegram" — đều đã lệch code). body_html đã có test riêng (helpSeedQuality) đảm bảo khớp body_md.
 */
import { describe, it, expect } from '@jest/globals';
import { HELP_SEED_ARTICLES } from '../helpSeed.data.js';

const bySlug = (slug) => HELP_SEED_ARTICLES.find((a) => a.slug === slug);

describe('bài hướng dẫn Telegram/WhatsApp (W7c)', () => {
  it('chatbot-telegram-whatsapp: không còn câu cũ sai, có đủ mục mới', () => {
    const md = bySlug('chatbot-telegram-whatsapp').body_md;
    expect(md).not.toContain('y như các kênh khác');
    expect(md).not.toContain('vẫn chỉ có Email và Zalo');
    expect(md).toContain('Giới hạn lượt chatbot trả lời');
    expect(md).toContain('Kết nối kênh Chatbot');
    expect(md).toContain('Credit AI');
    expect(md).toContain('chỉ gửi được **văn bản**');
    expect(md).toContain('Cần đăng nhập lại');
    // Review W7c: W6 (chủ trả lời từ điện thoại → AI tạm dừng) ĐÃ lên main 54324797 → bài mô tả hành vi thật, không còn "khi được cập nhật".
    expect(md).toContain('Bạn tự trả lời trên điện thoại');
    expect(md).not.toContain('Khi được cập nhật');
    expect(md).toContain('[Tạo chiến dịch](campaign-create)');
  });

  it('channels: tab Kênh gồm Email/Facebook/Zalo/WhatsApp/Telegram, không còn "2 thẻ"', () => {
    const a = bySlug('channels');
    expect(a.body_md).toContain('**Email**, **Facebook**, **Zalo**, **WhatsApp** và **Telegram**');
    expect(a.body_md).not.toContain('chia làm 2 thẻ');
    expect(a.title).toContain('WhatsApp');
    expect(a.title).toContain('Telegram');
  });

  it('campaign-create: có mục "Gửi qua WhatsApp" song song mục Telegram với ba nguồn người nhận', () => {
    const md = bySlug('campaign-create').body_md;
    expect(md).toContain('# Gửi qua Telegram');
    expect(md).toContain('# Gửi qua WhatsApp');
    expect(md).toContain('Gửi tin nhắn WhatsApp');
    expect(md).toContain('Hội thoại WhatsApp của tài khoản');
    expect(md).toContain('Nhập số điện thoại');
    expect(md).toContain('Từ khối dữ liệu phía trước');
    expect(md).toContain('khi quản trị viên đã bật kênh');
  });

  it('inbox: WhatsApp có trong Hộp thư, Telegram chưa', () => {
    const md = bySlug('inbox').body_md;
    expect(md).toContain('Zalo cá nhân, WhatsApp');
    expect(md).toMatch(/Telegram\*\* thì chưa có ở đây/);
  });
});
