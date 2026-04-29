import { Link } from 'react-router-dom';
import {
  FaEnvelope, FaComments, FaUsers, FaChartBar, FaBolt, FaShieldAlt,
  FaRocket, FaHandshake, FaHeadset, FaCheckCircle, FaArrowRight,
  FaPlay, FaStar,
} from 'react-icons/fa';

import AnimatedSection from '../../components/AnimatedSection';
import TestimonialSlider from './components/TestimonialSlider';
import PricingSection from './components/PricingSection';

// ─── Static data ────────────────────────────────────────────────────────────

const features = [
  { icon: FaEnvelope, title: 'Email Marketing', description: 'Thiết kế và gửi email marketing chuyên nghiệp với template đa dạng, theo dõi tỷ lệ mở và click.', color: 'from-orange-500 to-red-500' },
  { icon: FaComments, title: 'Zalo Marketing', description: 'Tự động gửi tin nhắn Zalo OA, quản lý nhiều tài khoản, theo dõi phản hồi khách hàng.', color: 'from-blue-500 to-blue-600' },
  { icon: FaUsers, title: 'Quản lý Khách hàng', description: 'Lưu trữ và phân loại khách hàng theo nhiều tiêu chí, theo dõi hành trình khách hàng.', color: 'from-purple-500 to-pink-500' },
  { icon: FaChartBar, title: 'Báo cáo Chi tiết', description: 'Thống kê chi tiết về chiến dịch, tỷ lệ chuyển đổi, doanh thu theo thời gian thực.', color: 'from-green-500 to-emerald-500' },
  { icon: FaBolt, title: 'Tự động hóa', description: 'Thiết lập kịch bản tự động gửi tin nhắn theo điều kiện, tiết kiệm thời gian.', color: 'from-yellow-500 to-amber-500' },
  { icon: FaShieldAlt, title: 'Bảo mật Cao', description: 'Dữ liệu khách hàng được mã hóa và bảo vệ an toàn theo tiêu chuẩn quốc tế.', color: 'from-cyan-500 to-teal-500' },
];

const stats = [
  { value: '10,000+', label: 'Khách hàng' },
  { value: '1M+', label: 'Email đã gửi' },
  { value: '500+', label: 'Chiến dịch' },
  { value: '99.9%', label: 'Uptime' },
];

const steps = [
  { number: '01', title: 'Đăng ký & Thiết lập', description: 'Tạo tài khoản nhanh chóng, kết nối email và tài khoản Zalo OA.', icon: FaBolt },
  { number: '02', title: 'Tạo Chiến dịch', description: 'Sử dụng drag-drop builder để tạo kịch bản marketing tự động.', icon: FaRocket },
  { number: '03', title: 'Chạy & Theo dõi', description: 'Khởi chạy chiến dịch và theo dõi kết quả real-time.', icon: FaChartBar },
  { number: '04', title: 'Tối ưu & Mở rộng', description: 'Phân tích dữ liệu, tối ưu chiến dịch và mở rộng quy mô.', icon: FaStar },
];

