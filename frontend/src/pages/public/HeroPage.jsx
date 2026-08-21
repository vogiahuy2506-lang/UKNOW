import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  FaEnvelope, FaComments, FaUsers, FaChartBar, FaBolt, FaShieldAlt,
  FaRocket, FaHeadset, FaCheck, FaArrowRight,
  FaLaptop, FaMagic, FaChartLine, FaLock,
  FaBullseye, FaHandshake, FaClock, FaTools,
  FaPiggyBank,
} from 'react-icons/fa';
import {
  HiOutlineMail, HiOutlineChatAlt2, HiOutlineUserGroup,
  HiOutlinePlay, HiOutlineSparkles,
} from 'react-icons/hi';
import HeroNavbar from './components/HeroNavbar';
import PublicFooter from './components/PublicFooter';
import HeroDashboardMock from './components/HeroDashboardMock';
import AnimatedSection from '../../components/AnimatedSection';
import HeroChatWidget from '../../features/hero/components/HeroChatWidget';
import CampaignFlowModal from '../../features/hero/components/CampaignFlowModal';
import { useI18n } from '../../i18n';
import { usePublicLandingOverrides } from '../../features/landing-customizer';

const getFeatures = (t) => [
  {
    icon: FaLaptop,
    title: t('heroPage.f1Title'),
    description: t('heroPage.f1Desc'),
    highlight: t('heroPage.f1Highlight'),
  },
  {
    icon: FaEnvelope,
    title: t('heroPage.f2Title'),
    description: t('heroPage.f2Desc'),
    highlight: t('heroPage.f2Highlight'),
  },
  {
    icon: FaComments,
    title: t('heroPage.f3Title'),
    description: t('heroPage.f3Desc'),
    highlight: t('heroPage.f3Highlight'),
  },
  {
    icon: FaUsers,
    title: t('heroPage.f4Title'),
    description: t('heroPage.f4Desc'),
    highlight: t('heroPage.f4Highlight'),
  },
  {
    icon: FaChartLine,
    title: t('heroPage.f5Title'),
    description: t('heroPage.f5Desc'),
    highlight: t('heroPage.f5Highlight'),
  },
  {
    icon: FaLock,
    title: t('heroPage.f6Title'),
    description: t('heroPage.f6Desc'),
    highlight: t('heroPage.f6Highlight'),
  },
];

const getSteps = (t) => [
  {
    number: '01',
    title: t('heroPage.s1Title'),
    description: t('heroPage.s1Desc'),
    icon: FaBolt,
  },
  {
    number: '02',
    title: t('heroPage.s2Title'),
    description: t('heroPage.s2Desc'),
    icon: FaTools,
  },
  {
    number: '03',
    title: t('heroPage.s3Title'),
    description: t('heroPage.s3Desc'),
    icon: FaBullseye,
  },
  {
    number: '04',
    title: t('heroPage.s4Title'),
    description: t('heroPage.s4Desc'),
    icon: FaChartBar,
  },
];

const getBenefits = (t) => [
  {
    icon: FaClock,
    title: t('heroPage.b1Title'),
    description: t('heroPage.b1Desc'),
  },
  {
    icon: FaUsers,
    title: t('heroPage.b2Title'),
    description: t('heroPage.b2Desc'),
  },
  {
    icon: FaPiggyBank,
    title: t('heroPage.b3Title'),
    description: t('heroPage.b3Desc'),
  },
  {
    icon: FaShieldAlt,
    title: t('heroPage.b4Title'),
    description: t('heroPage.b4Desc'),
  },
];

