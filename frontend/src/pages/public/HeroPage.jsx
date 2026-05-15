import { Link } from 'react-router-dom';
import { LuChevronRight } from 'react-icons/lu';
import {
  FaEnvelope, FaComments, FaUsers, FaChartBar, FaBolt, FaShieldAlt,
  FaRocket, FaHandshake, FaHeadset, FaCheckCircle,
  FaCogs, FaLaptopCode,
} from 'react-icons/fa';
import HeroNavbar from './components/HeroNavbar';
import HeroDashboardMock from './components/HeroDashboardMock';
import AnimatedSection from '../../components/AnimatedSection';
import TestimonialSlider from './components/TestimonialSlider';
import Footer from '../../components/layout/client/Footer';


const features = [
  { icon: FaLaptopCode, title: 'Landing Page Builder', description: 'Trình kéo thả thông minh, cho phép thiết kế Landing Page đạt chuẩn SEO và tỷ lệ chuyển đổi cao trong 5 phút.', color: 'from-orange-500 to-red-500' },
  { icon: FaEnvelope, title: 'Email Marketing', description: 'Thiết kế và gửi email marketing chuyên nghiệp với template đa dạng, theo dõi tỷ lệ mở và click.', color: 'from-red-500 to-rose-500' },
  { icon: FaComments, title: 'Zalo Automation', description: 'Tự động gửi tin nhắn Zalo ZNS/OA, quản lý nhiều tài khoản và kịch bản chăm sóc khách hàng.', color: 'from-amber-500 to-orange-500' },
  { icon: FaUsers, title: 'CRM & Quản lý Lead', description: 'Tập trung toàn bộ dữ liệu Lead về một nơi. Phân loại, chấm điểm và theo dõi hành trình khách hàng.', color: 'from-rose-400 to-red-500' },
  { icon: FaChartBar, title: 'Báo cáo Thời gian thực', description: 'Thống kê chi tiết về hiệu quả chiến dịch, tỷ lệ chuyển đổi, và doanh thu theo thời gian thực.', color: 'from-orange-400 to-amber-500' },
  { icon: FaShieldAlt, title: 'Bảo mật Cấp Doanh nghiệp', description: 'Dữ liệu khách hàng được mã hóa và bảo vệ an toàn tuyệt đối trên hạ tầng Cloud.', color: 'from-slate-600 to-slate-800' },
];

const stats = [
  { value: '1,500+', label: 'Doanh nghiệp tin dùng' },
  { value: '5M+', label: 'Lead được xử lý' },
  { value: '500+', label: 'Chiến dịch mỗi ngày' },
  { value: '99.9%', label: 'Cam kết Uptime' },
];

const steps = [
  { number: '01', title: 'Tích hợp & Khởi tạo', description: 'Tạo tài khoản nhanh chóng, kết nối kênh Email và Zalo của doanh nghiệp bạn.', icon: FaBolt },
  { number: '02', title: 'Xây dựng Kịch bản', description: 'Sử dụng công cụ tạo luồng (workflow) để thiết lập hành trình khách hàng tự động.', icon: FaCogs },
  { number: '03', title: 'Thu Lead & Nuôi dưỡng', description: 'Khởi chạy Landing Page và để hệ thống tự động theo dõi, chăm sóc từng khách hàng.', icon: FaRocket },
  { number: '04', title: 'Phân tích & Tối ưu', description: 'Sử dụng báo cáo để cải thiện thông điệp và tăng vọt tỷ lệ chốt đơn.', icon: FaChartBar },
];

const benefits = [
  { icon: FaRocket, title: 'Triển khai siêu tốc', desc: 'Sẵn sàng sử dụng trong 5 phút' },
  { icon: FaHeadset, title: 'Hỗ trợ chuyên gia', desc: 'Đội ngũ tư vấn chiến lược 24/7' },
  { icon: FaHandshake, title: 'Tăng trưởng bền vững', desc: 'Cam kết tối ưu tỷ lệ chuyển đổi' },
  { icon: FaCheckCircle, title: 'Giao diện tinh gọn', desc: 'Dễ dàng sử dụng cho mọi nhân sự' },
];