const benefits = [
  { icon: FaRocket, title: 'Triển khai nhanh', desc: 'Bắt đầu trong 5 phút' },
  { icon: FaHeadset, title: 'Hỗ trợ 24/7', desc: 'Luôn sẵn sàng giúp đỡ' },
  { icon: FaHandshake, title: 'Cam kết chất lượng', desc: 'Đảm bảo hiệu quả' },
  { icon: FaCheckCircle, title: 'Dễ sử dụng', desc: 'Giao diện thân thiện' },
];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <style>{`
        @keyframes float { 0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.5; } 50% { transform: translateY(-20px) rotate(180deg); opacity: 1; } }
        @keyframes gradient { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        @keyframes slide-up { from { opacity: 0; transform: translateY(100px); } to { opacity: 1; transform: translateY(0); } }
        .animate-float { animation: float 10s ease-in-out infinite; }
        .animate-gradient { background-size: 200% 200%; animation: gradient 8s ease infinite; }
        .animate-slide-up { animation: slide-up 1s ease forwards; }
        .animate-slide-up-delay-1 { animation: slide-up 1s ease 0.2s forwards; opacity: 0; }
        .animate-slide-up-delay-2 { animation: slide-up 1s ease 0.4s forwards; opacity: 0; }
        .animate-slide-up-delay-3 { animation: slide-up 1s ease 0.6s forwards; opacity: 0; }
      `}</style>


      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-50 via-white to-red-50" />
        <div className="absolute top-20 left-10 w-72 h-72 bg-orange-200/30 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-red-200/30 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-orange-100/20 rounded-full blur-3xl" />

        <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="animate-slide-up inline-flex items-center gap-2 px-4 py-2 bg-orange-100 rounded-full mb-8">
            <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
            <span className="text-orange-700 font-medium">Nền tảng Marketing hàng đầu Việt Nam</span>
          </div>

          <h1 className="animate-slide-up-delay-1 text-5xl md:text-7xl lg:text-8xl font-black mb-6 leading-tight">
            <span className="bg-gradient-to-r from-orange-600 via-red-500 to-orange-600 bg-clip-text text-transparent animate-gradient">
              Marketing Automation
            </span>
            <br />
            <span className="text-gray-800">cho doanh nghiệp</span>
            <span className="text-orange-500"> hiện đại</span>
          </h1>

          <p className="animate-slide-up-delay-2 text-xl md:text-2xl text-gray-600 max-w-3xl mx-auto mb-12">
            UKNOW Campaign giúp bạn quản lý chiến dịch email và Zalo marketing một cách{' '}
            <span className="text-orange-500 font-semibold">chuyên nghiệp</span>, tiết kiệm{' '}
            <span className="text-orange-500 font-semibold">70% thời gian</span> và tăng{' '}
            <span className="text-orange-500 font-semibold">300% hiệu quả</span>.
          </p>

          <div className="animate-slide-up-delay-3 flex flex-col sm:flex-row justify-center gap-4 mb-16">
            <Link
              to="/login"
              className="group px-8 py-5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-2xl font-bold text-lg shadow-xl shadow-orange-500/30 hover:shadow-2xl hover:shadow-orange-500/40 transition-all transform hover:scale-105 flex items-center justify-center gap-3"
            >
              Dùng thử miễn phí
              <FaArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <a
              href="#features"
              className="px-8 py-5 bg-white text-gray-700 rounded-2xl font-bold text-lg border-2 border-gray-200 hover:border-orange-300 hover:bg-orange-50 transition-all flex items-center justify-center gap-3"
            >
              <FaPlay className="text-orange-500" />
              Khám phá tính năng
            </a>
          </div>

          <div className="animate-slide-up-delay-3 flex flex-wrap justify-center items-center gap-8 text-gray-400">
            <span className="font-medium">Được tin tưởng bởi:</span>
            <div className="flex gap-8">
              <span className="font-bold text-gray-600">TechCorp</span>
              <span className="font-bold text-gray-600">EduLearn</span>
              <span className="font-bold text-gray-600">AutoSales</span>
              <span className="font-bold text-gray-600">+500 doanh nghiệp</span>
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20">
          <div className="w-8 h-12 border-2 border-orange-300 rounded-full flex justify-center p-2">
            <div className="w-2 h-3 bg-orange-500 rounded-full animate-bounce" />
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-20 bg-gradient-to-r from-orange-500 via-red-500 to-orange-500 animate-gradient relative overflow-hidden">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <AnimatedSection key={index} delay={index * 100} className="text-center">
                <div className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-2">{stat.value}</div>
                <div className="text-white/80 font-medium">{stat.label}</div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-32 bg-gray-50 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 to-red-500" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="text-center mb-20">
            <span className="inline-block px-4 py-2 bg-orange-100 text-orange-600 rounded-full font-semibold mb-6">TÍNH NĂNG NỔI BẬT</span>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-gray-900 mb-6">
              Giải pháp <span className="text-orange-500">toàn diện</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">Tất cả những gì bạn cần để xây dựng chiến lược marketing hiệu quả</p>
          </AnimatedSection>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <AnimatedSection key={index} delay={index * 100}>
                <div className="group h-full bg-white rounded-3xl p-8 shadow-lg hover:shadow-2xl transition-all duration-300 border border-gray-100 hover:border-orange-200 hover:-translate-y-2">
                  <div className={`w-16 h-16 bg-gradient-to-br ${feature.color} rounded-2xl flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 group-hover:rotate-6 transition-all duration-300`}>
                    <feature.icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-4">{feature.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{feature.description}</p>
                  <div className="mt-6 flex items-center text-orange-500 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                    Tìm hiểu thêm <FaArrowRight className="ml-2" />
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing — fetch từ API, xử lý Zalo cho gói custom */}
      <PricingSection />

      {/* How It Works */}
      <section id="how-it-works" className="py-32 bg-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-orange-50 to-white" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="text-center mb-20">
            <span className="inline-block px-4 py-2 bg-orange-100 text-orange-600 rounded-full font-semibold mb-6">QUY TRÌNH 4 BƯỚC</span>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-gray-900 mb-6">
              Bắt đầu <span className="text-orange-500">dễ dàng</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">Chỉ với 4 bước đơn giản để khởi chạy chiến dịch marketing đầu tiên</p>
          </AnimatedSection>

          <div className="relative">
            <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-1 bg-gradient-to-r from-orange-200 via-orange-400 to-orange-200 -translate-y-1/2 z-0" />
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 relative z-10">
              {steps.map((step, index) => (
                <AnimatedSection key={index} delay={index * 150}>
                  <div className="bg-white rounded-3xl p-8 shadow-xl border border-gray-100 text-center hover:shadow-2xl hover:-translate-y-2 transition-all duration-300">
                    <div className="w-20 h-20 bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-orange-500/30 rotate-3 hover:rotate-0 transition-transform">
                      <step.icon className="w-10 h-10 text-white" />
                    </div>
                    <div className="text-5xl font-black text-orange-100 mb-4">{step.number}</div>
                    <h3 className="text-xl font-bold text-gray-900 mb-3">{step.title}</h3>
                    <p className="text-gray-600">{step.description}</p>
                  </div>
                </AnimatedSection>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-32 bg-gradient-to-br from-orange-600 via-red-600 to-orange-700 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 35px, rgba(255,255,255,.1) 35px, rgba(255,255,255,.1) 70px)' }} />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-6">Tại sao chọn UKNOW</h2>
            <p className="text-xl text-orange-100 max-w-2xl mx-auto">Chúng tôi cam kết mang đến trải nghiệm tốt nhất cho khách hàng</p>
          </AnimatedSection>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
            {benefits.map((benefit, index) => (
              <AnimatedSection key={index} delay={index * 100}>
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 text-center hover:bg-white/20 transition-all">
                  <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <benefit.icon className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">{benefit.title}</h3>
                  <p className="text-orange-100 text-sm">{benefit.desc}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>

          <AnimatedSection>
            <div className="bg-white rounded-3xl p-8 md:p-12 shadow-2xl max-w-4xl mx-auto">
              <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                <div>
                  <h3 className="text-3xl font-bold text-gray-900 mb-2">Sẵn sàng để bắt đầu</h3>
                  <p className="text-gray-600">Đăng ký ngay hôm nay và nhận ưu đãi đặc biệt</p>
                </div>
                <ul className="space-y-2 text-gray-600">
                  <li className="flex items-center gap-2"><FaCheckCircle className="text-green-500" /> Dùng thử miễn phí 14 ngày</li>
                  <li className="flex items-center gap-2"><FaCheckCircle className="text-green-500" /> Không cần thẻ tín dụng</li>
                  <li className="flex items-center gap-2"><FaCheckCircle className="text-green-500" /> Hỗ trợ chuyển đổi miễn phí</li>
                </ul>
              </div>
              <div className="mt-8 text-center">
                <Link
                  to="/login"
                  className="inline-block px-8 py-4 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
                >
                  Đăng ký ngay - Miễn phí
                </Link>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-32 bg-gray-50 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 to-red-500" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="text-center mb-16">
            <span className="inline-block px-4 py-2 bg-orange-100 text-orange-600 rounded-full font-semibold mb-6">ĐÁNH GIÁ KHÁCH HÀNG</span>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-gray-900 mb-6">
              Khách hàng <span className="text-orange-500">nói gì</span>
            </h2>
          </AnimatedSection>
          <TestimonialSlider />
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-500/20 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-red-500/20 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <AnimatedSection>
            <div className="w-20 h-20 bg-gradient-to-br from-orange-500 to-red-500 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-orange-500/30">
              <span className="text-white font-black text-4xl">U</span>
            </div>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-6">Sẵn sàng để bứt phá</h2>
            <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto">
              Tham gia cùng hơn 10,000+ doanh nghiệp đang sử dụng UKNOW để phát triển kinh doanh
            </p>
            <Link
              to="/login"
              className="px-10 py-5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-2xl font-bold text-xl shadow-xl shadow-orange-500/30 hover:shadow-2xl hover:shadow-orange-500/40 transition-all transform hover:scale-105 inline-block"
            >
              Bắt đầu miễn phí ngay
            </Link>
            <p className="mt-8 text-gray-500">Không cần thẻ tín dụng - Dùng thử 14 ngày - Hủy bất kỳ lúc nào</p>
          </AnimatedSection>
        </div>
      </section>

    </div>
  );
}
