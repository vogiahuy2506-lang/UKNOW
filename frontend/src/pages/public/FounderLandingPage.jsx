import { FounderLandingBenefits } from '../../features/landing/components/FounderLandingBenefits.jsx';
import { FounderLandingCoursesHighlight } from '../../features/landing/components/FounderLandingCoursesHighlight.jsx';
import { FounderLandingFinalCta } from '../../features/landing/components/FounderLandingFinalCta.jsx';
import { FounderLandingFooter } from '../../features/landing/components/FounderLandingFooter.jsx';
import { FounderLandingHero } from '../../features/landing/components/FounderLandingHero.jsx';
import { FounderLeadFormCard } from '../../features/landing/components/FounderLeadFormCard.jsx';
import { FounderLandingNav } from '../../features/landing/components/FounderLandingNav.jsx';
import { FounderLandingTestimonials } from '../../features/landing/components/FounderLandingTestimonials.jsx';
import { FounderLandingAbout } from '../../features/landing/components/FounderLandingAbout.jsx';
import { useLandingLocale } from '../../features/landing/hooks/useLandingLocale.js';
import { useLandingFeaturedCourses } from '../../features/landing/hooks/useLandingFeaturedCourses.js';
import { useLandingTestimonials } from '../../features/landing/hooks/useLandingTestimonials.js';
import { useFounderLandingForm } from '../../features/landing/hooks/useFounderLandingForm.js';
import { useRecordLandingView } from '../../features/landing-pages/hooks/useRecordLandingView.js';
import { LANDING_COPY } from '../../features/landing/constants/landingCopy.js';

/**
 * Trang landing công khai Founder AI — layout bám mock `founder-landing-v2.html`, song ngữ VI/EN.
 * Route: `/l`, `/l/`
 * Phông chữ: Roboto (`font-landing`) cho toàn trang.
 */
export default function FounderLandingPage() {
  const { locale, setLocale } = useLandingLocale();
  const copy = LANDING_COPY[locale];
  useRecordLandingView('l');
  const { form, setField, submitting, error, success, submit } = useFounderLandingForm(locale, {
    landingPageSlug: 'l',
  });
  const { courseItems } = useLandingFeaturedCourses(locale, copy.courses.items);
  const { testimonialItems } = useLandingTestimonials(locale, copy.testimonials.items);

  return (
    <div
      id="top"
      className="min-h-screen scroll-smooth bg-founder-cream font-landing text-founder-ink antialiased selection:bg-founder-teal/30"
    >
      <FounderLandingNav nav={copy.nav} locale={locale} setLocale={setLocale} />

      {/* Hero + form: một section, chia cột như mock */}
      <section className="relative grid min-h-screen grid-cols-1 overflow-hidden pt-[68px] lg:min-h-0 lg:grid-cols-[minmax(0,55%)_minmax(0,45%)]">
        <div
          className="pointer-events-none absolute inset-0 z-0 bg-founder-cream lg:bg-[linear-gradient(108deg,#faf8f3_52%,#e8f4f6_52%)]"
          aria-hidden
        />
        <FounderLandingHero hero={copy.hero} />
        <div
          id="dang-ky"
          className="relative z-[2] flex items-center justify-center px-[6%] pb-14 pt-4 lg:px-[7%] lg:pb-20 lg:pl-[3%] lg:pr-[7%] lg:pt-20 scroll-mt-[76px]"
        >
          <FounderLeadFormCard
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

      <FounderLandingAbout about={copy.about} />
      <FounderLandingBenefits benefits={copy.benefits} />
      <FounderLandingCoursesHighlight courses={copy.courses} items={courseItems} landingSlug="l" />
      <FounderLandingTestimonials testimonials={copy.testimonials} items={testimonialItems} />
      <FounderLandingFinalCta finalCta={copy.finalCta} />
      <FounderLandingFooter footer={copy.footer} />
    </div>
  );
}
