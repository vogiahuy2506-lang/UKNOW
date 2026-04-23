import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { FaEnvelope, FaComments, FaUsers, FaChartBar, FaBolt, FaShieldAlt, FaRocket, FaHandshake, FaHeadset, FaCheckCircle, FaArrowRight, FaPlay, FaStar, FaQuoteLeft, FaChevronLeft, FaChevronRight, FaCrown, FaGem } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

const features = [
  {
    icon: FaEnvelope,
    title: 'Email Marketing',
    description: 'Thiết kế và gửi email marketing chuyên nghiệp với template đa dạng, theo dõi tỷ lệ mở và click.',
    color: 'from-orange-500 to-red-500',
  },
  {
    icon: FaComments,
    title: 'Zalo Marketing',
    description: 'Tự động gửi tin nhắn Zalo OA, quản lý nhiều tài khoản, theo dõi phản hồi khách hàng.',
    color: 'from-blue-500 to-blue-600',
  },
  {
    icon: FaUsers,
    title: 'Quản lý Khách hàng',
    description: 'Lưu trữ và phân loại khách hàng theo nhiều tiêu chí, theo dõi hành trình khách hàng.',
    color: 'from-purple-500 to-pink-500',
  },
  {
    icon: FaChartBar,
    title: 'Báo cáo Chi tiết',
    description: 'Thống kê chi tiết về chiến dịch, tỷ lệ chuyển đổi, doanh thu theo thời gian thực.',
    color: 'from-green-500 to-emerald-500',
  },
  {
    icon: FaBolt,
    title: 'Tự động hóa',
    description: 'Thiết lập kịch bản tự động gửi tin nhắn theo điều kiện, tiết kiệm thời gian.',
    color: 'from-yellow-500 to-amber-500',
  },
  {
    icon: FaShieldAlt,
    title: 'Bảo mật Cao',
    description: 'Dữ liệu khách hàng được mã hóa và bảo vệ an toàn theo tiêu chuẩn quốc tế.',
    color: 'from-cyan-500 to-teal-500',
  },
];

const stats = [
  { value: '10,000+', label: 'Khách hàng', color: 'text-white' },
  { value: '1M+', label: 'Email đã gửi', color: 'text-white' },
  { value: '500+', label: 'Chiến dịch', color: 'text-white' },
  { value: '99.9%', label: 'Uptime', color: 'text-white' },
];

const steps = [
  {
    number: '01',
    title: 'Đăng ký & Thiết lập',
    description: 'Tạo tài khoản nhanh chóng, kết nối email và tài khoản Zalo OA.',
    icon: FaBolt,
  },
  {
    number: '02',
    title: 'Tạo Chiến dịch',
    description: 'Sử dụng drag-drop builder để tạo kịch bản marketing tự động.',
    icon: FaRocket,
  },
  {
    number: '03',
    title: 'Chạy & Theo dõi',
    description: 'Khởi chạy chiến dịch và theo dõi kết quả real-time.',
    icon: FaChartBar,
  },
  {
    number: '04',
    title: 'Tối ưu & Mở rộng',
    description: 'Phân tích dữ liệu, tối ưu chiến dịch và mở rộng quy mô.',
    icon: FaStar,
  },
];

const testimonials = [
  {
    name: 'Nguyễn Văn Minh',
    role: 'Marketing Manager',
    company: 'TechCorp Vietnam',
    avatar: 'N',
    content: 'UKNOW đã giúp chúng tôi tăng 300% hiệu quả chiến dịch email marketing chỉ trong 3 tháng đầu sử dụng.',
    rating: 5,
  },
  {
    name: 'Trần Thị Lan',
    role: 'CEO',
    company: 'EduLearn VN',
    avatar: 'T',
    content: 'Hệ thống tự động hóa của UKNOW tiết kiệm cho team tôi hơn 20 giờ mỗi tuần. Tuyệt vời!',
    rating: 5,
  },
  {
    name: 'Lê Hoàng Nam',
    role: 'Head of Sales',
    company: 'AutoSales Plus',
    avatar: 'L',
    content: 'Tỷ lệ chuyển đổi khách hàng tăng đáng kể nhờ Zalo marketing và email automation.',
    rating: 5,
  },
];