export default function HeroPage() {
  const { t, locale } = useI18n();
  const { getOverride } = usePublicLandingOverrides('hero');
  const features = getFeatures(t);
  const steps = getSteps(t);
  const benefits = getBenefits(t);
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  const [campaignModalFlow, setCampaignModalFlow] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      const key = e.detail?.flowKey;
      if (key) {
        setCampaignModalFlow(key);
        setCampaignModalOpen(true);
      }
    };
    window.addEventListener('open-campaign-flow', handler);
    return () => window.removeEventListener('open-campaign-flow', handler);
  }, []);

  const getValue = (baseKey, fallback) => {
    const override = getOverride(baseKey);
    return override || fallback;
  };

  return (
    <div className="min-h-screen bg-white">

      {/* ── Navigation ── */}
      <HeroNavbar />

      {/* ── Hero Section ── */}
      <section className="relative px-6 pt-12 pb-20 md:pt-16 md:pb-28 overflow-hidden">
        {/* Background dots */}
        <div className="absolute inset-0 opacity-[0.3]" style={{
          backgroundColor: '#f8fafc',
          backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }} />

        {/* Decorative shapes */}
        <div className="absolute top-16 left-8 w-24 h-24 border border-orange-200 rounded-full opacity-40" />
        <div className="absolute top-36 left-16 w-14 h-14 border border-blue-200 rounded-2xl rotate-12 opacity-40" />
        <div className="absolute bottom-20 right-16 w-20 h-20 border border-purple-200 rounded-full opacity-40" />
        <div className="absolute bottom-36 right-28 w-10 h-10 bg-orange-100 rounded-lg rotate-45 opacity-30" />
        <div className="absolute top-1/2 left-6 w-6 h-6 bg-blue-100 rounded-full opacity-25" />

        {/* Floating icons - minimal */}
        <svg className="absolute top-28 left-1/4 w-8 h-8 text-orange-400 opacity-25" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <svg className="absolute bottom-32 right-20 w-8 h-8 text-blue-400 opacity-25" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <svg className="absolute top-1/3 right-1/4 w-8 h-8 text-purple-400 opacity-25" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <svg className="absolute bottom-1/3 left-20 w-8 h-8 text-green-400 opacity-25" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <svg className="absolute top-1/2 right-10 w-8 h-8 text-rose-400 opacity-25" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>

        <div className="max-w-4xl mx-auto text-center relative z-10">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 text-slate-700 text-sm font-medium mb-8">
            <span className="w-2 h-2 rounded-full bg-orange-500" />
            <span data-edit="hero.tagline">{getValue('hero.tagline', t('heroPage.tagline'))}</span>
          </div>

          {/* Title */}
          <h1
            className="text-slate-900 mb-6"
            style={{ fontSize: 'clamp(32px, 6vw, 56px)', lineHeight: 1.15, fontWeight: 600 }}
          >
            <span data-edit="hero.titleLine1">{getValue('hero.titleLine1', t('heroPage.heroTitleLine1'))}</span>{' '}
            <span data-edit="hero.titleAccent" className="text-orange-500">{getValue('hero.titleAccent', t('heroPage.heroTitleAccent'))}</span>
            <br />
            <span data-edit="hero.titleLine2" className="text-orange-500">{getValue('hero.titleLine2', t('heroPage.heroTitleLine2'))}</span>
          </h1>

          {/* Subtitle */}
          <p
            className="text-slate-600 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed"
            data-edit="hero.subtitle"
          >
            {getValue('hero.subtitle', t('heroPage.heroSubtitle'))}
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 px-8 py-4 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 transition-colors text-base"
              data-edit="cta.button"
            >
              {t('heroPage.heroCtaPrimary')}
              <FaArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 px-8 py-4 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors text-base"
            >
              {t('heroPage.heroCtaSecondary')}
            </Link>
          </div>

          {/* Trust indicators */}
          <div className="flex flex-wrap items-center justify-center gap-6 mt-10 text-sm text-slate-500">
            <span className="flex items-center gap-2">
              <FaCheck className="w-4 h-4 text-green-500" />
              {t('heroPage.heroTrust1')}
            </span>
            <span className="flex items-center gap-2">
              <FaCheck className="w-4 h-4 text-green-500" />
              {t('heroPage.heroTrust2')}
            </span>
            <span className="flex items-center gap-2">
              <FaCheck className="w-4 h-4 text-green-500" />
              {t('heroPage.heroTrust3')}
            </span>
          </div>

          {/* Founder AI Dashboard Mock */}
          <AnimatedSection delay={200}>
            <div className="mt-6">
              <HeroDashboardMock />
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="max-w-6xl mx-auto px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ── SECTION 1: Giải pháp thay đổi cuộc chơi ── */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-28 bg-white relative overflow-hidden">
        {/* Grid background */}
        <div className="absolute inset-0 opacity-[0.3]" style={{
          backgroundColor: '#f8fafc',
          backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }} />
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <div className="text-center mb-16">
            <span className="inline-block px-4 py-1.5 bg-orange-100 text-orange-700 rounded-full text-xs font-bold uppercase tracking-wider mb-4">
              {t('heroPage.section1Badge')}
            </span>
            <h2 className="text-3xl md:text-4xl font-semibold text-slate-900 mb-4">
              {t('heroPage.section1Title')}
            </h2>
            <p className="text-slate-600 max-w-xl mx-auto">
              {t('heroPage.section1Subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-12">
            {features.map((feature, i) => (
              <AnimatedSection key={i} delay={i * 80}>
                <div className="flex gap-4">
                  <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
                    <feature.icon className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">{feature.title}</h3>
                    <p className="text-slate-600 text-sm leading-relaxed mb-3">{feature.description}</p>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 bg-orange-50 px-2 py-1 rounded">
                      {feature.highlight}
                    </span>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ── SECTION 2: Bắt đầu trong 15 phút ── */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="inline-block px-4 py-1.5 bg-slate-200 text-slate-700 rounded-full text-xs font-bold uppercase tracking-wider mb-4">
              {t('heroPage.section2Badge')}
            </span>
            <h2 className="text-3xl md:text-4xl font-semibold text-slate-900 mb-4">
              {t('heroPage.section2Title')}
            </h2>
            <p className="text-slate-600 max-w-lg mx-auto">
              {t('heroPage.section2Subtitle')}
            </p>
          </div>

          {/* Steps với timeline connector */}
          <div className="relative">
            {/* Desktop timeline line */}
            <div className="hidden md:block absolute top-16 left-[12.5%] right-[12.5%] h-0.5 bg-slate-200" />

            <div className="grid md:grid-cols-4 gap-8">
              {steps.map((step, i) => (
                <AnimatedSection key={i} delay={i * 100}>
                  <div className="text-center relative">
                    {/* Step number */}
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white border-2 border-orange-500 text-orange-600 font-bold text-sm mb-6 relative z-10">
                      {step.number}
                    </div>
                    {/* Icon */}
                    <div className="w-10 h-10 mx-auto mb-4 flex items-center justify-center text-slate-400">
                      <step.icon className="w-5 h-5" />
                    </div>
                    {/* Content */}
                    <h3 className="text-base font-semibold text-slate-900 mb-2">{step.title}</h3>
                    <p className="text-sm text-slate-600 leading-relaxed">{step.description}</p>
                  </div>
                </AnimatedSection>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="max-w-6xl mx-auto px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ── SECTION 2.5: Xem chiến dịch chạy ntn trong hệ thống ── */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-28 bg-white relative overflow-hidden">
        {/* Grid background */}
        <div className="absolute inset-0 opacity-[0.3]" style={{
          backgroundColor: '#f8fafc',
          backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }} />
        <div className="max-w-5xl mx-auto px-6 relative z-10">
          <CampaignFlowLauncher t={t} />

          <div className="mt-10 max-w-2xl mx-auto">
            <div className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 rounded-xl p-4">
              <p className="text-xs text-orange-900 leading-relaxed">
                <span className="font-semibold">💡 {t('heroPage.campaignDemo.tipTitle') || 'Mẹo:'}</span>{' '}
                {t('heroPage.campaignDemo.tipContent') || 'Bạn có thể chạy đồng thời cả 3 loại chiến dịch để tiếp cận khách hàng đa kênh, tăng hiệu quả chuyển đổi lên đến 3 lần.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="max-w-6xl mx-auto px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ── SECTION 3: Tại sao chọn Founder AI? ── */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-28 bg-white relative overflow-hidden">
        {/* Grid background */}
        <div className="absolute inset-0 opacity-[0.3]" style={{
          backgroundColor: '#f8fafc',
          backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }} />
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16 relative z-10">
          <h2 className="text-[26px] md:text-[34px] font-semibold text-slate-900 mb-4 whitespace-nowrap">
            {t('heroPage.section3Title')}
          </h2>
            <p className="text-slate-600 max-w-lg mx-auto">
              {t('heroPage.section3Subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {benefits.map((b, i) => (
              <AnimatedSection key={i} delay={i * 80}>
                <div className="h-full text-center p-6 rounded-2xl border border-slate-200 hover:border-orange-200 hover:bg-orange-50/30 transition-colors relative z-10 flex flex-col items-center">
                  <div className="w-14 h-14 mb-5 flex items-center justify-center bg-orange-100 rounded-xl shrink-0">
                    <b.icon className="w-6 h-6 text-orange-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-3 min-h-[3.5rem] flex items-center">{b.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed min-h-[3rem]">{b.description}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="max-w-6xl mx-auto px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ── SECTION 4: Đơn vị phát triển ── */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-24 bg-white relative overflow-hidden">
        {/* Grid background */}
        <div className="absolute inset-0 opacity-[0.3]" style={{
          backgroundColor: '#f8fafc',
          backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }} />
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <span className="inline-block px-4 py-1.5 bg-slate-100 text-slate-600 rounded-full text-xs font-bold uppercase tracking-wider mb-6">
            {t('heroPage.section4Badge')}
          </span>
          <div className="flex items-center justify-center mb-4">
            <img
              src="/logo-digiso.png"
              alt="DIGISO Logo"
              className="h-16 md:h-20 w-auto"
            />
          </div>

          <p className="text-slate-600 text-lg max-w-xl mx-auto mb-8 leading-relaxed text-center">
            {t('heroPage.section4Desc')}{' '}
            <span className="font-semibold text-slate-900 whitespace-nowrap">{t('heroPage.section4CompanyName')}</span>.
          </p>

          <a
            href="https://digiso.vn"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600 transition-colors text-sm"
          >
            {t('heroPage.section4Button')}
            <FaArrowRight className="w-4 h-4" />
          </a>
        </div>
      </section>

      <PublicFooter />

      <HeroChatWidget />

      <CampaignFlowModal
        open={campaignModalOpen}
        flowKey={campaignModalFlow}
        onClose={() => setCampaignModalOpen(false)}
      />
    </div>
  );
}

// Component bấm nút để mở modal mô phỏng campaign flow
function CampaignFlowLauncher({ t }) {
  const [hovered, setHovered] = useState(null);

  const campaigns = [
    {
      key: 'email',
      title: t('heroPage.campaignDemo.emailTitle') || 'Email Marketing',
      desc: t('heroPage.campaignDemo.emailDesc') || 'Gửi email hàng loạt, theo dõi mở/click/chuyển đổi',
      icon: HiOutlineMail,
      gradient: 'from-orange-400 via-orange-500 to-amber-500',
      lightBg: 'bg-orange-50',
      border: 'border-orange-200',
      hoverBorder: 'hover:border-orange-400',
      textColor: 'text-orange-900',
      iconBg: 'bg-orange-100',
      iconColor: 'text-orange-600',
      btnBg: 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600',
      chipBg: 'bg-orange-50 text-orange-700',
      stats: ['1.250 khách', '8 node', '~12 phút'],
    },
    {
      key: 'zalo',
      title: t('heroPage.campaignDemo.zaloPersonalTitle') || 'Zalo cá nhân',
      desc: t('heroPage.campaignDemo.zaloPersonalDesc') || 'Gửi tin nhắn qua Zalo OA đến từng khách hàng',
      icon: HiOutlineChatAlt2,
      gradient: 'from-orange-500 to-red-500',
      lightBg: 'bg-orange-50',
      border: 'border-orange-200',
      hoverBorder: 'hover:border-red-400',
      textColor: 'text-slate-900',
      iconBg: 'bg-orange-100',
      iconColor: 'text-red-500',
      btnBg: 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600',
      chipBg: 'bg-orange-50 text-orange-700',
      stats: ['480 khách', '8 node', '~14 phút'],
    },
    {
      key: 'zalo_group',
      title: t('heroPage.campaignDemo.zaloGroupTitle') || 'Zalo nhóm',
      desc: t('heroPage.campaignDemo.zaloGroupDesc') || 'Đăng bài vào các nhóm Zalo đã tham gia',
      icon: HiOutlineUserGroup,
      gradient: 'from-red-500 to-rose-600',
      lightBg: 'bg-red-50',
      border: 'border-red-200',
      hoverBorder: 'hover:border-rose-400',
      textColor: 'text-red-900',
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
      btnBg: 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700',
      chipBg: 'bg-red-50 text-red-700',
      stats: ['25 nhóm', '7 node', '~16 phút'],
    },
  ];

  const openFlow = (key) => {
    window.dispatchEvent(new CustomEvent('open-campaign-flow', { detail: { flowKey: key } }));
  };

  return (
    <div>
      {/* Header text */}
      <div className="text-center mb-10">
        <span className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-orange-100 text-orange-700 rounded-full text-xs font-bold uppercase tracking-wider mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
          {t('heroPage.campaignDemoBadge') || 'Live Demo'}
        </span>
        <h2 className="text-3xl md:text-4xl font-semibold text-slate-900 mb-4">
          {t('heroPage.campaignDemoTitle') || 'Chiến dịch chạy như thế nào?'}
        </h2>
        <p className="text-slate-600 max-w-2xl mx-auto">
          {t('heroPage.campaignDemoSubtitle') || 'Xem chi tiết các bước (node) mà mỗi chiến dịch sẽ chạy trong hệ thống Founder AI. Bấm vào từng loại để xem mô phỏng trực quan.'}
        </p>
      </div>

      {/* 3 campaign buttons */}
      <div className="grid md:grid-cols-3 gap-5">
        {campaigns.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => openFlow(c.key)}
              onMouseEnter={() => setHovered(c.key)}
              onMouseLeave={() => setHovered(null)}
              className={`group relative text-left bg-white rounded-2xl border-2 ${c.border} ${c.hoverBorder} p-6 transition-all hover:shadow-xl hover:-translate-y-1 overflow-hidden`}
            >
              {/* Decorative gradient strip */}
              <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${c.gradient}`} />

              <div className={`w-14 h-14 rounded-xl ${c.iconBg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <Icon className={`w-7 h-7 ${c.iconColor}`} />
              </div>
              <h3 className={`text-lg font-bold text-slate-900 mb-2`}>{c.title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed mb-4 min-h-[3rem]">
                {c.desc}
              </p>

              <div className="flex items-center gap-2 text-[10px] text-slate-500 mb-4">
                {c.stats.map((s, i) => (
                  <span key={i} className={`px-2 py-0.5 ${c.chipBg} rounded-md font-medium`}>
                    {s}
                  </span>
                ))}
              </div>

              <div className={`flex items-center justify-between px-4 py-2.5 ${c.btnBg} text-white rounded-xl font-semibold text-sm shadow-sm group-hover:shadow-md transition-all`}>
                <span className="flex items-center gap-2">
                  <HiOutlinePlay className="w-4 h-4" />
                  Xem mô phỏng
                </span>
                <HiOutlineSparkles className={`w-4 h-4 transition-transform ${hovered === c.key ? 'translate-x-1' : ''}`} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
