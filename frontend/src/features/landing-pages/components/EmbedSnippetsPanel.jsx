import toast from 'react-hot-toast';
import { HiOutlineCode, HiOutlineExternalLink, HiOutlineInformationCircle } from 'react-icons/hi';
import {
  getLandingManualInsertSnippets,
  insertLeadFormIntoHtml,
} from '../utils/injectLandingEnhancements.js';
import { normalizeLandingLpTrackApiBase } from '../utils/normalizeLandingLpTrackApiBase.js';

const BASE_DOMAIN = 'founderai.biz';

/**
 * Phần "Mã nhúng & Tracking" — gộp vào LeadFormConfigPanel để user
 * vừa cấu hình form vừa thấy ngay mã nhúng / URL mà không cần mở card riêng.
 *
 * Flow 1-click: nút "Chèn form vào trang" tự động chèn iframe block vào HTML
 * của landing page (trước `</body>`), không cần user tự copy/paste marker.
 */
export default function EmbedSnippetsPanel({ form, setForm, t }) {
  const slug = String(form?.slug || '').trim().toLowerCase();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const apiBase = normalizeLandingLpTrackApiBase(
    String(import.meta.env.VITE_API_URL || `${origin}/api`)
  );

  const snippetContext = getLandingManualInsertSnippets(
    { slug, frontendOrigin: origin, apiBase },
    t
  );

  const hasSlug = Boolean(snippetContext.combined);
  const currentHtml = String(form?.htmlContent || '');
  const formAlreadyInserted = currentHtml.includes('/embed/lead-form') || currentHtml.includes('<!-- UKNOW_LP_FORM -->');
  const hasHtml = currentHtml.trim().length > 0;
  const canInsert = hasSlug && hasHtml && !formAlreadyInserted && typeof setForm === 'function';

  const iframeBlock = snippetContext.iframeBlock || '<!-- iframe form sẽ xuất hiện ở đây khi bạn đặt slug -->';
  const scriptBlock = snippetContext.scriptBlock || '<!-- script tracking sẽ xuất hiện ở đây khi bạn đặt slug -->';
  const publicUrl = slug
    ? `https://${encodeURIComponent(slug)}.${BASE_DOMAIN}`
    : `https://your-slug.${BASE_DOMAIN}`;

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

  const handleInsertForm = () => {
    if (!canInsert) return;
    const nextHtml = insertLeadFormIntoHtml(currentHtml, { iframeBlock: snippetContext.iframeBlock });
    if (nextHtml === currentHtml) {
      toast.success(t('landingPageEditor.formAlreadyInserted'));
      return;
    }
    setForm((prev) => ({ ...prev, htmlContent: nextHtml }));
    toast.success(t('landingPageEditor.formInserted'));
  };

  return (
    <div className="space-y-3">
      {!hasSlug && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
          <HiOutlineCode className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium">{t('landingPageEditor.enterSlugToSeeCode')}</p>
            <p className="mt-0.5 text-amber-800/80">
              Hướng dẫn bên dưới vẫn dùng được — chỉ cần đặt slug là mã nhúng + URL tracking sẽ tự điền.
            </p>
          </div>
        </div>
      )}

      {/* 1-click insert — flow đơn giản nhất, không cần copy/paste thủ công */}
      <button
        type="button"
        disabled={!canInsert}
        onClick={handleInsertForm}
        className="w-full py-2.5 px-4 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-orange-500 disabled:hover:to-amber-500"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        {formAlreadyInserted
          ? t('landingPageEditor.formAlreadyInserted')
          : t('landingPageEditor.insertFormButton')}
      </button>

      {/* Quick info — giải thích ngắn thay cho hướng dẫn 3 bước dài */}
      <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-3 text-xs text-blue-900 flex items-start gap-2">
        <HiOutlineInformationCircle className="w-4 h-4 mt-0.5 shrink-0 text-blue-600" />
        <div className="space-y-1 leading-relaxed">
          <p className="font-medium">{t('landingPageEditor.embedQuickInfoTitle')}</p>
          <p>{t('landingPageEditor.embedQuickInfoBody')}</p>
        </div>
      </div>

      {/* Landing URL */}
      <div className="p-3 bg-gradient-to-r from-orange-50 to-amber-50 rounded-lg border border-orange-100">
        <div className="flex items-center gap-2 mb-1">
          <div className={`w-2 h-2 rounded-full ${hasSlug ? 'bg-green-500' : 'bg-gray-300'}`} />
          <span className="text-xs font-medium text-orange-700">{t('landingPageEditor.landingUrl')}</span>
        </div>
        <div className="flex items-center gap-2">
          <code className={`flex-1 text-xs font-mono truncate ${hasSlug ? 'text-gray-700' : 'text-gray-400 italic'}`}>{publicUrl}</code>
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
            disabled={!hasSlug}
            className="flex-shrink-0 px-2 py-1 text-xs bg-white hover:bg-orange-100 text-orange-600 rounded border border-orange-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
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
              disabled={!hasSlug}
              className="px-2.5 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
              onClick={() => copyText('iframe form', snippetContext.iframeBlock)}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy
            </button>
          </div>
          <div className="p-3 bg-[#1e1e1e]">
            <pre className={`text-xs font-mono whitespace-pre-wrap break-all leading-relaxed ${hasSlug ? 'text-green-400' : 'text-gray-500 italic'}`}>
              {iframeBlock}
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
              disabled={!hasSlug}
              className="px-2.5 py-1 text-xs font-medium bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-purple-600"
              onClick={() => copyText('script tracking', snippetContext.scriptBlock)}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy
            </button>
          </div>
          <div className="p-3 bg-[#1e1e1e]">
            <pre className={`text-xs font-mono whitespace-pre-wrap break-all leading-relaxed ${hasSlug ? 'text-green-400' : 'text-gray-500 italic'}`}>
              {scriptBlock}
            </pre>
          </div>
        </div>
      </div>

      {/* Copy Both */}
      <button
        type="button"
        disabled={!hasSlug}
        className="w-full py-2.5 px-4 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
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
