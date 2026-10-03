import { useState, useEffect, useRef } from 'react';
import { FaCheck, FaRocket, FaBriefcase, FaUserGraduate, FaChalkboardTeacher, FaHandshake, FaArrowRight, FaExclamationTriangle, FaChartLine, FaCogs, FaCheckCircle, FaFire } from 'react-icons/fa';

const instructor = {
  name: 'Ngô Hữu Thống',
  title: 'Founder & CEO - Digiso Education',
  avatar: '/images/instructor-ngo-huu-thong.png',
  bio: 'ThS. Ngô Hữu Thống — hơn 10 năm kinh nghiệm tư vấn chuyển đổi số và ứng dụng AI. Chuyên gia tư vấn chiến lược AI cho các doanh nghiệp SME và Tập đoàn.',
};

const courses = [
  {
    id: 1,
    title: 'AI for Enterprise',
    description: 'Đào tạo ứng dụng AI cho doanh nghiệp SME & tập đoàn. Tối ưu quy trình, tăng năng suất lao động.',
    thumbnail: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=600&h=400&fit=crop',
    icon: FaBriefcase,
    color: 'from-orange-500 to-red-600',
    price: 4990000,
    duration: 16,
    lessons: 8,
    level: 'Doanh nghiệp',
    popular: true,
    features: [
      '8 module chuyên sâu về tự động hóa',
      'Case study thực tế từ doanh nghiệp',
      'Workshop thực hành trực tiếp',
      'Tài liệu và template dự án',
      'Hỗ trợ coaching sau khóa học 1 tháng'
    ],
  },
  {
    id: 2,
    title: 'AI for Public Service',
    description: 'Chương trình đào tạo AI cho cán bộ, nhân viên văn phòng và cơ quan nhà nước.',
    thumbnail: 'https://images.unsplash.com/photo-1573164713988-8665fc963095?w=600&h=400&fit=crop',
    icon: FaHandshake,
    color: 'from-blue-600 to-cyan-500',
    price: 2990000,
    duration: 12,
    lessons: 6,
    level: 'Hành chính công',
    popular: false,
    features: [
      '6 module theo chuẩn e-Gov',
      'Hướng dẫn AI trong xử lý văn bản',
      'Bài tập tình huống thực tế',
      'Chứng chỉ hoàn thành',
      'Cập nhật kiến thức liên tục'
    ],
  },
  {
    id: 3,
    title: 'AI for Educators',
    description: 'Trang bị kiến thức AI cho giáo viên, giảng viên. Ứng dụng AI đột phá trong giảng dạy.',
    thumbnail: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=600&h=400&fit=crop',
    icon: FaChalkboardTeacher,
    color: 'from-emerald-500 to-teal-500',
    price: 1990000,
    duration: 10,
    lessons: 5,
    level: 'Giáo dục',
    popular: false,
    features: [
      '5 module phương pháp sư phạm AI',
      'Bộ công cụ soạn giáo án tự động',
      'Thiết kế bài giảng tương tác',
      'Chia sẻ kinh nghiệm từ chuyên gia',
      'Tham gia cộng đồng giáo viên AI'
    ],
  },
  {
    id: 4,
    title: 'AI for Students',
    description: 'Khóa học AI dành cho sinh viên năm cuối và người mới đi làm. Chuẩn bị cho tương lai số.',
    thumbnail: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=600&h=400&fit=crop',
    icon: FaUserGraduate,
    color: 'from-purple-600 to-pink-500',
    price: 990000,
    duration: 20,
    lessons: 10,
    level: 'Sinh viên',
    popular: false,
    features: [
      '10 module từ cơ bản đến nâng cao',
      'Thực hành dự án AI cá nhân',
      'Xây dựng Portfolio ấn tượng',
      'Bí quyết phỏng vấn kỹ thuật',
      'Kết nối nhà tuyển dụng'
    ],
  }
];

const formatPrice = (price) => {
  return new Intl.NumberFormat('vi-VN').format(price) + 'đ';
};

const useInViewAnimation = () => {
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

  return { ref, isVisible };
};

