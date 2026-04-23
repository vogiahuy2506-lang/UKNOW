import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { FaStar, FaUsers, FaClock, FaBook, FaCheck, FaChevronRight, FaShieldAlt, FaGraduationCap, FaAward, FaHeart, FaRocket, FaBriefcase, FaUserGraduate, FaChalkboardTeacher, FaHandshake, FaPlay, FaQuoteLeft, FaArrowRight, FaBolt, FaLightbulb, FaUsersCog, FaRobot } from 'react-icons/fa';

const instructor = {
  name: 'Ngô Hữu Thống',
  title: 'Founder & CEO - Digiso Education',
  avatar: '/images/instructor-ngo-huu-thong.png',
  bio: 'Chuyên gia AI hàng đầu Việt Nam, tiên phong đào tạo ứng dụng trí tuệ nhân tạo cho doanh nghiệp và cá nhân.',
};

const stats = {
  students: 5000,
  courses: 12,
  rating: 4.9,
  partners: 50,
};

const courses = [
  {
    id: 1,
    title: 'AI for Enterprise',
    description: 'Đào tạo ứng dụng AI cho doanh nghiệp SME & tập đoàn. Tối ưu quy trình, tăng năng suất lao động.',
    thumbnail: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=600&h=400&fit=crop',
    icon: FaBriefcase,
    color: 'from-orange-500 to-red-500',
    price: 4990000,
    originalPrice: 7990000,
    duration: 16,
    lessons: 8,
    students: 850,
    rating: 4.9,
    level: 'Doanh nghiệp',
    popular: true,
    features: [
      '8 module chuyên sâu',
      'Case study thực tế từ doanh nghiệp',
      'Workshop thực hành trực tiếp',
      'Tài liệu và template dự án',
      'Hỗ trợ sau khóa học 1 tháng'
    ],
  },
  {
    id: 2,
    title: 'AI for Public Service',
    description: 'Chương trình đào tạo AI cho cán bộ, nhân viên văn phòng và cơ quan nhà nước.',
    thumbnail: 'https://images.unsplash.com/photo-1573164713988-8665fc963095?w=600&h=400&fit=crop',
    icon: FaHandshake,
    color: 'from-blue-500 to-cyan-500',
    price: 2990000,
    originalPrice: 4990000,
    duration: 12,
    lessons: 6,
    students: 620,
    rating: 4.8,
    level: 'Cán bộ nhà nước',
    popular: false,
    features: [
      '6 module theo chuẩn e-Gov',
      'Hướng dẫn AI trong hành chính',
      'Bài tập tình huống thực tế',
      'Chứng chỉ hoàn thành',
      'Cập nhật kiến thức liên tục'
    ],
  },
  {
    id: 3,
    title: 'AI for Educators',
    description: 'Trang bị kiến thức AI cho giáo viên, giảng viên và cơ sở giáo dục. Ứng dụng AI trong giảng dạy.',
    thumbnail: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=600&h=400&fit=crop',
    icon: FaChalkboardTeacher,
    color: 'from-green-500 to-emerald-500',
    price: 1990000,
    originalPrice: 3490000,
    duration: 10,
    lessons: 5,
    students: 1200,
    rating: 4.9,
    level: 'Giáo viên',
    popular: false,
    features: [
      '5 module phương pháp sư phạm',
      'AI tools cho giảng dạy',
      'Thiết kế bài giảng với AI',
      'Chia sẻ kinh nghiệm từ chuyên gia',
      'Cộng đồng giáo viên AI'
    ],
  },
  {
    id: 4,
    title: 'AI for Students',
    description: 'Khóa học AI dành cho sinh viên năm cuối và người mới đi làm. Chuẩn bị cho tương lai số.',
    thumbnail: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=600&h=400&fit=crop',
    icon: FaUserGraduate,
    color: 'from-purple-500 to-pink-500',
    price: 990000,
    originalPrice: 1990000,
    duration: 20,
    lessons: 10,
    students: 2500,
    rating: 4.8,
    level: 'Sinh viên',
    popular: false,
    features: [
      '10 module từ cơ bản đến nâng cao',
      'Dự án AI thực tế',
      'Portfolio cá nhân',
      'Hướng dẫn phỏng vấn kỹ thuật',
      'Kết nối cơ hội việc làm'
    ],
  }
];

