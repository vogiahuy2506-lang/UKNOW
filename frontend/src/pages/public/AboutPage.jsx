import { Link } from 'react-router-dom';
import {
  FaEnvelope, FaComments, FaUsers, FaChartBar, FaBolt, FaShieldAlt,
  FaRocket, FaHandshake, FaHeadset, FaCheckCircle, FaArrowRight,
  FaPlay, FaStar, FaLaptopCode, FaCogs
} from 'react-icons/fa';

import AnimatedSection from '../../components/AnimatedSection';
import TestimonialSlider from './components/TestimonialSlider';
import { useI18n } from '../../i18n';

// ─── Static data ────────────────────────────────────────────────────────────

const features = (t) => [
  { icon: FaLaptopCode, title: t('aboutPage.feature1Title'), description: t('aboutPage.feature1Desc'), color: 'from-orange-500 to-red-500' },
  { icon: FaEnvelope, title: t('aboutPage.feature2Title'), description: t('aboutPage.feature2Desc'), color: 'from-red-500 to-rose-500' },
  { icon: FaComments, title: t('aboutPage.feature3Title'), description: t('aboutPage.feature3Desc'), color: 'from-amber-500 to-orange-500' },
  { icon: FaUsers, title: t('aboutPage.feature4Title'), description: t('aboutPage.feature4Desc'), color: 'from-rose-400 to-red-500' },
  { icon: FaChartBar, title: t('aboutPage.feature5Title'), description: t('aboutPage.feature5Desc'), color: 'from-orange-400 to-amber-500' },
  { icon: FaShieldAlt, title: t('aboutPage.feature6Title'), description: t('aboutPage.feature6Desc'), color: 'from-slate-600 to-slate-800' },
];

const stats = (t) => [
  { value: '1,500+', label: t('aboutPage.statsBusinesses') },
  { value: '5M+', label: t('aboutPage.statsLeads') },
  { value: '500+', label: t('aboutPage.statsCampaigns') },
  { value: '99.9%', label: t('aboutPage.statsUptime') },
];

const steps = (t) => [
  { number: '01', title: t('aboutPage.step1Title'), description: t('aboutPage.step1Desc'), icon: FaBolt },
  { number: '02', title: t('aboutPage.step2Title'), description: t('aboutPage.step2Desc'), icon: FaCogs },
  { number: '03', title: t('aboutPage.step3Title'), description: t('aboutPage.step3Desc'), icon: FaRocket },
  { number: '04', title: t('aboutPage.step4Title'), description: t('aboutPage.step4Desc'), icon: FaChartBar },
];

