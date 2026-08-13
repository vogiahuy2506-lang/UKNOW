import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FounderLeadFormCard } from '../../features/landing/components/FounderLeadFormCard.jsx';
import { useEmbedLeadFormResize } from '../../features/landing/hooks/useEmbedLeadFormResize.js';
import { useLandingLocale } from '../../features/landing/hooks/useLandingLocale.js';
import { useFounderLandingForm } from '../../features/landing/hooks/useFounderLandingForm.js';
import { fetchPublicLeadFormConfig } from '../../features/landing/services/leadPublicApi.js';
import { defaultLeadFormConfig } from '../../features/landing-pages/utils/landingLeadFormConfig.js';

/**
 * Form lead nhúng iframe — query `slug` = landing_page_slug gửi kèm POST /api/public/leads.
 * Route: `/embed/lead-form?slug=ai`
 */
export default function EmbedLeadFormPage() {
  const [sp] = useSearchParams();
  const rawSlug = String(sp.get('slug') || '').trim().toLowerCase();
  const slug = rawSlug.replace(/^\/+|\/+$/g, '');
  const { locale, copy } = useLandingLocale();
  const [configStatus, setConfigStatus] = useState(slug ? 'loading' : 'missing-slug');
  const [leadFormConfig, setLeadFormConfig] = useState(defaultLeadFormConfig());
  const [configError, setConfigError] = useState('');

  useEffect(() => {
    if (!slug) return undefined;
    let cancelled = false;
    setConfigStatus('loading');
    fetchPublicLeadFormConfig(slug)
      .then((res) => {
        if (cancelled) return;
        const cfg = res.data?.data?.leadFormConfig;
        if (!cfg) {
          setConfigStatus('error');
          setConfigError(locale === 'en' ? 'Form is unavailable.' : 'Không tải được cấu hình form.');
          return;
        }
        setLeadFormConfig(cfg);
        setConfigStatus('ready');
      })
      .catch((err) => {
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
      });
    return () => {
      cancelled = true;
    };
  }, [slug, locale]);

  const { form, setField, submitting, error, success, submit } = useFounderLandingForm(locale, {
    landingPageSlug: slug || null,
    leadFormConfig: configStatus === 'ready' ? leadFormConfig : defaultLeadFormConfig(),
  });

  const resizeRootRef = useEmbedLeadFormResize({
    enabled: Boolean(slug) && (configStatus === 'ready' || configStatus === 'error' || configStatus === 'loading'),
    depsKey: `${configStatus}:${success}:${leadFormConfig.fixedFields?.occupation?.visible}:${leadFormConfig.customFields?.length || 0}`,
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
        {configError || (locale === 'en' ? 'Form is unavailable.' : 'Không tải được form.')}
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
        formCopy={copy.form}
        form={form}
        setField={setField}
        submitting={submitting}
        error={error}
        success={success}
        onSubmit={submit}
        leadFormConfig={leadFormConfig}
      />
    </div>
  );
}
