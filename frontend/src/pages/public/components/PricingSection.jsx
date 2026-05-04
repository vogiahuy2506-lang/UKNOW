import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCheckCircle, FaCrown, FaGem, FaRocket, FaStar, FaBolt } from 'react-icons/fa';
import AnimatedSection from '../../../components/AnimatedSection';
import { useAuthStore } from '../../../stores/authStore';
import { getPlans } from '../../../services/plan.service';

const ZALO_URL = 'https://zalo.me/0388180856';

// Mảng các style động để tự động xoay vòng cho các gói
const DYNAMIC_STYLES = [
  {
    wrapper: 'bg-white border border-slate-200',
    title: 'text-slate-900',
    price: 'text-slate-900',
    unit: 'text-slate-500',
    feature: 'text-slate-600',
    featureIcon: 'text-orange-500',
    button: 'bg-orange-50 text-orange-700 hover:bg-orange-100',
    corner: 'from-orange-100 to-orange-50',
    icon: FaRocket,
  },
  {
    wrapper: 'bg-gradient-to-b from-orange-600 to-red-600 scale-105 shadow-2xl border border-orange-500 relative z-10',
    badge: 'Phổ Biến Nhất',
    title: 'text-white',
    price: 'text-white',
    unit: 'text-orange-100',
    feature: 'text-orange-50',
    featureIcon: 'text-orange-200',
    button: 'bg-white text-orange-600 hover:bg-slate-50 shadow-lg shadow-orange-900/20',
    corner: 'bg-white/10',
    icon: FaCrown,
  },
  {
    wrapper: 'bg-white border border-slate-200',
    title: 'text-slate-900',
    price: 'text-slate-900',
    unit: 'text-slate-500',
    feature: 'text-slate-600',
    featureIcon: 'text-red-500',
    button: 'bg-red-50 text-red-700 hover:bg-red-100',
    corner: 'from-red-100 to-red-50',
    icon: FaBolt,
  },
  {
    wrapper: 'bg-white border border-slate-200',
    title: 'text-slate-900',
    price: 'text-slate-900',
    unit: 'text-slate-500',
    feature: 'text-slate-600',
    featureIcon: 'text-amber-500',
    button: 'bg-amber-50 text-amber-700 hover:bg-amber-100',
    corner: 'from-amber-100 to-amber-50',
    icon: FaGem,
  }
];

