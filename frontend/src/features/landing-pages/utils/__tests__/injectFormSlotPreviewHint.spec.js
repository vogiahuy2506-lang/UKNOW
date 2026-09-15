import { describe, it, expect } from 'vitest';
import { injectFormSlotPreviewHint } from '../injectLandingEnhancements.js';

/**
 * PR-5b-2b mục 2 — CHỈ ở chế độ xem trước: thay chỗ trống `data-founderai-form-slot` bằng khung
 * chấm gợi ý. Test riêng ở `buildCanvasSrcDoc.spec.js` chứng minh `html` gốc (sẽ gửi lưu) không
 * bị hàm này chạm vào — ở đây chỉ kiểm hành vi thuần của hàm.
 */
describe('injectFormSlotPreviewHint (PR-5b-2b)', () => {
  it('thay chỗ trống bằng khung gợi ý chứa đúng chữ truyền vào', () => {
    const html = '<section><div data-founderai-form-slot></div></section>';
    const out = injectFormSlotPreviewHint(html, 'Biểu mẫu đăng ký sẽ hiện ở đây sau khi lưu');
    expect(out).not.toContain('data-founderai-form-slot');
    expect(out).toContain('Biểu mẫu đăng ký sẽ hiện ở đây sau khi lưu');
    expect(out).toContain('<section>');
  });

  it('không có chỗ trống nào → trả nguyên HTML, không đổi gì', () => {
    const html = '<section><p>Nội dung bình thường</p></section>';
    expect(injectFormSlotPreviewHint(html, 'x')).toBe(html);
  });

  it('chấp nhận chỗ trống có thêm thuộc tính khác (cùng dạng hợp lệ với backend)', () => {
    const html = '<div class="my-8" data-founderai-form-slot=""></div>';
    const out = injectFormSlotPreviewHint(html, 'gợi ý');
    expect(out).not.toContain('data-founderai-form-slot');
    expect(out).toContain('gợi ý');
  });

  it('không hintText → dùng chữ mặc định, không throw', () => {
    const html = '<div data-founderai-form-slot></div>';
    const out = injectFormSlotPreviewHint(html);
    expect(out).toContain('Biểu mẫu đăng ký sẽ hiện ở đây sau khi lưu');
  });

  it('thoát ký tự HTML trong hintText (phòng chuỗi i18n có ký tự đặc biệt)', () => {
    const html = '<div data-founderai-form-slot></div>';
    const out = injectFormSlotPreviewHint(html, '<script>x</script>');
    expect(out).not.toContain('<script>x</script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('nhiều chỗ trống → thay TẤT CẢ (dùng cho preview, không cần đúng-1 như lúc lưu)', () => {
    const html = '<div data-founderai-form-slot></div><div data-founderai-form-slot></div>';
    const out = injectFormSlotPreviewHint(html, 'x');
    expect(out).not.toContain('data-founderai-form-slot');
    expect((out.match(/border:2px dashed/g) || []).length).toBe(2);
  });

  // PR-5b-2c (đính chính 16/09) — chú thích HTML bên trong chỗ trống giờ coi như khoảng trắng,
  // phải khớp giống hệt backend (`landingHtmlInjection.util.js` FORM_SLOT_RE).
  it('chú thích HTML <!--…--> bên trong chỗ trống → vẫn được coi là hợp lệ, thay bằng khung gợi ý', () => {
    const html = '<div data-founderai-form-slot><!-- TODO --></div>';
    const out = injectFormSlotPreviewHint(html, 'gợi ý');
    expect(out).not.toContain('data-founderai-form-slot');
    expect(out).toContain('gợi ý');
  });
});

/**
 * PR-5b-2c — bảng ca DÙNG CHUNG với bản backend (`landingHtmlInjection.util.spec.js`
 * "PR-5b-2c — bảng ca dùng chung với frontend (parity)"). Hai regex PHẢI khớp CÙNG nhau — lệch
 * nghĩa là xem trước báo được nhưng lưu lại hỏng, hoặc ngược lại. Ở phía frontend không có khái
 * niệm "hỏng dạng" (không chặn lưu) — chỉ có "có thay được hay không": `validCount` từ bảng gốc
 * ánh xạ sang "được thay" (validCount >= 1) hoặc "giữ nguyên, không thay" (validCount === 0).
 */
describe('injectFormSlotPreviewHint — bảng ca dùng chung với backend (parity, PR-5b-2c)', () => {
  const SHARED_SLOT_CASES = [
    { name: 'div rỗng chuẩn', html: '<div data-founderai-form-slot></div>', validCount: 1 },
    { name: 'thêm class + =""', html: '<div class="my-8" data-founderai-form-slot=""></div>', validCount: 1 },
    { name: 'chú thích HTML bên trong', html: '<div data-founderai-form-slot><!-- x --></div>', validCount: 1 },
    {
      name: 'CSS chọn trong <style> + div hợp lệ',
      html: '<style>[data-founderai-form-slot]{min-height:1px}</style><div data-founderai-form-slot></div>',
      validCount: 1,
    },
    { name: 'thuộc tính viết HOA, rỗng', html: '<div DATA-FOUNDERAI-FORM-SLOT></div>', validCount: 1 },
    { name: 'thuộc tính viết HOA + nội dung con', html: '<div DATA-FOUNDERAI-FORM-SLOT><p>x</p></div>', validCount: 0 },
    { name: 'nội dung con thường', html: '<div data-founderai-form-slot><p>x</p></div>', validCount: 0 },
  ];

  it.each(SHARED_SLOT_CASES)('$name → validCount=$validCount', ({ html, validCount }) => {
    const out = injectFormSlotPreviewHint(html, 'gợi ý');
    // Không kiểm "not.toContain('data-founderai-form-slot')" chung cho mọi ca — ca CSS trong
    // <style> vẫn còn nhắc tên thuộc tính hợp lệ trong CSS selector sau khi thay (hàm này chỉ
    // thay đúng thẻ <div> khớp FORM_SLOT_RE, không đụng vào <style>). Chỉ so số khung gợi ý được
    // chèn — đúng ĐIỀU cả hai bên (frontend/backend) phải khớp nhau.
    expect((out.match(/border:2px dashed/g) || []).length).toBe(validCount);
    if (validCount === 0) {
      expect(out).toBe(html);
    }
  });
});