const testimonials = [
  {
    name: 'Vũ Quốc Thịnh',
    role: 'Giám đốc',
    content: 'Tôi được học nhiều về đạo đức khi sử dụng AI, được hiểu rõ hơn về cách sử dụng AI sao cho an toàn và hiệu quả trong công việc của tôi.',
    rating: 5,
    avatar: 'V'
  },
  {
    name: 'Nguyễn Văn Tân',
    role: 'Trưởng khoa KTQT - ĐH Lạc Hồng',
    content: 'Qua khóa học này, tôi nghĩ các giảng viên, giáo viên cần tiếp cận thêm về AI để truyền đạt những kiến thức mới hơn cho học sinh - sinh viên của mình.',
    rating: 5,
    avatar: 'N'
  },
  {
    name: 'Lê Uyên Thảo',
    role: 'Founder AI Agents',
    content: 'Tôi cảm thấy khóa học rất hữu ích cho cả doanh nghiệp lẫn các cá nhân trong thời đại ngày nay.',
    rating: 5,
    avatar: 'L'
  }
];

const partners = [
  { name: 'Tutor LMS', type: 'LMS Platform' },
  { name: 'LearnPress', type: 'LMS Platform' },
  { name: 'LearnDash', type: 'LMS Platform' },
  { name: 'MasterStudy', type: 'LMS Platform' },
];

const formatPrice = (price) => {
  return new Intl.NumberFormat('vi-VN').format(price) + 'đ';
};

// Animated Counter Hook
const useAnimatedCounter = (end, duration = 2000, suffix = '') => {
  const [count, setCount] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isVisible) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) return;

    let startTime;
    const animate = (currentTime) => {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / duration, 1);
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      setCount(Math.floor(easeOutQuart * end));
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }, [isVisible, end, duration]);

  return { count, ref };
};

// Floating Particles Component
const FloatingParticles = () => {
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 5,
    duration: 15 + Math.random() * 10,
    size: 4 + Math.random() * 8,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="absolute bg-white/10 rounded-full animate-float"
          style={{
            left: `${particle.left}%`,
            width: particle.size,
            height: particle.size,
            animationDelay: `${particle.delay}s`,
            animationDuration: `${particle.duration}s`,
          }}
        />
      ))}
    </div>
  );
};

// Animated Section Hook
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