export default function PricingSection() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  const getPlansData = async () => {
    try {
      setLoading(true);
      const { data } = await getPlans();
      // Lọc các gói active và sắp xếp theo giá để hiển thị hợp lý
      const sortedPlans = (data.plans || [])
        .filter(p => p.is_active)
        .sort((a, b) => a.price - b.price);
      setPlans(sortedPlans);
    } catch (error) {
      console.error('Lỗi khi lấy dữ liệu gói:', error);
      setPlans([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getPlansData();
  }, []);

  const handlePlanClick = (plan) => {
    if (plan.code === 'custom' || plan.price === 0) {
      window.open(ZALO_URL, '_blank');
      return;
    }
    if (!isAuthenticated) {
      navigate('/login');
    } else {
      navigate('/checkout', { state: { plan } });
    }
  };

  if (loading) {
    return (
      <div className="py-32 flex justify-center">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <section id="pricing" className="py-32 bg-slate-50 relative overflow-hidden border-t border-slate-200">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-50 via-slate-50 to-slate-50 opacity-70"></div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <AnimatedSection className="text-center mb-20">
          <span className="inline-block px-4 py-2 bg-orange-100 text-orange-700 rounded-full font-bold text-sm tracking-wide uppercase mb-6 shadow-sm border border-orange-200">
            BẢNG GIÁ LINH HOẠT
          </span>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-slate-900 mb-6 tracking-tight">
            Đầu tư cho sự <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-red-600">tăng trưởng</span>
          </h2>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Hệ thống gói cước được thiết kế để mở rộng cùng doanh nghiệp của bạn. Admin có thể tùy biến linh hoạt mọi cấu hình.
          </p>
        </AnimatedSection>

        <div className={`grid gap-8 max-w-7xl mx-auto items-center ${plans.length === 1 ? 'grid-cols-1 max-w-md' : plans.length === 2 ? 'grid-cols-1 md:grid-cols-2 max-w-4xl' : 'grid-cols-1 md:grid-cols-3'}`}>
          {plans.map((plan, index) => {
            // Cấp phát style động dựa trên vị trí. Gói ở giữa (index 1) thường nổi bật nhất.
            // Admin có thể thêm code "custom" để ép hiển thị nút liên hệ Zalo.
            const isCustom = plan.code === 'custom';
            const style = DYNAMIC_STYLES[index % DYNAMIC_STYLES.length];
            const PlanIcon = style.icon;
            
            const features = Array.isArray(plan.features)
              ? plan.features
              : JSON.parse(plan.features || '[]');

            return (
              <AnimatedSection key={plan.id} delay={index * 100} className="h-full">
                <div className={`rounded-[2rem] p-8 md:p-10 transition-all duration-500 hover:-translate-y-2 relative overflow-hidden flex flex-col h-full ${style.wrapper}`}>
                  
                  {/* Corner decoration */}
                  <div className={`absolute top-0 right-0 w-40 h-40 rounded-full -translate-y-1/2 translate-x-1/3 bg-gradient-to-br blur-2xl ${style.corner}`} />

                  {/* Popular badge */}
                  {style.badge && (
                    <div className="absolute top-0 inset-x-0">
                      <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white text-center py-1.5 text-xs font-bold uppercase tracking-widest shadow-sm">
                        {style.badge}
                      </div>
                    </div>
                  )}

                  <div className={`relative z-10 flex-1 flex flex-col ${style.badge ? 'pt-6' : ''}`}>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className={`text-2xl font-black ${style.title}`}>{plan.name}</h3>
                      {PlanIcon && <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-white/10 backdrop-blur-sm ${style.featureIcon}`}><PlanIcon className="w-6 h-6" /></div>}
                    </div>
                    
                    <p className={`mb-8 text-sm font-medium leading-relaxed min-h-[40px] ${style.unit}`}>{plan.description}</p>

                    <div className="mb-8 pb-8 border-b border-slate-200/20">
                      {isCustom || plan.price === 0 ? (
                        <div className="flex items-end gap-2">
                          <span className={`text-4xl md:text-5xl font-black tracking-tight ${style.price}`}>Liên hệ</span>
                        </div>
                      ) : (
                        <div className="flex items-end gap-2">
                          <span className={`text-4xl md:text-5xl font-black tracking-tight ${style.price}`}>
                            {(plan.price / 1000).toLocaleString('vi-VN')}K
                          </span>
                          <span className={`font-semibold mb-2 ${style.unit}`}>/tháng</span>
                        </div>
                      )}
                    </div>

                    <ul className="space-y-4 mb-8 flex-1">
                      {features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <FaCheckCircle className={`flex-shrink-0 w-5 h-5 mt-0.5 ${style.featureIcon}`} />
                          <span className={`text-sm font-medium leading-relaxed ${style.feature}`}>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={() => handlePlanClick(plan)}
                      className={`w-full py-4 rounded-xl font-bold text-sm tracking-wide transition-all duration-300 mt-auto ${style.button}`}
                    >
                      {isCustom || plan.price === 0 ? 'Nhận báo giá riêng' : 'Bắt đầu dùng thử'}
                    </button>
                  </div>
                </div>
              </AnimatedSection>
            );
          })}
        </div>

        <AnimatedSection className="text-center mt-16 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-full px-6 py-3 text-sm font-medium text-slate-600">
            <FaStar className="text-yellow-400 w-5 h-5" /> Tất cả các gói đều có <strong className="text-orange-600">14 ngày dùng thử miễn phí</strong>. Không cần thẻ tín dụng.
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
