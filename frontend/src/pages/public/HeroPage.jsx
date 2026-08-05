import { Link } from 'react-router-dom';
import {
  FaEnvelope, FaComments, FaUsers, FaChartBar, FaBolt, FaShieldAlt,
  FaRocket, FaHeadset, FaCheck, FaArrowRight,
  FaLaptop, FaMagic, FaChartLine, FaLock,
  FaBullseye, FaHandshake, FaClock, FaTools,
} from 'react-icons/fa';
import HeroNavbar from './components/HeroNavbar';
import PublicFooter from './components/PublicFooter';
import HeroDashboardMock from './components/HeroDashboardMock';
import AnimatedSection from '../../components/AnimatedSection';
import { useI18n } from '../../i18n';
import { usePublicLandingOverrides } from '../../features/landing-customizer';

// Features data - có thể thay đổi theo sản phẩm thật
const features = [
  {
    icon: FaLaptop,
    title: 'Tạo trang đích chuyên nghiệp',
    description: 'Không cần biết code. Kéo thả để tạo landing page, form thu thập lead, trang bán hàng.',
    highlight: 'Chỉ mất 10 phút',
  },
  {
    icon: FaEnvelope,
    title: 'Gửi email marketing hàng loạt',
    description: 'Thiết kế email đẹp, gửi cho hàng nghìn khách hàng cùng lúc. Theo dõi tỷ lệ mở và click.',
    highlight: 'Tỷ lệ vào inbox cao',
  },
  {
    icon: FaComments,
    title: 'Nhắn tin Zalo tự động',
    description: 'Kết nối nhiều tài khoản Zalo. Gửi tin nhắn tự động, nuôi dưỡng khách hàng không cần ngồi máy.',
    highlight: 'Tiết kiệm 20+ giờ/tuần',
  },
  {
    icon: FaUsers,
    title: 'Quản lý khách hàng tiềm năng',
    description: 'Lưu trữ thông tin, phân loại theo mức độ quan tâm. Không để khách hàng rơi vào quên lãng.',
    highlight: 'Mọi lead đều được chăm sóc',
  },
  {
    icon: FaChartLine,
    title: 'Báo cáo doanh thu rõ ràng',
    description: 'Biết chính xác chiến dịch nào mang lại đơn hàng. Tối ưu ngân sách marketing dựa trên số liệu thật.',
    highlight: 'ROI rõ ràng',
  },
  {
    icon: FaLock,
    title: 'Dữ liệu được bảo mật',
    description: 'Hạ tầng cloud với backup tự động. Khách hàng của bạn là khách hàng của bạn, không ai khác được đọc.',
    highlight: 'An toàn tuyệt đối',
  },
];

// How it works - quy trình đơn giản hóa
const steps = [
  {
    number: '01',
    title: 'Tạo tài khoản miễn phí',
    description: 'Đăng ký bằng email, không cần thẻ tín dụng. Bắt đầu dùng ngay.',
    icon: FaBolt,
  },
  {
    number: '02',
    title: 'Kết nối kênh của bạn',
    description: 'Thêm email và tài khoản Zalo cần dùng. Mất khoảng 5 phút.',
    icon: FaTools,
  },
  {
    number: '03',
    title: 'Tạo chiến dịch đầu tiên',
    description: 'Dùng template có sẵn hoặc tự thiết kế. Hệ thống sẽ hướng dẫn từng bước.',
    icon: FaBullseye,
  },
  {
    number: '04',
    title: 'Theo dõi và tối ưu',
    description: 'Xem kết quả trong dashboard. Điều chỉnh nội dung để tăng hiệu quả.',
    icon: FaChartBar,
  },
];

