import { UknowLandingBenefits } from '../../features/landing/components/UknowLandingBenefits.jsx';
import { UknowLandingCoursesHighlight } from '../../features/landing/components/UknowLandingCoursesHighlight.jsx';
import { UknowLandingFinalCta } from '../../features/landing/components/UknowLandingFinalCta.jsx';
import { UknowLandingFooter } from '../../features/landing/components/UknowLandingFooter.jsx';
import { UknowLandingHero } from '../../features/landing/components/UknowLandingHero.jsx';
import { UknowLeadFormCard } from '../../features/landing/components/UknowLeadFormCard.jsx';
import { UknowLandingNav } from '../../features/landing/components/UknowLandingNav.jsx';
import { UknowLandingTestimonials } from '../../features/landing/components/UknowLandingTestimonials.jsx';
import { UknowLandingAbout } from '../../features/landing/components/UknowLandingAbout.jsx';
import { useLandingLocale } from '../../features/landing/hooks/useLandingLocale.js';
import { useLandingFeaturedCourses } from '../../features/landing/hooks/useLandingFeaturedCourses.js';
import { useUknowLandingForm } from '../../features/landing/hooks/useUknowLandingForm.js';

/**
 * Trang landing công khai UKnow — layout bám mock `uknow-landing-v2.html`, song ngữ VI/EN.
 * Route: `/l`, `/l/`
 */
export default function UknowLandingPage() {
  const { locale, setLocale, copy } = useLandingLocale();
  const { form, setField, submitting, error, success, submit } = useUknowLandingForm(locale);
  const { courseItems } = useLandingFeaturedCourses(locale, copy.courses.items);

  return (
    <div
      id="top"
      className="min-h-screen scroll-smooth bg-uknow-cream font-uknow text-uknow-ink antialiased selection:bg-uknow-teal/30"
    >
      <UknowLandingNav nav={copy.nav} locale={locale} setLocale={setLocale} />

      {/* Hero + form: một section, chia cột như mock */}
      <section className="relative grid min-h-screen grid-cols-1 overflow-hidden pt-[68px] lg:min-h-0 lg:grid-cols-[minmax(0,55%)_minmax(0,45%)]">
        <div
          className="pointer-events-none absolute inset-0 z-0 bg-uknow-cream lg:bg-[linear-gradient(108deg,#faf8f3_52%,#e8f4f6_52%)]"
          aria-hidden
        />
        <UknowLandingHero hero={copy.hero} />
        <div
          id="dang-ky"
          className="relative z-[2] flex items-center justify-center px-[6%] pb-14 pt-4 lg:px-[7%] lg:pb-20 lg:pl-[3%] lg:pr-[7%] lg:pt-20 scroll-mt-[76px]"
        >
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

      <UknowLandingAbout about={copy.about} />
      <UknowLandingBenefits benefits={copy.benefits} />
      <UknowLandingCoursesHighlight courses={copy.courses} items={courseItems} />
      <UknowLandingTestimonials testimonials={copy.testimonials} />
      <UknowLandingFinalCta finalCta={copy.finalCta} />
      <UknowLandingFooter footer={copy.footer} />
    </div>
  );
}