const benefits = [
  { icon: FaRocket, title: 'Triển khai nhanh', desc: 'Bắt đầu trong 5 phút' },
  { icon: FaHeadset, title: 'Hỗ trợ 24/7', desc: 'Luôn sẵn sàng giúp đỡ' },
  { icon: FaHandshake, title: 'Cam kết chất lượng', desc: 'Đảm bảo hiệu quả' },
  { icon: FaCheckCircle, title: 'Dễ sử dụng', desc: 'Giao diện thân thiện' },
];

const TestimonialSlider = () => {
  const [current, setCurrent] = useState(0);

  const next = () => setCurrent((prev) => (prev + 1) % testimonials.length);
  const prev = () => setCurrent((prev) => (prev - 1 + testimonials.length) % testimonials.length);

  return (
    <div className="relative max-w-4xl mx-auto">
      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-500"
          style={{ transform: `translateX(-${current * 100}%)` }}
        >
          {testimonials.map((testimonial, index) => (
            <div key={index} className="w-full flex-shrink-0 px-4">
              <div className="bg-white rounded-3xl p-8 md:p-12 shadow-2xl">
                <FaQuoteLeft className="text-4xl text-orange-200 mb-6" />
                <p className="text-xl md:text-2xl text-gray-700 mb-8 leading-relaxed italic">
                  {testimonial.content}
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-red-500 rounded-full flex items-center justify-center text-white font-bold text-xl">
                      {testimonial.avatar}
                    </div>
                    <div className="ml-4">
                      <div className="font-bold text-gray-900">{testimonial.name}</div>
                      <div className="text-gray-500">{testimonial.role} - {testimonial.company}</div>
                    </div>
                  </div>
                  <div className="flex">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <FaStar key={i} className="text-yellow-400" />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <button
        onClick={prev}
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-orange-50 transition-colors"
      >
        <FaChevronLeft className="text-orange-500" />
      </button>
      <button
        onClick={next}
        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-orange-50 transition-colors"
      >
        <FaChevronRight className="text-orange-500" />
      </button>
      <div className="flex justify-center gap-2 mt-8">
        {testimonials.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrent(index)}
            className={`w-3 h-3 rounded-full transition-all ${current === index ? 'bg-orange-500 w-8' : 'bg-gray-300'
              }`}
          />
        ))}
      </div>
    </div>
  );
};

