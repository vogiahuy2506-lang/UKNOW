import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCheckCircle, FaCrown, FaGem } from 'react-icons/fa';
import AnimatedSection from '../../../components/AnimatedSection';
import { useAuthStore } from '../../../stores/authStore';
import { getPlans } from '../../../services/plan.service';

const ZALO_URL = 'https://zalo.me/0388180856';

// Icon và style cho từng gói theo code
const PLAN_STYLES = {
  basic: {
    wrapper: 'bg-white border border-gray-200',
    badge: null,
    title: 'text-gray-900',
    price: 'text-gray-900',
    unit: 'text-gray-500',
    feature: 'text-gray-600',
    featureIcon: 'text-green-500',
    button: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
    buttonLabel: 'Bắt đầu miễn phí',
    corner: 'from-gray-100 to-gray-200',
    icon: null,
  },
  pro: {
    wrapper: 'bg-gradient-to-br from-orange-500 to-red-500 scale-105 shadow-2xl',
    badge: { label: 'Phổ biến', icon: FaCrown },
    title: 'text-white',
    price: 'text-white',
    unit: 'text-orange-100',
    feature: 'text-white',
    featureIcon: 'text-white',
    button: 'bg-white text-orange-500 hover:bg-orange-50',
    buttonLabel: 'Bắt đầu ngay',
    corner: 'bg-white/10',
    icon: null,
  },
  custom: {
    wrapper: 'bg-white border border-gray-200',
    badge: null,
    title: 'text-gray-900',
    price: 'text-gray-900',
    unit: 'text-gray-500',
    feature: 'text-gray-600',
    featureIcon: 'text-green-500',
    button: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90',
    buttonLabel: 'Liên hệ tư vấn',
    corner: 'from-purple-100 to-purple-200',
    icon: FaGem,
  },
};

export default function PricingSection() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  const getPlansData = async () => {
    try {
      setLoading(true);
      const { data } = await getPlans()
      setPlans(data.plans || [])
    } catch (error) {
      console.error('Lỗi khi lấy dữ liệu gói:', error);
      setPlans([]);
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    getPlansData();
  }, []);

  const handlePlanClick = (plan) => {
    if (plan.code === 'custom') {
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

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto items-center">
          {plans.map((plan, index) => {
            const style = PLAN_STYLES[plan.code] || PLAN_STYLES.basic;
            const BadgeIcon = style.badge?.icon;
            const PlanIcon = style.icon;
            const features = Array.isArray(plan.features)
              ? plan.features
              : JSON.parse(plan.features || '[]');

            return (
              <AnimatedSection key={plan.id} delay={index * 100}>
                <div className={`rounded-3xl p-8 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 relative overflow-hidden ${style.wrapper}`}>
                  {/* Corner decoration */}
                  <div className={`absolute top-0 right-0 w-32 h-32 rounded-full -translate-y-1/2 translate-x-1/2 bg-gradient-to-br ${style.corner}`} />

                  {/* Popular badge */}
                  {style.badge && (
                    <div className="absolute top-4 right-4">
                      <span className="bg-white text-orange-500 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1">
                        {BadgeIcon && <BadgeIcon />} {style.badge.label}
                      </span>
                    </div>
                  )}

                  <div className="relative">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className={`text-2xl font-bold ${style.title}`}>{plan.name}</h3>
                      {PlanIcon && <PlanIcon className="text-purple-500" />}
                    </div>
                    <p className={`mb-6 ${style.unit}`}>{plan.description}</p>

                    <div className="mb-8">
                      {plan.code === 'custom' ? (
                        <span className={`text-3xl font-black ${style.price}`}>Liên hệ</span>
                      ) : (
                        <>
                          <span className={`text-5xl font-black ${style.price}`}>
                            {(plan.price / 1000).toFixed(0)}K
                          </span>
                          <span className={style.unit}>/tháng</span>
                        </>
                      )}
                    </div>

                    <ul className="space-y-4 mb-8">
                      {features.map((feature, i) => (
                        <li key={i} className="flex items-center gap-3">
                          <FaCheckCircle className={`flex-shrink-0 ${style.featureIcon}`} />
                          <span className={style.feature}>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={() => handlePlanClick(plan)}
                      className={`block w-full py-4 text-center rounded-xl font-bold transition-colors ${style.button}`}
                    >
                      {style.buttonLabel}
                    </button>
                  </div>
                </div>
              </AnimatedSection>
            );
          })}
        </div>

        <AnimatedSection className="text-center mt-12">
          <p className="text-gray-500">
            Tất cả các gói đều có <span className="text-orange-500 font-semibold">14 ngày dùng thử miễn phí</span>. Không cần thẻ tín dụng.
          </p>
        </AnimatedSection>
      </div>
    </section>
  );
}