export default function HeroPage() {
  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif' }} className="relative">

      {/* ── City video background ── */}
      <video
        className="fixed inset-0 w-full h-full object-cover pointer-events-none"
        style={{ zIndex: -1 }}
        src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260403_050628_c4e32401-fab4-4a27-b7a8-6e9291cd5959.mp4"
        autoPlay loop muted playsInline preload="auto"
      />

      {/* ── Hero Section ── */}
      <div className="min-h-screen flex flex-col">
        <HeroNavbar />

        <div className="flex flex-col items-center px-4 pt-10 sm:pt-14 pb-6 sm:pb-10 text-center">
          <div className="inline-flex items-center gap-2 liquid-glass border border-white/20 rounded-full px-4 py-1.5 text-[13px] font-medium text-white">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#ef4d23' }} />
            Founder AI
          </div>

          <h1
            className="mt-5 sm:mt-6 max-w-4xl text-white"
            style={{ fontSize: 'clamp(32px, 7vw, 68px)', lineHeight: 1.05, fontWeight: 500, letterSpacing: '-0.02em' }}
          >
            Shaping{' '}
            <span style={{ fontFamily: "'Georgia', serif", fontStyle: 'italic', fontWeight: 400 }}>Marketing</span>
            <br />of tomorrow
          </h1>

          <p
            className="mt-4 sm:mt-5 text-white/70 px-2 max-w-xl"
            style={{ fontSize: 'clamp(13px, 3vw, 16px)' }}
          >
            The All-In-One Software Powering the Future of Marketing Automation
          </p>

          <Link
            to="/register"
            className="mt-5 sm:mt-7 inline-flex items-center gap-3 liquid-glass text-white rounded-full pl-6 sm:pl-7 pr-2 py-2 sm:py-2.5 text-[14px] font-medium hover:opacity-90 transition-opacity border border-white/20"
          >
            Get Started
            <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
              <LuChevronRight className="w-4 h-4" />
            </span>
          </Link>
        </div>

        {/* Dashboard — fade out ở bottom */}
        <div className="flex-1 flex items-end relative">
          <HeroDashboardMock />
          <div className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.15), transparent)' }} />
        </div>
      </div>

      {/* ── Stats ── */}
      <section className="py-20 relative">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 divide-x divide-white/20">
            {stats.map((stat, i) => (
              <AnimatedSection key={i} delay={i * 100} className="text-center px-4">
                <div className="text-4xl md:text-5xl font-black text-white mb-2">{stat.value}</div>
                <div className="text-white/70 font-semibold text-sm uppercase tracking-wider">{stat.label}</div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-32 relative">
        <div className="absolute inset-0 bg-white/70 backdrop-blur-md" />
        <div className="relative max-w-7xl mx-auto px-6">
          <AnimatedSection className="text-center mb-20 max-w-3xl mx-auto">
            <span className="inline-block px-4 py-2 bg-orange-100 text-orange-700 rounded-full font-bold text-sm tracking-wide uppercase mb-6 border border-orange-200">
              TÍNH NĂNG NỔI BẬT
            </span>
            <h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-6 tracking-tight">
              Giải pháp <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-red-500">toàn diện</span>
            </h2>
            <p className="text-xl text-slate-600 leading-relaxed">
              Mọi công cụ bạn cần để xây dựng một phễu Marketing khép kín và tự động hoàn toàn.
            </p>
          </AnimatedSection>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, i) => (
              <AnimatedSection key={i} delay={i * 100}>
                <div className="group h-full bg-white/80 backdrop-blur-sm rounded-[2rem] p-8 shadow-sm border border-white/60 hover:shadow-xl transition-all duration-300 hover:-translate-y-2">
                  <div className={`w-16 h-16 bg-gradient-to-br ${feature.color} rounded-2xl flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
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

      {/* ── How it works ── */}
      <section className="py-32 relative">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
        <div className="relative max-w-7xl mx-auto px-6">
          <AnimatedSection className="text-center mb-24 max-w-3xl mx-auto">
            <span className="inline-block px-4 py-2 bg-white/20 text-white rounded-full font-bold text-sm tracking-wide uppercase mb-6 border border-white/30">
              QUY TRÌNH 4 BƯỚC
            </span>
            <h2 className="text-4xl md:text-5xl font-black text-white mb-6 tracking-tight">
              Lên camp <span className="text-orange-400">trong phút chốc</span>
            </h2>
          </AnimatedSection>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-12">
            {steps.map((step, i) => (
              <AnimatedSection key={i} delay={i * 150} className="text-center">
                <div className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-[2rem] flex items-center justify-center mx-auto mb-6 border border-white/30">
                  <step.icon className="w-9 h-9 text-orange-400" />
                </div>
                <div className="text-sm font-black text-orange-400 uppercase tracking-widest mb-3">Bước {step.number}</div>
                <h3 className="text-xl font-bold text-white mb-3">{step.title}</h3>
                <p className="text-white/70 leading-relaxed">{step.description}</p>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ── Benefits + CTA ── */}
      <section className="py-32 relative">
        <div className="absolute inset-0 bg-white/75 backdrop-blur-md" />
        <div className="relative max-w-7xl mx-auto px-6">
          <AnimatedSection className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-6">Tại sao chọn Founder AI?</h2>
          </AnimatedSection>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-20">
            {benefits.map((b, i) => (
              <AnimatedSection key={i} delay={i * 100}>
                <div className="bg-white/70 backdrop-blur-sm rounded-3xl p-8 border border-white/60 text-center hover:bg-white/90 transition-all h-full shadow-sm">
                  <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <b.icon className="w-8 h-8 text-orange-500" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-3">{b.title}</h3>
                  <p className="text-slate-600">{b.desc}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>

          <AnimatedSection>
            <div className="bg-gradient-to-r from-orange-600 to-red-600 rounded-[3rem] p-10 md:p-16 shadow-2xl max-w-5xl mx-auto relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
              <div className="flex flex-col md:flex-row items-center justify-between gap-12 relative z-10">
                <div>
                  <h3 className="text-3xl md:text-4xl font-black text-white mb-4">Sẵn sàng để tự động hóa?</h3>
                  <p className="text-orange-100 text-lg">Đăng ký ngay hôm nay để nhận quyền lợi cao cấp nhất.</p>
                </div>
                <div className="shrink-0 flex flex-col items-center gap-4">
                  <Link
                    to="/login"
                    className="px-10 py-5 bg-white text-orange-600 rounded-full font-bold text-xl shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1 block text-center"
                  >
                    Tạo tài khoản miễn phí
                  </Link>
                  <span className="text-orange-100 text-sm font-medium flex items-center gap-2">
                    <FaCheckCircle /> Mất chưa tới 1 phút
                  </span>
                </div>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="py-32 relative">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <div className="relative max-w-7xl mx-auto px-6">
          <AnimatedSection className="text-center mb-20">
            <span className="inline-block px-4 py-2 bg-white/20 text-white rounded-full font-bold text-sm tracking-wide uppercase mb-6 border border-white/30">
              ĐÁNH GIÁ THỰC TẾ
            </span>
            <h2 className="text-4xl md:text-5xl font-black text-white mb-6 tracking-tight">
              Được yêu thích bởi <br />
              <span className="text-orange-400">Người trong ngành</span>
            </h2>
          </AnimatedSection>
          <TestimonialSlider />
        </div>
      </section>

      <Footer />
    </div>
  );
}
