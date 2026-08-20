import toast from 'react-hot-toast';
import { HiOutlineCode, HiOutlineExternalLink } from 'react-icons/hi';
import { getLandingManualInsertSnippets } from '../utils/injectLandingEnhancements.js';
import { normalizeLandingLpTrackApiBase } from '../utils/normalizeLandingLpTrackApiBase.js';

const BASE_DOMAIN = 'founderai.biz';

/**
 * Phần "Mã nhúng & Tracking" — gộp vào LeadFormConfigPanel để user
 * vừa cấu hình form vừa thấy ngay mã nhúng / URL mà không cần mở card riêng.
 */
export default function EmbedSnippetsPanel({ form, t }) {
  const slug = String(form?.slug || '').trim().toLowerCase();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const apiBase = normalizeLandingLpTrackApiBase(
    String(import.meta.env.VITE_API_URL || `${origin}/api`)
  );

  const snippetContext = getLandingManualInsertSnippets(
    { slug, frontendOrigin: origin, apiBase },
    t
  );

  const publicUrl = slug
    ? `https://${encodeURIComponent(slug)}.${BASE_DOMAIN}`
    : '';

  const copyText = async (label, text) => {
    if (!String(text || '').trim()) {
      toast.error(t('landingPageEditor.noContentToCopy'));
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('landingPageEditor.copied'));
    } catch {
      toast.error(t('landingPageEditor.copyFailed'));
    }
  };

  if (!snippetContext.combined) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-center">
        <HiOutlineCode className="w-5 h-5 mx-auto mb-1.5 text-gray-400" />
        <p className="text-sm text-gray-500">{t('landingPageEditor.enterSlugToSeeCode')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Landing URL */}
      <div className="p-3 bg-gradient-to-r from-orange-50 to-amber-50 rounded-lg border border-orange-100">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 bg-green-500 rounded-full" />
          <span className="text-xs font-medium text-orange-700">{t('landingPageEditor.landingUrl')}</span>
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs font-mono text-gray-700 truncate">{publicUrl}</code>
          {slug && (
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 p-1 text-blue-600 hover:text-blue-800"
              title="Mở trong tab mới"
            >
              <HiOutlineExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <button
            type="button"
            className="flex-shrink-0 px-2 py-1 text-xs bg-white hover:bg-orange-100 text-orange-600 rounded border border-orange-200 transition-colors"
            onClick={() => copyText('URL', publicUrl)}
          >
            Copy URL
          </button>
        </div>
      </div>

      {/* Embed + Tracking code side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Iframe Form */}
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                </svg>
              </div>
              <span className="text-sm font-medium text-gray-800">{t('landingPageEditor.iframeFormLabel')}</span>
            </div>
            <button
              type="button"
              className="px-2.5 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex items-center gap-1"
              onClick={() => copyText('iframe form', snippetContext.iframeBlock)}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy
            </button>
          </div>
          <div className="p-3 bg-[#1e1e1e]">
            <pre className="text-xs font-mono text-green-400 whitespace-pre-wrap break-all leading-relaxed">
              {snippetContext.iframeBlock}
            </pre>
          </div>
        </div>

        {/* Tracking Script */}
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-purple-100 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <span className="text-sm font-medium text-gray-800">{t('landingPageEditor.trackingScriptLabel')}</span>
            </div>
            <button
              type="button"
              className="px-2.5 py-1 text-xs font-medium bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors flex items-center gap-1"
              onClick={() => copyText('script tracking', snippetContext.scriptBlock)}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy
            </button>
          </div>
          <div className="p-3 bg-[#1e1e1e]">
            <pre className="text-xs font-mono text-green-400 whitespace-pre-wrap break-all leading-relaxed">
              {snippetContext.scriptBlock}
            </pre>
          </div>
        </div>
      </div>

      {/* Copy Both */}
      <button
        type="button"
        className="w-full py-2.5 px-4 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 shadow-sm"
        onClick={() => copyText('cả hai khối', snippetContext.combined)}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        {t('landingPageEditor.copyBothBlocks')}
      </button>
    </div>
  );
}
