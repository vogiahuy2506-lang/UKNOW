import { useSearchParams } from 'react-router-dom';
import { UknowLeadFormCard } from '../../features/landing/components/UknowLeadFormCard.jsx';
import { useEmbedLeadFormResize } from '../../features/landing/hooks/useEmbedLeadFormResize.js';
import { useLandingLocale } from '../../features/landing/hooks/useLandingLocale.js';
import { useUknowLandingForm } from '../../features/landing/hooks/useUknowLandingForm.js';

/**
 * Form lead nhúng iframe — query `slug` = landing_page_slug gửi kèm POST /api/public/leads.
 * Route: `/embed/lead-form?slug=ai`
 */
export default function EmbedLeadFormPage() {
  const [sp] = useSearchParams();
  // Bỏ slash đầu/cuối (`/l` → `l`) để đồng bộ với DB và bộ lọc admin
  const rawSlug = String(sp.get('slug') || '').trim().toLowerCase();
  const slug = rawSlug.replace(/^\/+|\/+$/g, '');
  const { locale, copy } = useLandingLocale();
  const { form, setField, submitting, error, success, submit } = useUknowLandingForm(locale, {
    landingPageSlug: slug || null,
  });

  const resizeRootRef = useEmbedLeadFormResize({
    enabled: Boolean(slug),
    depsKey: success,
  });

  if (!slug) {
    return (
      <div className="min-h-[120px] flex items-center justify-center bg-white p-4 text-sm text-red-600 font-landing">
        Thiếu tham số <code className="mx-1">slug</code> trên URL.
      </div>
    );
  }

  // Trong iframe: không padding ngang / không căn giữa — khối form ôm sát mép iframe; chiều cao báo parent qua postMessage (lp-track.js).
  return (
    <div
      ref={resizeRootRef}
      className="box-border inline-block w-max max-w-full min-h-0 m-0 bg-white font-landing text-uknow-ink antialiased align-top"
    >
      <UknowLeadFormCard
        variant="embed"
        locale={locale}
        formCopy={copy.form}
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
