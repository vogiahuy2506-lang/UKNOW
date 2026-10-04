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
    // P5: Hộp thư gửi được đính kèm cho WhatsApp/Telegram — không còn câu "chỉ gửi được văn bản".
    expect(md).not.toContain('chỉ gửi được **văn bản**');
    expect(md).toContain('gửi được cả **ảnh và tệp đính kèm**');
    expect(md).not.toContain('**Telegram** thì chưa có trong Hộp thư');
    expect(md).not.toContain('Lịch sử trò chuyện');
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

  it('inbox: WhatsApp và Telegram đều có trong Hộp thư, trả lời tay gửi được đính kèm', () => {
    const a = bySlug('inbox');
    expect(a.body_md).toContain('Zalo cá nhân, WhatsApp, Telegram');
    expect(a.body_md).not.toMatch(/Telegram\*\* thì chưa có ở đây/);
    expect(a.body_md).toContain('**văn bản, ảnh và tệp đính kèm**');
    expect(a.body_md).not.toContain('Hộp thư WhatsApp chưa gửi được tệp đính kèm');
    expect(a.summary).toContain('Telegram');
  });

  it('quick-send: Telegram/WhatsApp có trong Gửi nhanh, không còn câu "Telegram chưa có"', () => {
    const md = bySlug('quick-send').body_md;
    expect(md).not.toContain('Telegram chưa có trong Gửi nhanh');
    expect(md).toContain('**Telegram** và **WhatsApp** cũng có trong Gửi nhanh');
    expect(md).toContain('Giới hạn gửi/ngày');
  });

  it('campaign-create: trợ lý AI dựng hộ Telegram/WhatsApp + giới hạn/ngày, tốc độ, mẫu tin, đính kèm', () => {
    const md = bySlug('campaign-create').body_md;
    expect(md).not.toContain('chưa dựng hộ');
    expect(md).toContain('Trợ lý AI dựng hộ được');
    expect(md).toContain('một tin, gửi ngay');
    expect(md).toContain('Giới hạn & tốc độ gửi chiến dịch');
    // 03/10/2026 (PR-T): ô đổi nhãn "…(dùng chung với Zalo)" → "…(dùng chung Zalo, Telegram, WhatsApp)".
    expect(md).toContain('Mẫu tin nhắn (dùng chung Zalo, Telegram, WhatsApp)');
    expect(md).toContain('00:00 ngày mai');
    expect(md).toContain('5 ảnh, 3 tài liệu, tổng 20 MB');
  });

  it('channels, mau-tin-nhan, doi-goi: nhắc slot/khoá vượt gói và mẫu tin nhắn dùng chung Zalo/Telegram/WhatsApp', () => {
    expect(bySlug('channels').body_md).toContain('Bị khoá (vượt gói)');
    expect(bySlug('channels').body_md).toContain('Mua thêm slot');
    // 03/10/2026 (PR-T/PR-H): tab thứ hai của thư viện là "Tin nhắn" — kho chung 3 kênh, không còn gọi là "mẫu Zalo".
    expect(bySlug('mau-tin-nhan').body_md).toContain('dùng chung cho Zalo, Telegram và WhatsApp');
    expect(bySlug('mau-tin-nhan').body_md).toContain('**Email** và **Tin nhắn**');
    expect(bySlug('doi-goi').body_md).toContain('tài khoản Zalo/Email/Telegram/WhatsApp');
  });
});
