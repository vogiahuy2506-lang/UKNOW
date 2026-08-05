import { useI18n } from '../../i18n';
import { usePublicLandingOverrides } from '../../features/landing-customizer';
import PublicFooter from './components/PublicFooter';
import AnimatedSection from '../../components/AnimatedSection';
import PricingSection from './components/PricingSection';
import { FaCheck } from 'react-icons/fa';

const faqs = [
  {
    q: 'Tôi có cần thẻ tín dụng để dùng thử không?',
    a: 'Không. Bạn chỉ cần đăng ký bằng email để bắt đầu dùng thử 14 ngày.',
  },
  {
    q: 'Tôi có thể nâng cấp hoặc hạ cấp gói dịch vụ không?',
    a: 'Có. Bạn có thể thay đổi gói bất kỳ lúc nào từ trang quản lý tài khoản.',
  },
  {
    q: 'Chi phí có bao gồm thuế VAT không?',
    a: 'Giá hiển thị chưa bao gồm VAT 10%. Bạn có thể yêu cầu xuất hóa đơn GTGT.',
  },
  {
    q: 'Founder AI có hỗ trợ setup ban đầu không?',
    a: 'Gói Professional và Enterprise được hỗ trợ setup miễn phí trong 30 phút đầu tiên.',
  },
];

export default function PricingPage() {
  const { t } = useI18n();
  const { getOverride } = usePublicLandingOverrides('pricing');

  const getValue = (key, fallback) => {
    const override = getOverride(key);
    return override || fallback;
  };

  return (
    <div className="min-h-screen bg-white">
      {/* ── Hero Section ── */}
      <section className="relative px-6 pt-12 pb-16 md:pt-16 md:pb-24 overflow-hidden">
        {/* Background dots */}
        <div className="absolute inset-0 opacity-[0.3]" style={{
          backgroundColor: '#f8fafc',
          backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }} />

        {/* Decorative shapes */}
        <div className="absolute top-20 left-12 w-20 h-20 border border-orange-200 rounded-full opacity-40" />
        <div className="absolute top-40 left-24 w-12 h-12 border border-blue-200 rounded-2xl rotate-12 opacity-40" />
        <div className="absolute bottom-16 right-20 w-16 h-16 border border-purple-200 rounded-full opacity-40" />
        <div className="absolute bottom-32 right-32 w-8 h-8 bg-orange-100 rounded-lg rotate-45 opacity-30" />

        <div className="max-w-4xl mx-auto text-center relative z-10">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 text-slate-700 text-sm font-medium mb-8">
            <span className="w-2 h-2 rounded-full bg-orange-500" />
            <span data-edit="pricing.badge">{getValue('pricing.badge', 'Founder AI')}</span>
          </div>

          {/* Title */}
          <h1
            className="text-slate-900 mb-6"
            style={{ fontSize: 'clamp(32px, 6vw, 56px)', lineHeight: 1.15, fontWeight: 600 }}
            data-edit="pricing.title"
          >
            Giá cả hợp lý,{' '}
            <span className="text-orange-500">hiệu quả thật</span>
          </h1>

          {/* Subtitle */}
          <p
            className="text-slate-600 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed"
            data-edit="pricing.subtitle"
          >
            Dùng thử 14 ngày không cần thẻ. Không phí khởi tạo, không ràng buộc.
          </p>

          {/* Trust indicators */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-500">
            <span className="flex items-center gap-2">
              <FaCheck className="w-4 h-4 text-green-500" />
              Miễn phí 14 ngày đầu
            </span>
            <span className="flex items-center gap-2">
              <FaCheck className="w-4 h-4 text-green-500" />
              Không phí khởi tạo
            </span>
            <span className="flex items-center gap-2">
              <FaCheck className="w-4 h-4 text-green-500" />
              Hủy bất kỳ lúc nào
            </span>
          </div>
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="max-w-6xl mx-auto px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
      </div>

      {/* ── Pricing Cards (fetched from /api/plans) ── */}
      <PricingSection embedded />

      {/* ── Divider ── */}
      <div className="max-w-6xl mx-auto px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
      </div>

      {/* ── FAQ ── */}
      <section className="py-20 md:py-28 bg-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.3]" style={{
          backgroundColor: '#f8fafc',
          backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }} />

        <div className="max-w-3xl mx-auto px-6 relative z-10">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-semibold text-slate-900 mb-4">
              Câu hỏi thường gặp
            </h2>
            <p className="text-slate-600">
              Nếu bạn có câu hỏi khác, hãy liên hệ với chúng tôi.
            </p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <AnimatedSection key={i} delay={i * 60}>
                <div className="bg-white border border-slate-200 rounded-xl p-6 hover:border-orange-200 transition-colors">
                  <h3 className="text-base font-semibold text-slate-900 mb-2">{faq.q}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{faq.a}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
