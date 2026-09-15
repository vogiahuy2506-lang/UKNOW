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
});
