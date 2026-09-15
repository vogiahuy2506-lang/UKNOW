/**
 * PR-5b-2b mục 2 — xem trước chỗ trống Biểu mẫu (`<div data-founderai-form-slot></div>`) chỉ ở
 * chế độ xem trước (srcDoc của iframe), KHÔNG được đổi `form.htmlContent` (thứ sẽ gửi lưu —
 * `landingPageAdmin.service.js` cần NGUYÊN VĂN chỗ trống để tự thay bằng khối nhúng thật, xem
 * `landingHtmlInjection.util.js` FORM_SLOT_RE). Test này khoá đúng ranh giới đó: mount
 * `CanvasPreviewArea` với html có chỗ trống, `setForm` KHÔNG được gọi tự động — chỗ trống chỉ
 * biến mất trong srcDoc của iframe (kiểm ở `buildCanvasSrcDoc.spec.js`), không rò ngược vào form
 * state theo bất kỳ đường nào.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import CanvasPreviewArea from '../CanvasPreviewArea.jsx';

vi.mock('../../../../i18n', () => ({
  useI18n: (namespace = null) => {
    const t = (key) => (namespace ? `${namespace}.${key}` : key);
    if (namespace) return t;
    return { t, locale: 'vi' };
  },
}));

const SLOT_HTML =
  '<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head>' +
  '<body><section><div data-founderai-form-slot></div></section></body></html>';

describe('CanvasPreviewArea — PR-5b-2b xem trước chỗ trống không rò vào form state', () => {
  it('mount với htmlContent có chỗ trống → setForm KHÔNG được gọi (form.htmlContent bất biến qua render xem trước)', () => {
    const setForm = vi.fn();
    render(
      <CanvasPreviewArea
        form={{ htmlContent: SLOT_HTML, title: 'Landing test', slug: 'slot-preview-test' }}
        setForm={setForm}
        onOpenImportHtml={vi.fn()}
        onOpenTemplateGallery={vi.fn()}
        onFocusChat={vi.fn()}
      />
    );
    expect(setForm).not.toHaveBeenCalled();
  });
});
