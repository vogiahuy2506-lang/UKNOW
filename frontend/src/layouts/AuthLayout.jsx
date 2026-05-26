import { Link } from 'react-router-dom';
import { FaCheckCircle, FaStar } from 'react-icons/fa';
import founderaiLogo from '../assets/icons/founderai-logo.png';

const FEATURES = [
  'Triển khai tự động hóa trong 5 phút',
  'Landing Page Builder kéo thả trực quan',
  'Bảo mật dữ liệu Cloud cao cấp',
];

const GLASS_LEFT = {
  background: 'rgba(12, 10, 20, 0.18)',
  backdropFilter: 'blur(22px)',
  WebkitBackdropFilter: 'blur(22px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRight: 'none',
  boxShadow: '0 28px 80px rgba(0,0,0,0.4)',
};

const GLASS_RIGHT = {
  background: 'rgba(12, 10, 20, 0.82)',
  backdropFilter: 'blur(22px)',
  WebkitBackdropFilter: 'blur(22px)',
  border: '1px solid rgba(255,255,255,0.09)',
  boxShadow: '0 28px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
};

const AuthLayout = ({ children }) => {
  return (
    <div className="min-h-screen relative overflow-x-hidden font-sans selection:bg-orange-500 selection:text-white">
      {/* Video background */}
      <video
        className="fixed inset-0 w-full h-full object-cover pointer-events-none"
        style={{ zIndex: 0 }}
        src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260403_050628_c4e32401-fab4-4a27-b7a8-6e9291cd5959.mp4"
        autoPlay loop muted playsInline preload="auto"
      />


      {/* Two equal panels */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-6">
        <div className="flex w-full max-w-[920px] items-stretch my-auto">

          {/* Left panel: Branding (desktop only) */}
          <div
            className="hidden lg:flex flex-1 flex-col justify-between rounded-l-3xl p-10 auth-dark"
            style={GLASS_LEFT}
          >
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2.5 hover:opacity-70 transition-opacity w-fit">
              <img src={founderaiLogo} alt="Founder AI" className="w-9 h-9 object-contain" />
              <span className="text-white font-bold text-lg tracking-tight">Founder AI</span>
            </Link>

            {/* Headline */}
            <div className="my-auto py-10">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/12 bg-white/5 mb-8">
                <FaStar className="text-yellow-400 w-3.5 h-3.5" />
                <span className="text-[11px] font-bold text-orange-200 uppercase tracking-widest">Nền tảng số 1 Việt Nam</span>
              </div>

              <h2 className="text-3xl xl:text-4xl font-black text-white leading-[1.2] tracking-tight mb-5">
                Khởi tạo hành trình<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-400">
                  Tăng trưởng đột phá
                </span>
              </h2>
              <p className="text-base text-white/50 leading-relaxed mb-10">
                Hệ sinh thái tự động hóa Marketing, thu thập Lead và chăm sóc khách hàng đa kênh dành cho doanh nghiệp Việt.
              </p>

              <div className="space-y-4">
                {FEATURES.map((text, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0">
                      <FaCheckCircle className="text-orange-400 w-3.5 h-3.5" />
                    </div>
                    <span className="text-sm text-white/75 font-medium">{text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-5 text-xs font-medium text-white/25">
              <span>© 2026 Founder AI Marketing</span>
              <Link to="/privacy-policy" className="hover:text-orange-400 transition-colors">Bảo mật</Link>
              <a href="mailto:support@founderai.biz" className="hover:text-orange-400 transition-colors">Hỗ trợ</a>
            </div>
          </div>

          {/* Right panel: Form */}
          <div
            className="flex-1 rounded-r-3xl lg:rounded-l-none rounded-l-3xl p-8 sm:p-10 auth-dark flex flex-col justify-center overflow-y-auto max-h-[calc(100vh-3rem)]"
            style={GLASS_RIGHT}
          >
            {/* Mobile logo */}
            <Link to="/" className="lg:hidden flex items-center gap-2.5 mb-8 hover:opacity-70 transition-opacity w-fit">
              <img src={founderaiLogo} alt="Founder AI" className="w-8 h-8 object-contain" />
              <span className="text-white font-bold text-[17px] tracking-tight">Founder AI</span>
            </Link>

            {children}
          </div>

        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
