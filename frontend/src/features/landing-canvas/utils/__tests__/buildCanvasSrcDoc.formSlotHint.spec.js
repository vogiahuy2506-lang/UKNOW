/**
 * PR-5b-2b mục 2 — `formSlotHint` chỉ ảnh hưởng `srcDoc` (iframe preview), không có cách nào để
 * gọi hàm này làm thay đổi HTML thật sẽ gửi lưu (`form.htmlContent` là biến RIÊNG, được caller
 * giữ nguyên — xem `CanvasPreviewArea.formSlotPreview.spec.jsx` cho ranh giới React).
 */
import { describe, it, expect } from 'vitest';
import { buildCanvasSrcDoc } from '../buildCanvasSrcDoc.js';

const SLOT_HTML =
  '<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head>' +
  '<body><section><div data-founderai-form-slot></div></section></body></html>';

describe('buildCanvasSrcDoc — formSlotHint (PR-5b-2b)', () => {
  it('html có chỗ trống + formSlotHint → srcDoc thay chỗ trống bằng chữ gợi ý, KHÔNG còn thuộc tính chỗ trống', () => {
    const srcDoc = buildCanvasSrcDoc({
      html: SLOT_HTML,
      title: 'Landing test',
      slug: 'slot-hint-test',
      formSlotHint: 'Biểu mẫu đăng ký sẽ hiện ở đây sau khi lưu',
    });
    expect(srcDoc).not.toContain('data-founderai-form-slot');
    expect(srcDoc).toContain('Biểu mẫu đăng ký sẽ hiện ở đây sau khi lưu');
  });

  it('html không có chỗ trống → formSlotHint không có tác dụng gì (không xuất hiện trong srcDoc)', () => {
    const html = '<!DOCTYPE html><html><body><section><p>Nội dung thường</p></section></body></html>';
    const srcDoc = buildCanvasSrcDoc({
      html,
      title: 'Landing test',
      slug: 'no-slot-test',
      formSlotHint: 'Không nên xuất hiện',
    });
    expect(srcDoc).not.toContain('Không nên xuất hiện');
  });

  it('đối tượng html đầu vào (giả lập form.htmlContent) không bị đổi qua lời gọi — bất biến, chỉ srcDoc trả về mới có gợi ý', () => {
    const htmlArg = SLOT_HTML;
    buildCanvasSrcDoc({ html: htmlArg, title: 't', slug: 's', formSlotHint: 'x' });
    // form.htmlContent (biến htmlArg, KHÔNG đọc lại từ srcDoc) phải còn nguyên chỗ trống — đây là
    // ranh giới "chỉ xem trước" của PR-5b-2b mục 2.
    expect(htmlArg).toBe(SLOT_HTML);
    expect(htmlArg).toContain('data-founderai-form-slot');
  });
});