// Benefits - Tại sao chọn Founder AI
const benefits = [
  {
    icon: FaBolt,
    title: 'Khởi tạo nhanh',
    description: 'Đăng ký và chạy chiến dịch đầu tiên trong 15 phút. Không cần đội kỹ thuật.',
  },
  {
    icon: FaRocket,
    title: 'Tự động hóa thông minh',
    description: 'AI tự phân loại khách hàng, gửi tin nhắn đúng thời điểm, nuôi dưỡng lead 24/7.',
  },
  {
    icon: FaChartLine,
    title: 'Đo lường rõ ràng',
    description: 'Dashboard trực quan, theo dõi tỷ lệ mở email, click, chuyển đổi theo thời gian thực.',
  },
  {
    icon: FaHeadset,
    title: 'Hỗ trợ tiếng Việt',
    description: 'Đội ngũ hỗ trợ trực tiếp qua Zalo, điện thoại. Giải đáp trong vài phút.',
  },
];

export default function HeroPage() {
  const { t, locale } = useI18n();
  const { getOverride } = usePublicLandingOverrides('hero');

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
              Dùng thử miễn phí
              <FaArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 px-8 py-4 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors text-base"
            >
              Xem bảng giá
            </Link>
          </div>

          {/* Trust indicators */}
          <div className="flex flex-wrap items-center justify-center gap-6 mt-10 text-sm text-slate-500">
            <span className="flex items-center gap-2">
              <FaCheck className="w-4 h-4 text-green-500" />
              Dùng thử 14 ngày
            </span>
            <span className="flex items-center gap-2">
              <FaCheck className="w-4 h-4 text-green-500" />
              Không cần thẻ tín dụng
            </span>
            <span className="flex items-center gap-2">
              <FaCheck className="w-4 h-4 text-green-500" />
              Hủy bất kỳ lúc nào
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
              GIẢI PHÁP
            </span>
            <h2 className="text-3xl md:text-4xl font-semibold text-slate-900 mb-4">
              Thay đổi cách bạn bán hàng
            </h2>
            <p className="text-slate-600 max-w-xl mx-auto">
              Thay vì chạy theo từng khách hàng, để hệ thống tự động tiếp cận và chăm sóc họ.
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
              BẮT ĐẦU NHANH
            </span>
            <h2 className="text-3xl md:text-4xl font-semibold text-slate-900 mb-4">
              Chỉ cần 15 phút để chạy chiến dịch đầu tiên
            </h2>
            <p className="text-slate-600 max-w-lg mx-auto">
              Không cần đọc tài liệu dài. Hệ thống hướng dẫn bạn từng bước.
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
          <h2 className="text-3xl md:text-4xl font-semibold text-slate-900 mb-4">
            Tại sao chọn Founder AI?
          </h2>
            <p className="text-slate-600 max-w-lg mx-auto">
              Những gì chúng tôi đảm bảo khi bạn sử dụng dịch vụ.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {benefits.map((b, i) => (
              <AnimatedSection key={i} delay={i * 80}>
                <div className="text-center p-6 rounded-2xl border border-slate-200 hover:border-orange-200 hover:bg-orange-50/30 transition-colors relative z-10">
                  <div className="w-14 h-14 mx-auto mb-5 flex items-center justify-center bg-orange-100 rounded-xl">
                    <b.icon className="w-6 h-6 text-orange-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-3">{b.title}</h3>
                  <p className="text-sm text-slate-600">{b.description}</p>
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
            Đơn vị phát triển
          </span>
          <div className="flex items-center justify-center mb-4">
            <img
              src="/logo-digiso.png"
              alt="DIGISO Logo"
              className="h-16 md:h-20 w-auto"
            />
          </div>

          <p className="text-slate-600 text-lg max-w-xl mx-auto mb-8 leading-relaxed">
            Founder AI là sản phẩm thuộc sở hữu của <span className="font-semibold text-slate-900">Công ty TNHH Giải pháp Số DIGISO</span>. 
          </p>

          <a
            href="https://digiso.vn"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600 transition-colors text-sm"
          >
            Tìm hiểu thêm về DIGISO
            <FaArrowRight className="w-4 h-4" />
          </a>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
