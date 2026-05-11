import PricingSection from './components/PricingSection';

/**
 * Trang bảng giá — fit gọn trong 1 viewport, không scroll.
 * Hero và cards đặt sát nhau để cards có nhiều không gian nhất cho nội dung.
 */
export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white pt-24">
      {/* Hero ngắn gọn */}
      <div className="text-center px-6 mb-2">
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight">
          Bảng giá
        </h1>
        <p className="text-base md:text-lg text-slate-600 mt-2">
          Chọn gói phù hợp với doanh nghiệp của bạn. 14 ngày dùng thử miễn phí.
        </p>
      </div>

      {/* Pricing cards — sát ngay sau hero */}
      <PricingSection embedded compact />
    </div>
  );
}
