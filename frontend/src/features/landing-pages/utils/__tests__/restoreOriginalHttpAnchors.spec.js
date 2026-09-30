import { describe, it, expect } from 'vitest';
import {
  restoreOriginalHttpAnchors,
  prepareLandingHtmlForPreview,
} from '../injectLandingEnhancements.js';

describe('restoreOriginalHttpAnchors & prepareLandingHtmlForPreview (Clean URLs)', () => {
  it('khôi phục URL gốc từ link tracking trong href', () => {
    const html =
      '<a class="footer-link" href="https://api.founderai.biz/api/public/landing-track/go?slug=chuyen-giao-ban-quyen-ai-hanh-chinh&u=https%3A%2F%2Fapp.hanhchinh.ai.vn%2Fpolicies%2Fprivacy-policy" data-discover="true">Chính sách</a>';
    const out = restoreOriginalHttpAnchors(html);
    expect(out).toBe(
      '<a class="footer-link" href="https://app.hanhchinh.ai.vn/policies/privacy-policy" data-discover="true">Chính sách</a>'
    );
  });

  it('giữ nguyên các link bình thường không có landing-track/go', () => {
    const html =
      '<a class="footer-link" href="https://online.gov.vn/nen-tang/123" target="_blank">Bộ Công Thương</a>';
    expect(restoreOriginalHttpAnchors(html)).toBe(html);
  });

  it('prepareLandingHtmlForPreview không biến đổi link gốc thành link tracking', () => {
    const html =
      '<html><body><a href="https://digiso.vn">Website DIGISO</a></body></html>';
    const out = prepareLandingHtmlForPreview(html, {
      slug: 'test-slug',
      frontendOrigin: 'http://localhost:5174',
      apiBase: 'http://localhost:5001/api',
    });
    expect(out).toContain('href="https://digiso.vn"');
    expect(out).not.toContain('landing-track/go');
    // PR-10: xem trước KHÔNG nạp lp-track.js (chủ ngồi soạn không được cộng lượt xem/click giả) —
    // vẫn nạp founderai-capture.js để form chạy giống bản thật.
    expect(out).not.toContain('lp-track.js');
    expect(out).toContain('founderai-capture.js');
  });

  it('prepareLandingHtmlForPreview khôi phục các link từng bị rewrite trước đó', () => {
    const oldHtml =
      '<html><body><a href="https://api.founderai.biz/api/public/landing-track/go?slug=test&u=https%3A%2F%2Fdigiso.vn">Web</a></body></html>';
    const out = prepareLandingHtmlForPreview(oldHtml, {
      slug: 'test',
      frontendOrigin: 'http://localhost:5174',
      apiBase: 'http://localhost:5001/api',
    });
    expect(out).toContain('href="https://digiso.vn"');
    expect(out).not.toContain('landing-track/go');
  });
});
