import { useMemo } from 'react';
import { prepareLandingHtmlForPreview } from '../../landing-pages/utils/injectLandingEnhancements.js';
import { normalizeLandingLpTrackApiBase } from '../../landing-pages/utils/normalizeLandingLpTrackApiBase.js';

/**
 * Build <iframe srcDoc> từ landing HTML + title + slug.
 *
 * Tách riêng từ LandingPagesAdminPage để dùng trong LandingCanvasEditor.
 * Phase 3 giữ nguyên logic gốc (Tailwind CDN inject + lp-track.js + rewrite links).
 */

function ensureTailwindCdn(html) {
  if (!html) return html;
  if (/cdn\.tailwindcss\.com/i.test(html)) return html;
  const cdnTag = '<script src="https://cdn.tailwindcss.com"></script>';
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b([^>]*)>/i, `<head$1>\n  ${cdnTag}`);
  }
  if (/<html\b[^>]*>/i.test(html)) {
    return html.replace(/<html\b([^>]*)>/i, `<html$1><head>\n  <meta charset="utf-8"/>\n  ${cdnTag}\n</head>`);
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>\n  ${cdnTag}</head><body>${html}</body></html>`;
}

function stripNodeScripts(rawHtml) {
  return rawHtml
    .replace(
      /<script(?:\s[^>]*)?>(?:[^<]|<(?!\/script))*?(?:require|__dirname|__filename|module\.exports|process\.|global\.)(?:[^<]|<(?!\/script))*?<\/script>/gi,
      ''
    )
    .replace(/<script[^>]*src\s*=[^>]*require[^>]*><\/script>/gi, '')
    .replace(/require\s*\([^)]*\)/gi, '/* require removed */');
}

const EMPTY_HINT_TEXT = 'Nhập nội dung HTML để xem trước';
const EMPTY_HINT =
  `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Preview</title></head><body><p class="p-4 text-gray-500 text-sm">${EMPTY_HINT_TEXT}</p></body></html>`;

function buildEmptyHint(text) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Preview</title></head><body><p class="p-4 text-gray-500 text-sm">${text}</p></body></html>`;
}

/**
 * Chuẩn bị srcDoc cho iframe preview.
 *
 * @param {object} params
 * @param {string} params.html Nội dung HTML (raw, có thể là full doc hoặc chỉ body content)
 * @param {string} params.title
 * @param {string} params.slug
 * @param {string} params.publicUrl
 * @param {string} [params.emptyHint] Nội dung placeholder khi chưa có HTML (nên truyền từ i18n)
 * @returns {string} srcDoc HTML hoàn chỉnh
 */
export function buildCanvasSrcDoc({ html, title, slug, emptyHint }) {
  const rawTrim = String(html || '').trim();
  const trimmedSlug = String(slug || '').trim().toLowerCase();

  if (!trimmedSlug) {
    // Khi emptyHint được truyền (ngôn ngữ khác VI), thay text trong HTML
    if (emptyHint && emptyHint !== EMPTY_HINT_TEXT) {
      return ensureTailwindCdn(rawTrim || buildEmptyHint(emptyHint));
    }
    return ensureTailwindCdn(rawTrim || EMPTY_HINT);
  }
  if (typeof window === 'undefined') {
    if (emptyHint && emptyHint !== EMPTY_HINT_TEXT) {
      return ensureTailwindCdn(rawTrim || buildEmptyHint(emptyHint));
    }
    return ensureTailwindCdn(rawTrim || EMPTY_HINT);
  }

  const cleanHtml = stripNodeScripts(rawTrim);
  const isFullHtml = /<html[\s>]/i.test(cleanHtml);
  const origin = window.location.origin;
  const apiBase = normalizeLandingLpTrackApiBase(
    String(import.meta.env.VITE_API_URL || `${origin}/api`)
  );

  let baseHtml;
  if (isFullHtml) {
    const titleStr = String(title || '').trim();
    let out = cleanHtml;
    if (titleStr) {
      if (/<title[^>]*>[\s\S]*?<\/title>/i.test(out)) {
        out = out.replace(/<title[^>]*>[\s\S]*?<\/title>/i, `<title>${titleStr}</title>`);
      } else if (/<head\b[^>]*>/i.test(out)) {
        out = out.replace(/<head\b([^>]*)>/i, `<head$1><title>${titleStr}</title>`);
      } else if (/<body\b[^>]*>/i.test(out)) {
        out = out.replace(
          /<body\b([^>]*)>/i,
          `<head><meta charset="utf-8"/><title>${titleStr}</title></head><body$1>`
        );
      } else {
        out = `<head><meta charset="utf-8"/><title>${titleStr}</title></head>${out}`;
      }
    }
    baseHtml = out;
  } else {
    baseHtml = cleanHtml
      ? `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title || ''}</title></head><body>${cleanHtml}</body></html>`
      : '<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Preview</title></head><body></body></html>';
  }

  const preview = prepareLandingHtmlForPreview(baseHtml, {
    slug: trimmedSlug,
    frontendOrigin: origin,
    apiBase,
  });
  return ensureTailwindCdn(preview);
}

/**
 * React hook: build srcDoc memoized theo form state.
 */
export function useCanvasSrcDoc({ html, title, slug, emptyHint }) {
  return useMemo(
    () => buildCanvasSrcDoc({ html, title, slug, emptyHint }),
    [html, title, slug, emptyHint]
  );
}

export function getPublicUrlFromSlug(slug) {
  const s = String(slug || '').trim().toLowerCase();
  if (!s || typeof window === 'undefined') return '';
  return `https://${encodeURIComponent(s)}.founderai.biz`;
}
