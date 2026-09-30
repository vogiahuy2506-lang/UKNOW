/**
 * PR-10 (C2-01) — xem trước của chủ trong trình soạn KHÔNG được ghi lượt xem/click vào thống kê.
 *
 * lp-track.js gọi `POST /public/landing-analytics/view` mỗi lần nạp; iframe trình soạn nạp lại mỗi lần
 * sửa nội dung. Nên srcDoc xem trước không được chứa lp-track.js; bản LƯU (đường inject mặc định) vẫn có.
 */
import { describe, it, expect } from 'vitest';
import {
  injectLandingEnhancements,
  prepareLandingHtmlForPreview,
} from '../injectLandingEnhancements.js';
import { buildCanvasSrcDoc } from '../../../landing-canvas/utils/buildCanvasSrcDoc.js';

const OPTS = {
  slug: 'khoa-hoc-ai',
  frontendOrigin: 'http://localhost:5174',
  apiBase: 'http://localhost:5001/api',
};
const HTML = '<html><body><a href="https://digiso.vn">Web</a></body></html>';

describe('xem trước landing không nạp tracking (C2-01)', () => {
  it('prepareLandingHtmlForPreview: không có lp-track.js, vẫn có founderai-capture.js', () => {
    const out = prepareLandingHtmlForPreview(HTML, OPTS);
    expect(out).not.toContain('lp-track.js');
    expect(out).toContain('founderai-capture.js');
  });

  it('HTML đã lưu (có sẵn lp-track.js do backend chèn) → xem trước GỠ lp-track.js', () => {
    const saved =
      '<html><body><p>x</p>' +
      '<div data-founder-lp-injected="1" style="display:none" aria-hidden="true"></div>\n' +
      '<script src="https://founderai.biz/lp-track.js" data-api-base="https://founderai.biz/api" data-slug="khoa-hoc-ai" defer></script>\n' +
      '</body></html>';
    const out = prepareLandingHtmlForPreview(saved, OPTS);
    expect(out).not.toContain('lp-track.js');
  });

  it('buildCanvasSrcDoc (đường thật của iframe trình soạn): srcDoc không chứa lp-track.js', () => {
    const srcDoc = buildCanvasSrcDoc({ html: HTML, title: 'Landing', slug: 'khoa-hoc-ai' });
    expect(srcDoc).not.toContain('lp-track.js');
    expect(srcDoc).not.toContain('landing-analytics');
  });

  it('đường inject mặc định (dùng khi lưu/xuất bản) VẪN chèn lp-track.js — số liệu thật không mất', () => {
    const out = injectLandingEnhancements(HTML, OPTS);
    expect(out).toContain('lp-track.js');
    expect(out).toContain('founderai-capture.js');
  });
});