const AnimatedSection = ({ children, className = '', delay = 0 }) => {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ${className}`}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(50px)',
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </div>
  );
};

export default function AboutPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  const handlePlanClick = (planData) => {
    if (planData.price === 'Liên hệ') {
      window.open('https://zalo.me/sdt', '_blank'); // Hoặc link contact
      return;
    }

    if (!isAuthenticated) {
      // Nếu chưa đăng nhập, đẩy sang trang login
      navigate('/login');
    } else {
      // Nếu đã đăng nhập, đẩy sang trang checkout kèm theo thông tin gói 
      navigate('/checkout', {
        state: {
          plan: {
            name: planData.name,
            price: planData.price
          }
        }
      });
    }
  };

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.5; }
          50% { transform: translateY(-20px) rotate(180deg); opacity: 1; }
        }
        @keyframes gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(100px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-float { animation: float 10s ease-in-out infinite; }
        .animate-gradient { 
          background-size: 200% 200%;
          animation: gradient 8s ease infinite;
        }
        .animate-slide-up {
          animation: slide-up 1s ease forwards;
        }
        .animate-slide-up-delay-1 { animation: slide-up 1s ease 0.2s forwards; opacity: 0; }
        .animate-slide-up-delay-2 { animation: slide-up 1s ease 0.4s forwards; opacity: 0; }
        .animate-slide-up-delay-3 { animation: slide-up 1s ease 0.6s forwards; opacity: 0; }
      `}</style>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-lg border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/30">
                <span className="text-white font-black text-2xl">U</span>
              </div>
              <span className="ml-3 text-2xl font-bold bg-gradient-to-r from-orange-600 to-red-500 bg-clip-text text-transparent">
                UKNOW
              </span>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-gray-600 hover:text-orange-500 font-medium transition-colors">
                Tính năng
              </a>
              <a href="#pricing" className="text-gray-600 hover:text-orange-500 font-medium transition-colors">
                Bảng giá
              </a>
              <a href="#how-it-works" className="text-gray-600 hover:text-orange-500 font-medium transition-colors">
                Cách hoạt động
              </a>
              <a href="#testimonials" className="text-gray-600 hover:text-orange-500 font-medium transition-colors">
                Đánh giá
              </a>
              <Link
                to="/login"
                className="px-5 py-2.5 border-2 border-orange-500 text-orange-500 rounded-full font-semibold hover:bg-orange-50 transition-all"
              >
                Đăng nhập
              </Link>
              <Link
                to="/register"
                className="px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-full font-semibold hover:shadow-lg hover:shadow-orange-500/30 transition-all transform hover:scale-105"
              >
                Đăng ký
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
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
            UKNOW Campaign giúp bạn quản lý chiến dịch email và Zalo marketing
            một cách <span className="text-orange-500 font-semibold">chuyên nghiệp</span>,
            tiết kiệm <span className="text-orange-500 font-semibold">70% thời gian</span>
            và tăng <span className="text-orange-500 font-semibold">300% hiệu quả</span>.
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

      {/* Stats Section */}
      <section className="py-20 bg-gradient-to-r from-orange-500 via-red-500 to-orange-500 animate-gradient relative overflow-hidden">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <AnimatedSection key={index} delay={index * 100} className="text-center">
                <div className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-2">
                  {stat.value}
                </div>
                <div className="text-white/80 font-medium">{stat.label}</div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-32 bg-gray-50 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 to-red-500" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="text-center mb-20">
            <span className="inline-block px-4 py-2 bg-orange-100 text-orange-600 rounded-full font-semibold mb-6">
              TÍNH NĂNG NỔI BẬT
            </span>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-gray-900 mb-6">
              Giải pháp <span className="text-orange-500">toàn diện</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Tất cả những gì bạn cần để xây dựng chiến lược marketing hiệu quả
            </p>
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

      {/* Pricing Section */}
      <section id="pricing" className="py-32 bg-gradient-to-b from-white to-orange-50 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="text-center mb-20">
            <span className="inline-block px-4 py-2 bg-orange-100 text-orange-600 rounded-full font-semibold mb-6">
              BẢNG GIÁ
            </span>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-gray-900 mb-6">
              Chọn gói <span className="text-orange-500">phù hợp</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Giá cả hợp lý, linh hoạt theo nhu cầu của bạn
            </p>
          </AnimatedSection>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Basic Plan */}
            <AnimatedSection delay={0}>
              <div className="bg-white rounded-3xl p-8 shadow-xl border border-gray-200 hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="relative">
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">Cơ bản</h3>
                  <p className="text-gray-500 mb-6">Dành cho cá nhân</p>
                  <div className="mb-8">
                    <span className="text-5xl font-black text-gray-900">499K</span>
                    <span className="text-gray-500">/tháng</span>
                  </div>
                  <ul className="space-y-4 mb-8">
                    <li className="flex items-center gap-3">
                      <FaCheckCircle className="text-green-500 flex-shrink-0" />
                      <span className="text-gray-600">1,000 email/tháng</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <FaCheckCircle className="text-green-500 flex-shrink-0" />
                      <span className="text-gray-600">500 contacts</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <FaCheckCircle className="text-green-500 flex-shrink-0" />
                      <span className="text-gray-600">5 templates email</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <FaCheckCircle className="text-green-500 flex-shrink-0" />
                      <span className="text-gray-600">Basic analytics</span>
                    </li>
                    <li className="flex items-center gap-3 opacity-40">
                      <FaCheckCircle className="text-gray-400 flex-shrink-0" />
                      <span className="text-gray-400">Zalo Marketing</span>
                    </li>
                  </ul>
                  <button
                    onClick={() => handlePlanClick({ name: 'Cơ bản', price: '499K' })}
                    className="block w-full py-4 text-center bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                  >
                    Bắt đầu miễn phí
                  </button>
                </div>
              </div>
            </AnimatedSection>

            {/* Pro Plan - Popular */}
            <AnimatedSection delay={100}>
              <div className="bg-gradient-to-br from-orange-500 to-red-500 rounded-3xl p-8 shadow-2xl relative overflow-hidden transform scale-105">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="absolute top-4 right-4">
                  <span className="bg-white text-orange-500 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1">
                    <FaCrown /> Phổ biến
                  </span>
                </div>
                <div className="relative">
                  <h3 className="text-2xl font-bold text-white mb-2">Chuyên nghiệp</h3>
                  <p className="text-orange-100 mb-6">Dành cho doanh nghiệp</p>
                  <div className="mb-8">
                    <span className="text-5xl font-black text-white">999K</span>
                    <span className="text-orange-100">/tháng</span>
                  </div>
                  <ul className="space-y-4 mb-8">
                    <li className="flex items-center gap-3">
                      <FaCheckCircle className="text-white flex-shrink-0" />
                      <span className="text-white">10,000 email/tháng</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <FaCheckCircle className="text-white flex-shrink-0" />
                      <span className="text-white">5,000 contacts</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <FaCheckCircle className="text-white flex-shrink-0" />
                      <span className="text-white">Unlimited templates</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <FaCheckCircle className="text-white flex-shrink-0" />
                      <span className="text-white">Advanced analytics</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <FaCheckCircle className="text-white flex-shrink-0" />
                      <span className="text-white">Zalo Marketing</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <FaCheckCircle className="text-white flex-shrink-0" />
                      <span className="text-white">Automation workflows</span>
                    </li>
                  </ul>
                  <button
                    onClick={() => handlePlanClick({ name: 'Chuyên nghiệp', price: '999K' })}
                    className="block w-full py-4 text-center bg-white text-orange-500 rounded-xl font-bold hover:bg-orange-50 transition-colors"
                  >
                    Bắt đầu ngay
                  </button>
                </div>
              </div>
            </AnimatedSection>

            {/* Enterprise Plan */}
            <AnimatedSection delay={200}>
              <div className="bg-white rounded-3xl p-8 shadow-xl border border-gray-200 hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-100 to-purple-200 rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-2xl font-bold text-gray-900">Doanh nghiệp</h3>
                    <FaGem className="text-purple-500" />
                  </div>
                  <p className="text-gray-500 mb-6">Giải pháp tối ưu</p>
                  <div className="mb-8">
                    <span className="text-5xl font-black text-gray-900">2.99M</span>
                    <span className="text-gray-500">/tháng</span>
                  </div>
                  <ul className="space-y-4 mb-8">
                    <li className="flex items-center gap-3">
                      <FaCheckCircle className="text-green-500 flex-shrink-0" />
                      <span className="text-gray-600">Unlimited email</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <FaCheckCircle className="text-green-500 flex-shrink-0" />
                      <span className="text-gray-600">Unlimited contacts</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <FaCheckCircle className="text-green-500 flex-shrink-0" />
                      <span className="text-gray-600">Custom templates</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <FaCheckCircle className="text-green-500 flex-shrink-0" />
                      <span className="text-gray-600">AI-powered analytics</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <FaCheckCircle className="text-green-500 flex-shrink-0" />
                      <span className="text-gray-600">Multi-account Zalo</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <FaCheckCircle className="text-green-500 flex-shrink-0" />
                      <span className="text-gray-600">Priority support 24/7</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <FaCheckCircle className="text-green-500 flex-shrink-0" />
                      <span className="text-gray-600">API access</span>
                    </li>
                  </ul>
                  <Link
                    to="/login"
                    className="block w-full py-4 text-center bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-bold hover:opacity-90 transition-opacity"
                  >
                    Liên hệ tư vấn
                  </Link>
                </div>
              </div>
            </AnimatedSection>
          </div>

          <AnimatedSection className="text-center mt-12">
            <p className="text-gray-500">
              Tất cả các gói đều có <span className="text-orange-500 font-semibold">14 ngày dùng thử miễn phí</span>. Không cần thẻ tín dụng.
            </p>
          </AnimatedSection>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-32 bg-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-orange-50 to-white" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="text-center mb-20">
            <span className="inline-block px-4 py-2 bg-orange-100 text-orange-600 rounded-full font-semibold mb-6">
              QUY TRÌNH 4 BƯỚC
            </span>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-gray-900 mb-6">
              Bắt đầu <span className="text-orange-500">dễ dàng</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Chỉ với 4 bước đơn giản để khởi chạy chiến dịch marketing đầu tiên
            </p>
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

      {/* Benefits Section */}
      <section className="py-32 bg-gradient-to-br from-orange-600 via-red-600 to-orange-700 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 35px, rgba(255,255,255,.1) 35px, rgba(255,255,255,.1) 70px)' }} />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-6">
              Tại sao chọn UKNOW
            </h2>
            <p className="text-xl text-orange-100 max-w-2xl mx-auto">
              Chúng tôi cam kết mang đến trải nghiệm tốt nhất cho khách hàng
            </p>
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
                  <li className="flex items-center gap-2">
                    <FaCheckCircle className="text-green-500" /> Dùng thử miễn phí 14 ngày
                  </li>
                  <li className="flex items-center gap-2">
                    <FaCheckCircle className="text-green-500" /> Không cần thẻ tín dụng
                  </li>
                  <li className="flex items-center gap-2">
                    <FaCheckCircle className="text-green-500" /> Hỗ trợ chuyển đổi miễn phí
                  </li>
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

      {/* Testimonials Section */}
      <section id="testimonials" className="py-32 bg-gray-50 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 to-red-500" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="text-center mb-16">
            <span className="inline-block px-4 py-2 bg-orange-100 text-orange-600 rounded-full font-semibold mb-6">
              ĐÁNH GIÁ KHÁCH HÀNG
            </span>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-gray-900 mb-6">
              Khách hàng <span className="text-orange-500">nói gì</span>
            </h2>
          </AnimatedSection>

          <TestimonialSlider />
        </div>
      </section>

      {/* Final CTA Section */}
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
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-6">
              Sẵn sàng để bứt phá
            </h2>
            <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto">
              Tham gia cùng hơn 10,000+ doanh nghiệp đang sử dụng UKNOW để phát triển kinh doanh
            </p>
            <Link
              to="/login"
              className="px-10 py-5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-2xl font-bold text-xl shadow-xl shadow-orange-500/30 hover:shadow-2xl hover:shadow-orange-500/40 transition-all transform hover:scale-105 inline-block"
            >
              Bắt đầu miễn phí ngay
            </Link>
            <p className="mt-8 text-gray-500">
              Không cần thẻ tín dụng - Dùng thử 14 ngày - Hủy bất kỳ lúc nào
            </p>
          </AnimatedSection>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-950 text-gray-400 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center mb-8 md:mb-0">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl flex items-center justify-center">
                <span className="text-white font-black text-xl">U</span>
              </div>
              <span className="ml-3 text-2xl font-bold text-white">UKNOW</span>
            </div>
            <div className="flex flex-wrap justify-center gap-8 text-sm">
              <a href="#" className="hover:text-orange-500 transition-colors">Điều khoản sử dụng</a>
              <a href="#" className="hover:text-orange-500 transition-colors">Chính sách bảo mật</a>
              <a href="#" className="hover:text-orange-500 transition-colors">Liên hệ</a>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm">
            © 2024 UKNOW Campaign. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
