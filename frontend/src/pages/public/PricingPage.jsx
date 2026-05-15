import PricingSection from './components/PricingSection';

export default function PricingPage() {
  return (
    <div className="relative min-h-screen">
      <div className="relative pt-4 pb-6">
        {/* Hero heading */}
        <div className="text-center px-6 pt-6 pb-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-1.5">
            Founder AI
          </p>
          <h1
            className="font-black text-white"
            style={{ fontSize: 'clamp(28px, 4vw, 48px)', lineHeight: 1.05, letterSpacing: '-0.02em' }}
          >
            Bảng giá
          </h1>
        </div>

        <PricingSection embedded glass compact />
      </div>
    </div>
  );
}