// Animated Section Component
const AnimatedSection = ({ children, className = '', delay = 0 }) => {
  const { ref, isVisible } = useInViewAnimation();

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ${className}`}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(30px)',
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </div>
  );
};

const CourseCard = ({ course, onEnroll, index }) => {
  const { ref, isVisible } = useInViewAnimation();
  const [isHovered, setIsHovered] = useState(false);
  const discount = Math.round((1 - course.price / course.originalPrice) * 100);
  const IconComponent = course.icon;

  return (
    <div
      ref={ref}
      className={`relative rounded-2xl overflow-hidden transition-all duration-500 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
      } ${course.popular ? 'scale-105' : ''}`}
      style={{ transitionDelay: `${index * 150}ms` }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Popular Badge */}
      {course.popular && (
        <div className="absolute top-4 left-4 z-20 bg-gradient-to-r from-yellow-400 to-orange-500 text-white px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1 shadow-lg animate-pulse">
          <FaAward className="w-4 h-4" />
          Phổ biến nhất
        </div>
      )}

      {/* Card Glow Effect */}
      <div className={`absolute -inset-1 bg-gradient-to-r ${course.color} opacity-0 transition-opacity duration-300 blur-lg ${isHovered ? 'opacity-30' : ''}`} />

      <div className={`relative bg-white rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl border border-gray-100 ${
        course.popular ? 'ring-2 ring-orange-500 shadow-orange-200' : ''
      }`}>
        {/* Thumbnail with Overlay */}
        <div className="relative overflow-hidden group">
          <img 
            src={course.thumbnail} 
            alt={course.title}
            className="w-full h-40 object-cover transition-transform duration-500 group-hover:scale-110"
          />
          <div className={`absolute inset-0 bg-gradient-to-t ${course.color} opacity-0 group-hover:opacity-60 transition-opacity duration-300`} />
          
          {/* Play Button Overlay */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center shadow-xl transform scale-0 group-hover:scale-100 transition-transform duration-300">
              <FaPlay className="w-6 h-6 text-gray-800 ml-1" />
            </div>
          </div>

          {/* Discount Badge */}
          <div className="absolute top-4 right-4 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-semibold shadow-lg animate-bounce">
            -{discount}%
          </div>

          {/* Icon Badge */}
          <div className={`absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-2 rounded-xl flex items-center gap-2 shadow-lg transform transition-transform duration-300 ${isHovered ? '-translate-y-2' : ''}`}>
            <IconComponent className={`w-5 h-5 bg-gradient-to-r ${course.color} text-transparent bg-clip-text`} />
            <span className="text-sm font-semibold text-gray-700">{course.title}</span>
          </div>
        </div>

        <div className="p-5">
          <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r ${course.color} text-white mb-3`}>
            {course.level}
          </span>

          <p className="text-sm text-gray-500 mb-4 line-clamp-3">
            {course.description}
          </p>

          {/* Stats */}
          <div className="flex items-center gap-4 text-sm mb-4 pb-4 border-b border-gray-100 text-gray-500">
            <div className="flex items-center gap-1">
              <FaClock className="w-4 h-4" />
              <span>{course.duration}h</span>
            </div>
            <div className="flex items-center gap-1">
              <FaBook className="w-4 h-4" />
              <span>{course.lessons} module</span>
            </div>
            <div className="flex items-center gap-1 text-yellow-500">
              <FaStar className="w-4 h-4 fill-current" />
              <span className="font-bold">{course.rating}</span>
            </div>
          </div>

          {/* Price & CTA */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-gray-400 line-through">
                {formatPrice(course.originalPrice)}
              </span>
              <p className="text-2xl font-bold bg-gradient-to-r bg-clip-text text-transparent bg-gradient-to-r from-orange-500 to-red-500">
                {formatPrice(course.price)}
              </p>
            </div>
            <button
              onClick={() => onEnroll(course)}
              className={`relative px-6 py-3 rounded-xl font-semibold overflow-hidden group transition-all hover:shadow-lg`}
            >
              <span className={`absolute inset-0 bg-gradient-to-r ${course.color}`} />
              <span className="absolute inset-[2px] bg-white rounded-lg" />
              <span className={`relative bg-gradient-to-r ${course.color} bg-clip-text text-transparent font-bold`}>
                Đăng ký
              </span>
            </button>
          </div>
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

  const discount = Math.round((1 - course.price / course.originalPrice) * 100);
  const IconComponent = course.icon;

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
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fadeIn" onClick={onClose} />
      
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-slideUp">
        {/* Header */}
        <div className={`bg-gradient-to-r ${course.color} p-6 flex items-center justify-between sticky top-0 z-10 rounded-t-3xl`}>
          <div className="flex items-center gap-3">
            <IconComponent className="w-8 h-8 text-white" />
            <h2 className="text-xl font-bold text-white">Đăng ký khóa học</h2>
          </div>
          <button 
            onClick={onClose}
            className="text-white/80 hover:text-white text-3xl w-10 h-10 flex items-center justify-center transition-transform hover:rotate-90"
          >
            ×
          </button>
        </div>

        {/* Success State */}
        {showSuccess ? (
          <div className="p-12 text-center animate-bounceIn">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FaCheck className="w-10 h-10 text-green-500" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Đăng ký thành công!</h3>
            <p className="text-gray-500">Chúng tôi sẽ liên hệ với bạn sớm nhất</p>
          </div>
        ) : (
          <>
            {/* Course Info */}
            <div className={`p-6 bg-gradient-to-r ${course.color} opacity-10`}>
              <div className="flex gap-4">
                <img 
                  src={course.thumbnail} 
                  alt={course.title}
                  className="w-24 h-18 object-cover rounded-xl"
                />
                <div className="flex-1">
                  <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full">
                    -{discount}%
                  </span>
                  <h3 className="font-bold text-gray-900 mt-1 text-sm">{course.title}</h3>
                  <p className="text-xs text-gray-500 mt-1">{course.duration} giờ • {course.lessons} module</p>
                </div>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="animate-inputFocus">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Họ và tên <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all"
                  placeholder="Nhập họ và tên của bạn"
                />
              </div>

              <div className="animate-inputFocus" style={{ animationDelay: '0.1s' }}>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all"
                  placeholder="email@example.com"
                />
              </div>

              <div className="animate-inputFocus" style={{ animationDelay: '0.2s' }}>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Số điện thoại <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all"
                  placeholder="0xxx xxx xxx"
                />
              </div>

              {/* Features */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <FaLightbulb className="w-4 h-4 text-orange-500" />
                  Bạn sẽ nhận được:
                </h4>
                {course.features.map((feature, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm text-gray-600">
                    <FaCheck className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              {/* Price Summary */}
              <div className={`bg-gradient-to-r ${course.color} rounded-xl p-4 text-white`}>
                <div className="flex justify-between items-center text-sm mb-1">
                  <span className="text-white/80">Giá gốc:</span>
                  <span className="line-through opacity-70">{formatPrice(course.originalPrice)}</span>
                </div>
                <div className="flex justify-between items-center font-bold text-xl">
                  <span>Thanh toán:</span>
                  <span>{formatPrice(course.price)}</span>
                </div>
              </div>

              {/* Trust Badges */}
              <div className="flex items-center justify-center gap-4 text-sm text-gray-500">
                <div className="flex items-center gap-1">
                  <FaShieldAlt className="w-4 h-4 text-green-500" />
                  <span>Hoàn tiền 100%</span>
                </div>
              </div>

              {/* Submit Button */}
              <button 
                type="submit"
                disabled={isSubmitting}
                className={`w-full py-4 bg-gradient-to-r ${course.color} text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 ${
                  isSubmitting ? 'opacity-70 cursor-not-allowed' : 'hover:shadow-xl'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Đang xử lý...</span>
                  </>
                ) : (
                  <>
                    Hoàn tất đăng ký
                    <FaArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>

              <p className="text-center text-sm text-gray-500">
                Bằng việc đăng ký, bạn đồng ý với{' '}
                <a href="https://digiso.edu.vn" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:underline">Điều khoản sử dụng</a>
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default function LearningPage() {
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [showEnrollmentModal, setShowEnrollmentModal] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  const { count: studentCount, ref: studentRef } = useAnimatedCounter(stats.students);
  const { count: courseCount, ref: courseRef } = useAnimatedCounter(stats.courses);

  const handleEnroll = (course) => {
    setSelectedCourse(course);
    setShowEnrollmentModal(true);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-orange-600 via-orange-500 to-red-500 text-white relative overflow-hidden">
        <FloatingParticles />
        
        <div className="max-w-7xl mx-auto px-4 py-20 relative z-10">
          <div className="text-center mb-16">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-5 py-2 rounded-full text-sm font-medium mb-6 animate-bounceIn">
              <FaRobot className="w-4 h-4" />
              Đào tạo AI hàng đầu Việt Nam
            </div>

            {/* Main Title */}
            <h1 className="text-5xl md:text-6xl font-bold mb-6 animate-slideUp">
              <span className="bg-gradient-to-r from-white to-orange-200 bg-clip-text text-transparent">
                1 ngày làm chủ AI
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-xl text-orange-100 max-w-2xl mx-auto mb-8 animate-slideUp" style={{ animationDelay: '0.2s' }}>
              Thay đổi hiệu suất ngay - Đào tạo AI ứng dụng sát thực tiễn, 
              chuyển giao kiến thức thành kỹ năng cụ thể
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-slideUp" style={{ animationDelay: '0.4s' }}>
              <button 
                onClick={() => handleEnroll(courses[0])}
                className="group bg-white text-orange-500 px-8 py-4 rounded-xl font-bold hover:bg-orange-50 transition-all inline-flex items-center justify-center gap-2 shadow-xl"
              >
                Bắt đầu ngay
                <FaRocket className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button 
                onClick={() => document.getElementById('courses').scrollIntoView({ behavior: 'smooth' })}
                className="bg-white/10 backdrop-blur-sm text-white px-8 py-4 rounded-xl font-bold hover:bg-white/20 transition-all inline-flex items-center justify-center gap-2 border border-white/30"
              >
                Xem khóa học
                <FaChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Instructor Card */}
          <AnimatedSection delay={600}>
            <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 max-w-4xl mx-auto border border-white/20">
              <div className="flex flex-col md:flex-row items-center gap-8">
                {/* Avatar */}
                <div className="relative">
                  <img 
                    src={instructor.avatar} 
                    alt={instructor.name}
                    className="w-40 h-40 rounded-full object-cover ring-4 ring-white/30 shadow-2xl"
                  />
                  <div className="absolute -bottom-2 -right-2 bg-green-500 w-10 h-10 rounded-full flex items-center justify-center border-4 border-orange-500 animate-pulse">
                    <FaCheck className="w-5 h-5 text-white" />
                  </div>
                  {/* Online indicator */}
                  <div className="absolute -top-1 -left-1 bg-red-500 w-4 h-4 rounded-full border-2 border-white animate-ping" />
                </div>

                {/* Info */}
                <div className="text-center md:text-left flex-1">
                  <h2 className="text-3xl font-bold mb-1">{instructor.name}</h2>
                  <p className="text-orange-200 mb-3">{instructor.title}</p>
                  <p className="text-orange-100/80 text-sm mb-6 max-w-lg">{instructor.bio}</p>
                  
                  {/* Stats Pills */}
                  <div className="flex flex-wrap justify-center md:justify-start gap-3">
                    <div className="group bg-white/10 px-5 py-3 rounded-full flex items-center gap-2 hover:bg-white/20 transition-all cursor-default">
                      <FaUsers className="w-5 h-5 text-orange-300" />
                      <span className="font-bold">{studentCount.toLocaleString()}+</span>
                      <span className="text-orange-200">Học viên</span>
                    </div>
                    <div className="group bg-white/10 px-5 py-3 rounded-full flex items-center gap-2 hover:bg-white/20 transition-all cursor-default">
                      <FaBook className="w-5 h-5 text-orange-300" />
                      <span className="font-bold">{courseCount}</span>
                      <span className="text-orange-200">Khóa học</span>
                    </div>
                    <div className="group bg-white/10 px-5 py-3 rounded-full flex items-center gap-2 hover:bg-white/20 transition-all cursor-default">
                      <FaStar className="w-5 h-5 text-yellow-400 fill-current" />
                      <span className="font-bold">{stats.rating}</span>
                      <span className="text-orange-200">Đánh giá</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </AnimatedSection>
        </div>

        {/* Wave Divider */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 120L60 105C120 90 240 60 360 45C480 30 600 30 720 37.5C840 45 960 60 1080 67.5C1200 75 1320 75 1380 75L1440 75V120H1380C1320 120 1200 120 1080 120C960 120 840 120 720 120C600 120 480 120 360 120C240 120 120 120 60 120H0Z" fill="#F9FAFB"/>
          </svg>
        </div>
      </div>

      {/* Values Section */}
      <div className="bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4">
          <AnimatedSection>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { icon: FaBolt, title: 'Nhanh', desc: 'Phương pháp học tập hiệu quả', color: 'from-yellow-400 to-orange-500' },
                { icon: FaLightbulb, title: 'Thực hành', desc: 'Áp dụng ngay vào công việc', color: 'from-green-400 to-emerald-500' },
                { icon: FaUsersCog, title: 'Cá nhân hóa', desc: 'Lộ trình phù hợp nhu cầu', color: 'from-blue-400 to-purple-500' },
              ].map((value, index) => (
                <div key={index} className="group bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
                  <div className={`w-14 h-14 bg-gradient-to-br ${value.color} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                    <value.icon className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">{value.title}</h3>
                  <p className="text-gray-500 text-sm">{value.desc}</p>
                </div>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </div>

      {/* Courses Section */}
      <div id="courses" className="max-w-7xl mx-auto px-4 py-20">
        <AnimatedSection>
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 bg-orange-100 text-orange-600 px-5 py-2 rounded-full text-sm font-medium mb-4">
              <FaGraduationCap className="w-4 h-4" />
              Các khóa học AI
            </span>
            <h2 className="text-4xl font-bold text-gray-900 mb-3">Chọn khóa học phù hợp với bạn</h2>
            <p className="text-gray-500 text-lg">Đào tạo in-house về ứng dụng AI cho mọi đối tượng</p>
          </div>
        </AnimatedSection>

        {/* Course Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 items-start">
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

      {/* Target Audience */}
      <div className="bg-gradient-to-b from-gray-50 to-white py-20">
        <div className="max-w-7xl mx-auto px-4">
          <AnimatedSection>
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-gray-900 mb-3">Đối tượng khách hàng</h2>
              <p className="text-gray-500 text-lg">Phù hợp với mọi ngành nghề và lĩnh vực</p>
            </div>
          </AnimatedSection>

          <AnimatedSection delay={200}>
            <div className="grid md:grid-cols-4 gap-6">
              {[
                { icon: FaBriefcase, title: 'Doanh nghiệp', desc: 'SME & tập đoàn', color: 'from-orange-500 to-red-500' },
                { icon: FaHandshake, title: 'Cơ quan nhà nước', desc: 'Hành chính công', color: 'from-blue-500 to-cyan-500' },
                { icon: FaChalkboardTeacher, title: 'Cơ sở giáo dục', desc: 'Giáo viên & giảng viên', color: 'from-green-500 to-emerald-500' },
                { icon: FaUserGraduate, title: 'Sinh viên', desc: 'Người mới đi làm', color: 'from-purple-500 to-pink-500' },
              ].map((item, index) => (
                <div key={index} className="group bg-white rounded-2xl p-8 shadow-lg border border-gray-100 text-center hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 cursor-pointer">
                  <div className={`w-20 h-20 bg-gradient-to-br ${item.color} rounded-2xl flex items-center justify-center mx-auto mb-5 group-hover:scale-110 group-hover:rotate-6 transition-all duration-300 shadow-lg`}>
                    <item.icon className="w-10 h-10 text-white" />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-2 text-lg">{item.title}</h3>
                  <p className="text-sm text-gray-500">{item.desc}</p>
                </div>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </div>

      {/* Testimonials Section */}
      <div className="bg-white py-20">
        <div className="max-w-7xl mx-auto px-4">
          <AnimatedSection>
            <div className="text-center mb-12">
              <span className="inline-flex items-center gap-2 bg-orange-100 text-orange-600 px-5 py-2 rounded-full text-sm font-medium mb-4">
                <FaHeart className="w-4 h-4" />
                Feedback từ học viên
              </span>
              <h2 className="text-4xl font-bold text-gray-900 mb-3">Học viên nói gì về khóa học</h2>
            </div>
          </AnimatedSection>

          <AnimatedSection delay={200}>
            <div className="grid md:grid-cols-3 gap-6">
              {testimonials.map((testimonial, index) => (
                <div key={index} className="group relative bg-gradient-to-br from-orange-50 to-red-50/30 rounded-2xl p-8 border border-orange-100 hover:shadow-xl transition-all duration-300">
                  {/* Quote Icon */}
                  <div className="absolute -top-4 -left-2 w-12 h-12 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl flex items-center justify-center shadow-lg">
                    <FaQuoteLeft className="w-6 h-6 text-white" />
                  </div>

                  {/* Stars */}
                  <div className="flex items-center gap-1 text-yellow-400 mb-4 mt-4">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <FaStar key={i} className="w-5 h-5 fill-current" />
                    ))}
                  </div>

                  {/* Content */}
                  <p className="text-gray-700 mb-6 italic leading-relaxed">"{testimonial.content}"</p>

                  {/* Author */}
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-red-500 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg">
                      {testimonial.avatar}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">{testimonial.name}</p>
                      <p className="text-sm text-gray-500">{testimonial.role}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </div>

      {/* Partners Section */}
      <div className="bg-gray-50 py-12">
        <div className="max-w-7xl mx-auto px-4">
          <p className="text-center text-gray-400 text-sm mb-6 font-medium tracking-wider uppercase">Nền tảng học tập trực tuyến</p>
          <div className="flex flex-wrap justify-center items-center gap-8">
            {partners.map((partner, index) => (
              <div 
                key={index} 
                className="text-gray-400 font-bold text-lg hover:text-orange-500 transition-colors cursor-pointer hover:scale-110 transition-transform"
              >
                {partner.name}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-gradient-to-r from-orange-500 via-orange-600 to-red-500 py-24 relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '30px 30px' }} />
        </div>
        
        <div className="max-w-4xl mx-auto px-4 text-center text-white relative z-10">
          <AnimatedSection>
            <div className="w-24 h-24 bg-white/20 backdrop-blur-sm rounded-3xl flex items-center justify-center mx-auto mb-6 animate-float">
              <FaRocket className="w-12 h-12" />
            </div>
            <h3 className="text-4xl md:text-5xl font-bold mb-4">
              Sẵn sàng làm chủ AI?
            </h3>
            <p className="text-orange-100 text-xl mb-8 max-w-2xl mx-auto">
              Đăng ký ngay hôm nay và bắt đầu hành trình chinh phục trí tuệ nhân tạo cùng Digiso Education
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button 
                onClick={() => handleEnroll(courses[0])}
                className="group bg-white text-orange-500 px-10 py-5 rounded-2xl font-bold text-lg hover:bg-orange-50 transition-all inline-flex items-center justify-center gap-3 shadow-2xl hover:shadow-xl"
              >
                Đăng ký ngay
                <FaArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
              </button>
              <a 
                href="https://digiso.edu.vn" 
                target="_blank" 
                rel="noopener noreferrer"
                className="bg-white/10 backdrop-blur-sm text-white px-10 py-5 rounded-2xl font-bold text-lg hover:bg-white/20 transition-all inline-flex items-center justify-center gap-3 border border-white/30"
              >
                Tìm hiểu thêm
                <FaChevronRight className="w-6 h-6" />
              </a>
            </div>
          </AnimatedSection>
        </div>
      </div>

      {/* Footer Contact */}
      <div className="bg-gray-900 text-gray-400 py-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-center md:text-left">
              <p className="font-bold text-white text-lg mb-1">Digiso Education</p>
              <p className="text-sm">Trao quyền làm chủ AI - Bứt phá tương lai số</p>
            </div>
            <div className="text-center md:text-right text-sm">
              <p className="font-semibold text-white">Hotline: +84 866 914 382</p>
              <p>Email: tuongvyto2017@gmail.com</p>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-6 pt-6 text-center text-xs">
            © 2026 Digiso Education. All rights reserved.
          </div>
        </div>
      </div>

      {/* Enrollment Modal */}
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