const benefits = (t) => [
  { icon: FaRocket, title: t('aboutPage.benefit1Title'), desc: t('aboutPage.benefit1Desc') },
  { icon: FaHeadset, title: t('aboutPage.benefit2Title'), desc: t('aboutPage.benefit2Desc') },
  { icon: FaHandshake, title: t('aboutPage.benefit3Title'), desc: t('aboutPage.benefit3Desc') },
  { icon: FaCheckCircle, title: t('aboutPage.benefit4Title'), desc: t('aboutPage.benefit4Desc') },
];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AboutPage() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-white overflow-x-hidden font-sans selection:bg-orange-500 selection:text-white">
      <style>{`
        @keyframes float { 0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.5; } 50% { transform: translateY(-20px) rotate(180deg); opacity: 1; } }
        @keyframes slide-up { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
        .animate-float { animation: float 10s ease-in-out infinite; }
        .animate-slide-up { animation: slide-up 1s ease-out forwards; }
        .animate-slide-up-delay-1 { animation: slide-up 1s ease-out 0.2s forwards; opacity: 0; }
        .animate-slide-up-delay-2 { animation: slide-up 1s ease-out 0.4s forwards; opacity: 0; }
        .animate-slide-up-delay-3 { animation: slide-up 1s ease-out 0.6s forwards; opacity: 0; }
      `}</style>

      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden pt-24 pb-20 bg-white">
        {/* Abstract Background Elements */}
        <div className="absolute inset-0 z-0">
          <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-gradient-to-br from-orange-400/20 to-red-400/20 blur-[80px]" />
          <div className="absolute bottom-[10%] left-[-10%] w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-amber-400/20 to-yellow-400/10 blur-[100px]" />
        </div>

        <div className="relative z-20 max-w-7xl mx-auto px-6 text-center">
          <div className="animate-slide-up inline-flex items-center gap-2 px-4 py-2 bg-orange-50 border border-orange-100 rounded-full mb-8 shadow-sm">
            <span className="w-2 h-2 bg-orange-600 rounded-full animate-pulse" />
            <span className="text-orange-700 font-bold text-sm tracking-wide uppercase">{t('aboutPage.badge')}</span>
          </div>

          <h1 className="animate-slide-up-delay-1 text-5xl md:text-7xl lg:text-8xl font-black mb-8 leading-[1.1] text-slate-900 tracking-tight">
            {t('aboutPage.titleMain')}<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-red-600">
              {t('aboutPage.titleHighlight')}
            </span>
          </h1>

          <p className="animate-slide-up-delay-2 text-xl md:text-2xl text-slate-600 max-w-3xl mx-auto mb-12 leading-relaxed">
            {t('aboutPage.subtitle')} <strong className="text-slate-900">{t('aboutPage.subtitleHighlight')}</strong>
          </p>

          <div className="animate-slide-up-delay-3 flex flex-col sm:flex-row justify-center items-center gap-4 mb-20">
            <Link
              to="/login"
              className="w-full sm:w-auto px-10 py-5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-full font-bold text-lg hover:shadow-xl hover:shadow-orange-500/30 transition-all flex items-center justify-center gap-3 transform hover:scale-105"
            >
              {t('aboutPage.tryFree')}
              <FaArrowRight />
            </Link>
            <a
              href="#features"
              className="w-full sm:w-auto px-10 py-5 bg-white text-slate-700 rounded-full font-bold text-lg border border-slate-200 hover:bg-orange-50 hover:border-orange-200 transition-all flex items-center justify-center gap-3 shadow-sm"
            >
              <FaPlay className="text-orange-500" />
              {t('aboutPage.watchFeatures')}
            </a>
          </div>

          <div className="animate-slide-up-delay-3 pt-10 border-t border-slate-100 flex flex-wrap justify-center items-center gap-12 opacity-60 grayscale">
            <span className="font-bold text-slate-500 text-sm tracking-widest uppercase">{t('aboutPage.trustedPartners')}</span>
            <div className="flex gap-10 font-black text-xl text-slate-800">
              <span className="flex items-center gap-1"><FaBolt /> TechFlow</span>
              <span className="flex items-center gap-1"><FaShieldAlt /> SecureNet</span>
              <span className="flex items-center gap-1"><FaChartBar /> GrowthHQ</span>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 bg-gradient-to-r from-orange-500 to-red-500 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10"></div>
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 divide-x divide-white/20">
            {stats(t).map((stat, index) => (
              <AnimatedSection key={index} delay={index * 100} className="text-center px-4">
                <div className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-2">{stat.value}</div>
                <div className="text-orange-100 font-semibold text-sm uppercase tracking-wider">{stat.label}</div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-32 bg-slate-50 relative overflow-hidden border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-6">
          <AnimatedSection className="text-center mb-20 max-w-3xl mx-auto">
            <span className="inline-block px-4 py-2 bg-orange-100 text-orange-700 rounded-full font-bold text-sm tracking-wide uppercase mb-6 shadow-sm border border-orange-200">
              {t('aboutPage.featuresBadge')}
            </span>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-slate-900 mb-6 tracking-tight">
              {t('aboutPage.featuresTitle')} <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-red-500">{t('aboutPage.featuresSubtitle').split(' ').slice(0, 2).join(' ')}</span>
            </h2>
            <p className="text-xl text-slate-600 leading-relaxed">
              {t('aboutPage.featuresSubtitle')}
            </p>
          </AnimatedSection>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features(t).map((feature, index) => (
              <AnimatedSection key={index} delay={index * 100}>
                <div className="group h-full bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100 hover:shadow-xl transition-all duration-300 hover:-translate-y-2">
                  <div className={`w-16 h-16 bg-gradient-to-br ${feature.color} rounded-2xl flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 group-hover:rotate-6 transition-all duration-300`}>
                    <feature.icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900 mb-4">{feature.title}</h3>
                  <p className="text-slate-600 leading-relaxed">{feature.description}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-32 bg-white relative overflow-hidden border-t border-slate-100">
        <div className="relative max-w-7xl mx-auto px-6">
          <AnimatedSection className="text-center mb-24 max-w-3xl mx-auto">
            <span className="inline-block px-4 py-2 bg-red-100 text-red-700 rounded-full font-bold text-sm tracking-wide uppercase mb-6 shadow-sm border border-red-200">
              {t('aboutPage.howItWorksBadge')}
            </span>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-slate-900 mb-6 tracking-tight">
              {t('aboutPage.howItWorksTitle')} <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-red-500">{t('aboutPage.howItWorksSubtitle')}</span>
            </h2>
            <p className="text-xl text-slate-600 leading-relaxed">
              {t('aboutPage.howItWorksDesc')}
            </p>
          </AnimatedSection>

          <div className="relative">
            {/* Horizontal Line connecting steps on large screens */}
            <div className="hidden lg:block absolute top-[40%] left-[10%] right-[10%] h-1 bg-gradient-to-r from-orange-100 via-red-300 to-orange-100 z-0 rounded-full" />

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-12 relative z-10">
              {steps(t).map((step, index) => (
                <AnimatedSection key={index} delay={index * 150} className="text-center">
                  <div className="w-24 h-24 bg-white rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-xl border border-slate-100 hover:scale-110 transition-transform duration-300 group">
                    <div className="absolute inset-0 bg-gradient-to-br from-orange-500 to-red-500 rounded-[2rem] opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <step.icon className="w-10 h-10 text-orange-500 group-hover:text-white relative z-10 transition-colors" />
                  </div>
                  <div className="text-sm font-black text-orange-400 uppercase tracking-widest mb-3">{t('aboutPage.step')} {step.number}</div>
                  <h3 className="text-xl font-bold text-slate-900 mb-4">{step.title}</h3>
                  <p className="text-slate-600 leading-relaxed">{step.description}</p>
                </AnimatedSection>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-32 bg-slate-900 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-orange-900/40 via-slate-900 to-slate-900"></div>
        <div className="relative max-w-7xl mx-auto px-6">
          <AnimatedSection className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-6">{t('aboutPage.whyChooseTitle')}</h2>
            <p className="text-xl text-orange-200 max-w-2xl mx-auto">{t('aboutPage.whyChooseSubtitle')}</p>
          </AnimatedSection>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-20">
            {benefits(t).map((benefit, index) => (
              <AnimatedSection key={index} delay={index * 100}>
                <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-8 border border-white/10 text-center hover:bg-white/10 transition-all duration-300 h-full">
                  <div className="w-16 h-16 bg-orange-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <benefit.icon className="w-8 h-8 text-orange-400" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3">{benefit.title}</h3>
                  <p className="text-slate-400 leading-relaxed">{benefit.desc}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>

          <AnimatedSection>
            <div className="bg-gradient-to-r from-orange-600 to-red-600 rounded-[3rem] p-10 md:p-16 shadow-2xl max-w-5xl mx-auto relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
              <div className="flex flex-col md:flex-row items-center justify-between gap-12 relative z-10">
                <div className="text-left">
                  <h3 className="text-3xl md:text-4xl font-black text-white mb-4">{t('aboutPage.ctaReady')}</h3>
                  <p className="text-orange-100 text-lg">{t('aboutPage.ctaSubtitle')}</p>
                </div>
                <div className="shrink-0 flex flex-col items-center gap-4">
                  <Link
                    to="/login"
                    className="px-10 py-5 bg-white text-orange-600 rounded-full font-bold text-xl shadow-xl hover:shadow-2xl transition-all transform hover:-translate-y-1 block text-center w-full"
                  >
                    {t('aboutPage.ctaButton')}
                  </Link>
                  <span className="text-orange-100 text-sm font-medium flex items-center gap-2"><FaCheckCircle /> {t('aboutPage.ctaNote')}</span>
                </div>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-32 bg-white relative overflow-hidden border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-6">
          <AnimatedSection className="text-center mb-20">
            <span className="inline-block px-4 py-2 bg-orange-100 text-orange-700 rounded-full font-bold text-sm tracking-wide uppercase mb-6 shadow-sm border border-orange-200">
              {t('aboutPage.testimonialsBadge')}
            </span>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-slate-900 mb-6 tracking-tight">
              {t('aboutPage.testimonialsTitle')} <br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-red-500">{t('aboutPage.testimonialsSubtitle')}</span>
            </h2>
          </AnimatedSection>
          <TestimonialSlider />
        </div>
      </section>

    </div>
  );
}
