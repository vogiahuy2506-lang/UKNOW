/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-5b-2c mục 5.
 *
 * Thẻ landing của trợ lý nổi xem trước srcDoc THẲNG (không qua buildCanvasSrcDoc.js như trình
 * soạn landing) — chỗ trống `data-founderai-form-slot` (AI dựng bằng Biểu mẫu, chưa lưu) trước
 * bản vá này hiện ra một khoảng trống câm trong iframe. Test khoá đúng ranh giới: chỉ srcDoc của
 * iframe xem trước đổi, `page.html` (nguồn cho copy/tải về/lưu thật) giữ nguyên chỗ trống thật.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LandingPageCard from '../LandingPageCard';

vi.mock('../../../../i18n', () => ({
  useI18n: (namespace = null) => {
    const t = (key) => (namespace ? `${namespace}.${key}` : key);
    if (namespace) return t;
    return { t, locale: 'vi' };
  },
}));

const SLOT_HTML = '<section><div data-founderai-form-slot></div></section>';

describe('LandingPageCard — xem trước chỗ trống Biểu mẫu (PR-5b-2c mục 5)', () => {
  it('srcDoc của iframe xem trước thay chỗ trống bằng khung gợi ý, page.html gốc giữ nguyên chỗ trống thật', () => {
    const page = { title: 'Trang test', html: SLOT_HTML };
    const { container } = render(
      <MemoryRouter>
        <LandingPageCard
          page={page}
          messageId={1}
          messageIndex={0}
          onSaveAndPublish={vi.fn()}
          onGenerateNew={vi.fn()}
          onEditWithAi={vi.fn()}
        />
      </MemoryRouter>
    );

    const iframe = container.querySelector('iframe');
    expect(iframe).toBeTruthy();
    const srcDoc = iframe.getAttribute('srcdoc');
    expect(srcDoc).not.toContain('data-founderai-form-slot');
    expect(srcDoc).toContain('landingCanvas.canvasPreview.formSlotHint');

    // Nguồn dữ liệu gốc (copy/tải về/lưu thật) KHÔNG bị hàm xem trước đổi.
    expect(page.html).toBe(SLOT_HTML);
  });
});