const AnimatedSection = ({ children, className = '', delay = 0 }) => {
  const { ref, isVisible } = useInViewAnimation();

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ${className}`}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(40px)',
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </div>
  );
};

// --- Components ---

const PainPointCard = ({ icon: Icon, title, desc, delay }) => (
  <AnimatedSection delay={delay} className="bg-white p-8 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 hover:-translate-y-2 transition-transform duration-300">
    <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mb-6">
      <Icon className="w-7 h-7 text-red-500" />
    </div>
    <h3 className="text-xl font-bold text-gray-900 mb-3">{title}</h3>
    <p className="text-gray-600 leading-relaxed">{desc}</p>
  </AnimatedSection>
);

const CourseCard = ({ course, onEnroll, index }) => {
  const { ref, isVisible } = useInViewAnimation();
  const IconComponent = course.icon;

  return (
    <div
      ref={ref}
      className={`relative rounded-3xl overflow-hidden transition-all duration-700 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'
      } ${course.popular ? 'lg:-translate-y-4 shadow-2xl z-10 border-2 border-orange-500' : 'shadow-xl border border-gray-100'} bg-white flex flex-col h-full`}
      style={{ transitionDelay: `${index * 150}ms` }}
    >
      {course.popular && (
        <div className="absolute top-0 inset-x-0 bg-gradient-to-r from-orange-500 to-red-500 text-white text-center py-2 text-sm font-bold tracking-wider uppercase flex items-center justify-center gap-2">
          <FaFire className="w-4 h-4" /> Lựa chọn phổ biến
        </div>
      )}
      
      <div className={`p-8 ${course.popular ? 'pt-12' : ''} flex-1 flex flex-col`}>
        <div className="flex justify-between items-start mb-6">
          <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${course.color} p-0.5`}>
            <div className="w-full h-full bg-white rounded-xl flex items-center justify-center">
              <IconComponent className={`w-8 h-8 text-transparent bg-clip-text bg-gradient-to-br ${course.color}`} />
            </div>
          </div>
        </div>

        <h3 className="text-2xl font-bold text-gray-900 mb-2">{course.title}</h3>
        <p className="text-gray-500 mb-6 min-h-[48px]">{course.description}</p>

        <div className="space-y-4 mb-8 flex-1">
          {course.features.map((feat, i) => (
            <div key={i} className="flex items-start gap-3">
              <FaCheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
              <span className="text-gray-700">{feat}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-100 pt-6 mt-auto">
          <div className="flex items-end justify-between mb-6">
            <div>
              <p className={`text-3xl font-black bg-gradient-to-r ${course.color} text-transparent bg-clip-text`}>
                {formatPrice(course.price)}
              </p>
            </div>
          </div>
          <button
            onClick={() => onEnroll(course)}
            className={`w-full py-4 rounded-xl font-bold text-white text-lg transition-all hover:shadow-lg hover:-translate-y-1 bg-gradient-to-r ${course.color}`}
          >
            Đăng ký ngay
          </button>
        </div>
      </div>
    </div>
  );
};

const EnrollmentModal = ({ course, isOpen, onClose }) => {
  const [formData, setFormData] = useState({ name: '', email: '', phone: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  if (!isOpen || !course) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setShowSuccess(true);
      setTimeout(() => {
        onClose();
        setShowSuccess(false);
      }, 2000);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-[slideUp_0.3s_ease-out]">
        <div className={`bg-gradient-to-r ${course.color} p-8 text-white text-center`}>
          <h2 className="text-3xl font-bold mb-2">Đăng ký khóa học</h2>
          <p className="text-white/80">{course.title}</p>
        </div>

        {showSuccess ? (
          <div className="p-12 text-center">
            <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <FaCheck className="w-12 h-12 text-green-500" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Thành công!</h3>
            <p className="text-gray-500">Chuyên viên của chúng tôi sẽ liên hệ với bạn trong vòng 24h tới.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-8 space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Họ và tên *</label>
              <input
                type="text" required value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all"
                placeholder="Nhập họ và tên..."
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Email *</label>
              <input
                type="email" required value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all"
                placeholder="Nhập địa chỉ email..."
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Số điện thoại *</label>
              <input
                type="tel" required value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all"
                placeholder="Nhập số điện thoại liên hệ..."
              />
            </div>

            <button 
              type="submit" disabled={isSubmitting}
              className={`w-full py-4 bg-gray-900 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 hover:bg-gray-800 ${isSubmitting ? 'opacity-70' : ''}`}
            >
              {isSubmitting ? 'Đang xử lý...' : 'Xác nhận đăng ký ngay'}
            </button>
            <p className="text-center text-xs text-gray-500">
              Thông tin của bạn được bảo vệ theo chính sách bảo mật.
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

export default function LearningPage() {
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [showEnrollmentModal, setShowEnrollmentModal] = useState(false);


  const handleEnroll = (course) => {
    setSelectedCourse(course);
    setShowEnrollmentModal(true);
  };

  const scrollToCourses = () => {
    document.getElementById('pricing').scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] font-sans selection:bg-orange-500 selection:text-white">
      
      {/* 1. HERO SECTION (High Conversion) */}
      <div className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden bg-white">
        {/* Abstract Background Shapes */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
          <div className="absolute -top-[20%] -right-[10%] w-[70%] h-[70%] rounded-full bg-gradient-to-b from-orange-50 to-orange-100/50 blur-3xl opacity-70" />
          <div className="absolute top-[40%] -left-[10%] w-[50%] h-[50%] rounded-full bg-gradient-to-tr from-rose-50 to-transparent blur-3xl opacity-60" />
        </div>

        <div className="max-w-7xl mx-auto px-4 relative z-10">
          <div className="flex flex-col lg:flex-row items-center gap-16">
            
            {/* Left Content */}
            <div className="lg:w-3/5 text-center lg:text-left">
              <AnimatedSection>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-100 text-orange-600 font-bold text-sm mb-6 uppercase tracking-wide border border-orange-200 shadow-sm">
                  <FaRocket className="w-4 h-4" /> Giải pháp cho Doanh nghiệp & Cá nhân
                </div>
                <h1 className="text-5xl lg:text-7xl font-black text-gray-900 leading-[1.1] mb-6">
                  Đừng Để AI Thay Thế Bạn.<br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-red-500">
                    Hãy Làm Chủ Nó.
                  </span>
                </h1>
                <p className="text-xl text-gray-600 mb-10 leading-relaxed max-w-2xl mx-auto lg:mx-0">
                  Khóa học thực chiến <strong className="text-gray-900">1 ngày làm chủ AI</strong> giúp bạn tối ưu quy trình, tự động hóa công việc và <span className="underline decoration-orange-500 decoration-4 underline-offset-4">nâng năng suất làm việc</span>.
                </p>
                
                <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
                  <button 
                    onClick={scrollToCourses}
                    className="w-full sm:w-auto px-10 py-5 rounded-2xl bg-gray-900 text-white font-bold text-lg hover:bg-gray-800 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1 flex items-center justify-center gap-2"
                  >
                    Xem báo giá & Đăng ký <FaArrowRight />
                  </button>
                </div>
              </AnimatedSection>
            </div>

            {/* Right Content - Visual/Lead Magnet */}
            <div className="lg:w-2/5 w-full">
              <AnimatedSection delay={400}>
                <div className="relative rounded-3xl overflow-hidden shadow-2xl border-4 border-white transform lg:rotate-2 hover:rotate-0 transition-transform duration-500">
                  <img src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&h=600&fit=crop" alt="Team working with AI" className="w-full h-auto" />
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 to-transparent flex items-end p-8">
                    <div>
                      <div className="bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full inline-block mb-3">Thực chiến 100%</div>
                      <p className="text-white text-lg font-medium leading-snug">"Khóa học không lý thuyết suông. Chúng tôi cầm tay chỉ việc cho đến khi bạn làm được."</p>
                    </div>
                  </div>
                </div>
              </AnimatedSection>
            </div>

          </div>
        </div>
      </div>

      {/* 2. AGITATION SECTION (Pain points) */}
      <div className="py-24 bg-[#FAFAFA]">
        <div className="max-w-7xl mx-auto px-4">
          <AnimatedSection className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-5xl font-black text-gray-900 mb-6">Bạn có đang chật vật với những vấn đề này?</h2>
            <p className="text-lg text-gray-600">Thế giới đang thay đổi từng ngày. Nếu bạn vẫn làm việc theo cách cũ, bạn đang tự đào thải chính mình.</p>
          </AnimatedSection>

          <div className="grid md:grid-cols-3 gap-8">
            <PainPointCard 
              delay={0}
              icon={FaExclamationTriangle}
              title="Khối lượng công việc quá tải"
              desc="Bạn mất hàng giờ mỗi ngày để xử lý email, báo cáo, và các tác vụ lặp đi lặp lại một cách nhàm chán."
            />
            <PainPointCard 
              delay={150}
              icon={FaChartLine}
              title="Tụt hậu so với đối thủ"
              desc="Đối thủ của bạn đang dùng AI để ra content nhanh gấp 10 lần và tối ưu chi phí vận hành. Bạn thì không."
            />
            <PainPointCard 
              delay={300}
              icon={FaCogs}
              title="Thiếu kỹ năng tự động hóa"
              desc="Bạn nghe nhiều về AI, ChatGPT nhưng không biết cách áp dụng chúng vào công việc cụ thể của mình ra sao."
            />
          </div>
        </div>
      </div>

      {/* 3. SOLUTION & INSTRUCTOR SECTION */}
      <div className="py-24 bg-white border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <div className="lg:w-1/2 relative">
              <AnimatedSection>
                <div className="relative rounded-[2rem] overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-tr from-orange-500/20 to-transparent mix-blend-multiply z-10"></div>
                  <img src={instructor.avatar} alt={instructor.name} className="w-full h-auto object-cover rounded-[2rem]" />
                  <div className="absolute bottom-6 left-6 right-6 bg-white/90 backdrop-blur-md p-6 rounded-2xl z-20 shadow-xl border border-white/50">
                    <p className="font-black text-2xl text-gray-900">{instructor.name}</p>
                    <p className="text-orange-600 font-bold mb-2">{instructor.title}</p>
                  </div>
                </div>
              </AnimatedSection>
            </div>
            
            <div className="lg:w-1/2">
              <AnimatedSection delay={200}>
                <h2 className="text-3xl md:text-5xl font-black text-gray-900 mb-6 leading-tight">Học từ chuyên gia <br/><span className="text-orange-500">giàu thực chiến</span></h2>
                <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                  Digiso Education được dẫn dắt bởi chuyên gia Ngô Hữu Thống - người có nhiều năm kinh nghiệm đưa ứng dụng AI thực tiễn vào quy trình vận hành của các doanh nghiệp tại Việt Nam.
                </p>
                <div className="space-y-6">
                  {[
                    { title: 'Kiến thức thực tiễn', desc: 'Không dạy lý thuyết hàn lâm. Mọi bài giảng đều đúc kết từ case study thực tế.' },
                    { title: 'Cầm tay chỉ việc', desc: 'Cầm tay chỉ việc để học viên tự tay triển khai được luồng tự động hoá bằng AI sau khoá học.' },
                    { title: 'Hỗ trợ trọn đời', desc: 'Tham gia cộng đồng Alumni, nhận update kiến thức AI mới nhất hoàn toàn miễn phí.' }
                  ].map((item, idx) => (
                    <div key={idx} className="flex gap-4">
                      <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
                        <FaCheck className="text-orange-600 w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xl font-bold text-gray-900 mb-1">{item.title}</h4>
                        <p className="text-gray-600">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </AnimatedSection>
            </div>
          </div>
        </div>
      </div>

      {/* 4. PRICING/COURSES SECTION (The Offer) */}
      <div id="pricing" className="py-24 bg-gray-900 relative">
        {/* Subtle grid background */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
        
        <div className="max-w-7xl mx-auto px-4 relative z-10">
          <AnimatedSection className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-4xl md:text-5xl font-black text-white mb-6">Chọn Gói Đào Tạo Phù Hợp</h2>
            <p className="text-xl text-gray-400">Đầu tư một lần, sử dụng kỹ năng trọn đời.</p>
          </AnimatedSection>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto items-end">
            {courses.map((course, index) => (
              <CourseCard 
                key={course.id} 
                course={course}
                onEnroll={handleEnroll}
                index={index}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 6. FINAL CTA SECTION */}
      <div className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-orange-600 to-red-600"></div>
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
        
        <div className="max-w-4xl mx-auto px-4 relative z-10 text-center">
          <AnimatedSection>
            <h2 className="text-4xl md:text-6xl font-black text-white mb-8 leading-tight">
              Sẵn sàng nâng năng suất làm việc?
            </h2>
            <p className="text-2xl text-orange-100 mb-10 max-w-2xl mx-auto">
              Cơ hội không chờ đợi ai. Tham gia ngay hôm nay để nhận trọn bộ template AI.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button 
                onClick={scrollToCourses}
                className="w-full sm:w-auto px-12 py-5 rounded-2xl bg-white text-orange-600 font-bold text-xl hover:bg-gray-50 transition-all shadow-2xl hover:-translate-y-1"
              >
                Đăng Ký Ngay
              </button>
            </div>
            <p className="mt-6 text-orange-200 text-sm font-medium">Thanh toán nhanh bằng quét mã QR</p>
          </AnimatedSection>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="bg-gray-950 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="text-center md:text-left">
              <p className="text-2xl font-black text-white mb-2">DIGISO EDUCATION</p>
              <p className="text-sm">Đào tạo AI ứng dụng tại Việt Nam</p>
            </div>
            <div className="text-center md:text-right text-sm">
              <p className="text-white font-bold mb-1">Hotline: +84 866 914 382</p>
              <p>Email: tuongvyto2017@gmail.com</p>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs">
            <p>© 2026 Digiso Education. All rights reserved.</p>
            <div className="flex gap-4">
              <a href="https://digiso.edu.vn" className="hover:text-white transition-colors">Website</a>
              <a href="#" className="hover:text-white transition-colors">Điều khoản</a>
              <a href="#" className="hover:text-white transition-colors">Bảo mật</a>
            </div>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <EnrollmentModal 
        course={selectedCourse}
        isOpen={showEnrollmentModal}
        onClose={() => {
          setShowEnrollmentModal(false);
          setSelectedCourse(null);
        }}
      />
    </div>
  );
}
