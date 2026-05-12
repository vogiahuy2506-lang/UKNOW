import { Link } from 'react-router-dom';
import {
  FaEnvelope, FaComments, FaUsers, FaChartBar, FaBolt, FaShieldAlt,
  FaRocket, FaHandshake, FaHeadset, FaCheckCircle, FaArrowRight,
  FaPlay, FaStar, FaLaptopCode, FaCogs
} from 'react-icons/fa';

import AnimatedSection from '../../components/AnimatedSection';
import TestimonialSlider from './components/TestimonialSlider';

// ─── Static data ────────────────────────────────────────────────────────────

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

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AboutPage() {
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
            <span className="text-orange-700 font-bold text-sm tracking-wide uppercase">Nền tảng Automation All-in-One</span>
          </div>

          <h1 className="animate-slide-up-delay-1 text-5xl md:text-7xl lg:text-8xl font-black mb-8 leading-[1.1] text-slate-900 tracking-tight">
            Vận Hành Marketing<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-red-600">
              Tự Động & Đột Phá
            </span>
          </h1>

          <p className="animate-slide-up-delay-2 text-xl md:text-2xl text-slate-600 max-w-3xl mx-auto mb-12 leading-relaxed">
            Founder AI cung cấp giải pháp xây dựng Landing Page, quản lý Lead và thiết lập chuỗi Email/Zalo tự động. Giải phóng nhân sự, <strong className="text-slate-900">X10 doanh thu.</strong>
          </p>

          <div className="animate-slide-up-delay-3 flex flex-col sm:flex-row justify-center items-center gap-4 mb-20">
            <Link
              to="/login"
              className="w-full sm:w-auto px-10 py-5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-full font-bold text-lg hover:shadow-xl hover:shadow-orange-500/30 transition-all flex items-center justify-center gap-3 transform hover:scale-105"
            >
              Trải nghiệm miễn phí
              <FaArrowRight />
            </Link>
            <a
              href="#features"
              className="w-full sm:w-auto px-10 py-5 bg-white text-slate-700 rounded-full font-bold text-lg border border-slate-200 hover:bg-orange-50 hover:border-orange-200 transition-all flex items-center justify-center gap-3 shadow-sm"
            >
              <FaPlay className="text-orange-500" />
              Xem tính năng
            </a>
          </div>

          <div className="animate-slide-up-delay-3 pt-10 border-t border-slate-100 flex flex-wrap justify-center items-center gap-12 opacity-60 grayscale">
            <span className="font-bold text-slate-500 text-sm tracking-widest uppercase">Đối tác tin cậy:</span>
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
            {stats.map((stat, index) => (
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
              TÍNH NĂNG NỔI BẬT
            </span>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-slate-900 mb-6 tracking-tight">
              Giải pháp <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-red-500">toàn diện</span>
            </h2>
            <p className="text-xl text-slate-600 leading-relaxed">
              Mọi công cụ bạn cần để xây dựng một phễu Marketing khép kín và tự động hoàn toàn.
            </p>
          </AnimatedSection>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
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
              QUY TRÌNH 4 BƯỚC
            </span>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-slate-900 mb-6 tracking-tight">
              Lên camp <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-red-500">trong phút chốc</span>
            </h2>
            <p className="text-xl text-slate-600 leading-relaxed">
              Khởi tạo chiến dịch nhanh chóng không cần kiến thức kỹ thuật phức tạp.
            </p>
          </AnimatedSection>

          <div className="relative">
            {/* Horizontal Line connecting steps on large screens */}
            <div className="hidden lg:block absolute top-[40%] left-[10%] right-[10%] h-1 bg-gradient-to-r from-orange-100 via-red-300 to-orange-100 z-0 rounded-full" />

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-12 relative z-10">
              {steps.map((step, index) => (
                <AnimatedSection key={index} delay={index * 150} className="text-center">
                  <div className="w-24 h-24 bg-white rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-xl border border-slate-100 hover:scale-110 transition-transform duration-300 group">
                    <div className="absolute inset-0 bg-gradient-to-br from-orange-500 to-red-500 rounded-[2rem] opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <step.icon className="w-10 h-10 text-orange-500 group-hover:text-white relative z-10 transition-colors" />
                  </div>
                  <div className="text-sm font-black text-orange-400 uppercase tracking-widest mb-3">Bước {step.number}</div>
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
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-6">Tại sao chọn Founder AI?</h2>
            <p className="text-xl text-orange-200 max-w-2xl mx-auto">Đồng hành cùng doanh nghiệp bạn trên chặng đường số hóa.</p>
          </AnimatedSection>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-20">
            {benefits.map((benefit, index) => (
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
                  <h3 className="text-3xl md:text-4xl font-black text-white mb-4">Sẵn sàng để tự động hóa?</h3>
                  <p className="text-orange-100 text-lg">Đăng ký ngay hôm nay để nhận quyền lợi cao cấp nhất.</p>
                </div>
                <div className="shrink-0 flex flex-col items-center gap-4">
                  <Link
                    to="/login"
                    className="px-10 py-5 bg-white text-orange-600 rounded-full font-bold text-xl shadow-xl hover:shadow-2xl transition-all transform hover:-translate-y-1 block text-center w-full"
                  >
                    Tạo tài khoản miễn phí
                  </Link>
                  <span className="text-orange-100 text-sm font-medium flex items-center gap-2"><FaCheckCircle /> Mất chưa tới 1 phút</span>
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
              ĐÁNH GIÁ THỰC TẾ
            </span>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-slate-900 mb-6 tracking-tight">
              Được yêu thích bởi <br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-red-500">Người trong ngành</span>
            </h2>
          </AnimatedSection>
          <TestimonialSlider />
        </div>
      </section>

    </div>
  );
}
