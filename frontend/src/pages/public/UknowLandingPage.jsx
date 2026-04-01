import { UknowLandingCoursesHighlight } from '../../features/landing/components/UknowLandingCoursesHighlight.jsx';
import { UknowLandingFinalCta } from '../../features/landing/components/UknowLandingFinalCta.jsx';
import { UknowLandingFooter } from '../../features/landing/components/UknowLandingFooter.jsx';
import { UknowLandingHero } from '../../features/landing/components/UknowLandingHero.jsx';
import { UknowLeadFormCard } from '../../features/landing/components/UknowLeadFormCard.jsx';
import { UknowLandingMission } from '../../features/landing/components/UknowLandingMission.jsx';
import { UknowLandingNav } from '../../features/landing/components/UknowLandingNav.jsx';
import { UknowLandingPolicyTeaser } from '../../features/landing/components/UknowLandingPolicyTeaser.jsx';
import { UknowLandingPrograms } from '../../features/landing/components/UknowLandingPrograms.jsx';
import { UknowLandingStats } from '../../features/landing/components/UknowLandingStats.jsx';
import { UknowLandingTestimonials } from '../../features/landing/components/UknowLandingTestimonials.jsx';
import { useLandingLocale } from '../../features/landing/hooks/useLandingLocale.js';
import { useUknowLandingForm } from '../../features/landing/hooks/useUknowLandingForm.js';

/**
 * Trang landing công khai UKnow — layout mới, song ngữ VI/EN; form lead giữ nguyên contract API.
 * Route: `/l`, `/l/`
 */
export default function UknowLandingPage() {
  const { locale, setLocale, copy } = useLandingLocale();
  const { form, setField, submitting, error, success, submit } = useUknowLandingForm(locale);

  return (
    <div id="top" className="min-h-screen bg-uknow-cream font-uknow text-uknow-ink antialiased">
      <UknowLandingNav nav={copy.nav} locale={locale} setLocale={setLocale} />
      <UknowLandingHero hero={copy.hero} />

      {/* Form đăng ký lead — payload không đổi */}
      <section
        id="dang-ky"
        className="relative scroll-mt-[76px] border-b border-uknow-border bg-gradient-to-b from-white to-uknow-cream px-[6%] py-16 sm:px-[8%]"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(var(--tw-border)_1px,transparent_1px),linear-gradient(90deg,var(--tw-border)_1px,transparent_1px)] [background-size:40px_40px]"
          style={{ '--tw-border': '#e0dbd2' }}
        />
        <div className="relative z-[1] mx-auto flex max-w-6xl flex-col items-center">
          <UknowLeadFormCard
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
      </section>

      <UknowLandingStats stats={copy.stats} />
      <UknowLandingMission mission={copy.mission} />
      <UknowLandingPrograms programs={copy.programs} />
      <UknowLandingCoursesHighlight courses={copy.courses} />
      <UknowLandingTestimonials testimonials={copy.testimonials} />
      <UknowLandingPolicyTeaser policyTeaser={copy.policyTeaser} />
      <UknowLandingFinalCta finalCta={copy.finalCta} />
      <UknowLandingFooter footer={copy.footer} />
    </div>
  );
}
