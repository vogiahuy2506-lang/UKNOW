/**
 * @deprecated Lớp tương thích cho landing page CŨ còn `<iframe src="/embed/lead-form?slug=...">`
 * trong html_content (khôi phục từ commit 50c05cd2 sau khi 3c514bc8 xoá route này — trang mới
 * dùng founderai-capture.js, không còn iframe). Gỡ route + các file compat này (App.jsx,
 * FounderLeadFormCard.jsx, useFounderLandingForm.js, useEmbedLeadFormResize.js) sau khi các
 * trang landing cũ được lưu lại (mỗi lần AI/người dùng sửa & lưu, backend tự strip iframe
 * qua landingHtmlInjection.util.js — kiểm còn bao nhiêu trang bằng SQL trong plan/báo cáo).
 */
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FounderLeadFormCard } from '../../features/landing/components/FounderLeadFormCard.jsx';
import { useEmbedLeadFormResize } from '../../features/landing/hooks/useEmbedLeadFormResize.js';
import { useLandingLocale } from '../../features/landing/hooks/useLandingLocale.js';
import { useFounderLandingForm } from '../../features/landing/hooks/useFounderLandingForm.js';
import { fetchPublicLeadFormConfig } from '../../features/landing/services/leadPublicApi.js';
import { LANDING_COPY } from '../../features/landing/constants/landingCopy.js';

/**
 * Form lead nhúng iframe — query `slug` = landing_page_slug gửi kèm POST /api/public/leads.
 * Route: `/embed/lead-form?slug=ai`
 */
export default function EmbedLeadFormPage() {
  const [sp] = useSearchParams();
  const rawSlug = String(sp.get('slug') || '').trim().toLowerCase();
  const slug = rawSlug.replace(/^\/+|\/+$/g, '');
  const { locale } = useLandingLocale();
  const copy = LANDING_COPY[locale]?.form || LANDING_COPY.vi.form;
  const [configStatus, setConfigStatus] = useState(slug ? 'loading' : 'missing-slug');
  const [configError, setConfigError] = useState('');
  const [retryNonce, setRetryNonce] = useState(0);

  const fetchConfig = useCallback(async () => {
    if (!slug) return;
    let cancelled = false;
    setConfigStatus('loading');
    setConfigError('');
    try {
      const res = await fetchPublicLeadFormConfig(slug);
      if (cancelled) return;
      const cfg = res.data?.data?.leadFormConfig;
      if (!cfg) {
        setConfigStatus('error');
        setConfigError(locale === 'en' ? 'Form is unavailable.' : 'Không tải được cấu hình form.');
        return;
      }
      setConfigStatus('ready');
    } catch (err) {
      if (cancelled) return;
      const status = err?.response?.status;
      if (status === 503) {
        setConfigError(locale === 'en' ? 'This page is temporarily paused.' : 'Landing page tạm ngừng.');
      } else if (status === 404) {
        setConfigError(locale === 'en' ? 'Landing page not found.' : 'Không tìm thấy landing page.');
      } else {
        setConfigError(err?.response?.data?.message || (locale === 'en' ? 'Could not load form.' : 'Không tải được form.'));
      }
      setConfigStatus('error');
    }
    return () => {
      cancelled = true;
    };
  }, [slug, locale]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig, retryNonce]);

  const handleRetry = () => setRetryNonce((n) => n + 1);

  const { form, setField, submitting, error, success, submit } = useFounderLandingForm(locale, {
    landingPageSlug: slug || null,
  });

  const resizeRootRef = useEmbedLeadFormResize({
    enabled: Boolean(slug) && (configStatus === 'ready' || configStatus === 'error' || configStatus === 'loading'),
    depsKey: `${configStatus}:${success}`,
  });

  if (!slug) {
    return (
      <div className="min-h-[120px] flex items-center justify-center bg-white p-4 text-sm text-red-600 font-landing">
        Thiếu tham số <code className="mx-1">slug</code> trên URL.
      </div>
    );
  }

  if (configStatus === 'loading') {
    return (
      <div ref={resizeRootRef} className="box-border inline-block w-max max-w-full min-h-0 m-0 bg-white p-6 font-landing text-sm text-gray-500">
        {locale === 'en' ? 'Loading form…' : 'Đang tải form…'}
      </div>
    );
  }

  if (configStatus !== 'ready') {
    return (
      <div ref={resizeRootRef} className="box-border inline-block w-max max-w-full min-h-0 m-0 bg-white p-6 font-landing text-sm text-red-600">
        <p className="mb-3">
          {configError || (locale === 'en' ? 'Form is unavailable.' : 'Không tải được form.')}
        </p>
        <button
          type="button"
          onClick={handleRetry}
          className="inline-flex items-center px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition-colors"
        >
          {locale === 'en' ? 'Retry' : 'Thử lại'}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={resizeRootRef}
      className="box-border inline-block w-max max-w-full min-h-0 m-0 bg-white font-landing text-founder-ink antialiased align-top"
    >
      <FounderLeadFormCard
        variant="embed"
        locale={locale}
        formCopy={copy}
        form={form}
        setField={setField}
        submitting={submitting}
        error={error}
        success={success}
        onSubmit={submit}
      />
    </div>
  );
}
