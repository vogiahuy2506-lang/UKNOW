import { Link } from 'react-router-dom';
import { FaCheckCircle, FaStar } from 'react-icons/fa';

const AuthLayout = ({ children }) => {
  return (
    <div className="min-h-screen flex bg-white font-sans selection:bg-orange-500 selection:text-white">
      {/* Left side: Branding / Marketing */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden bg-slate-900 flex-col justify-between p-12 lg:p-16">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-600/30 via-slate-900 to-slate-900"></div>
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-orange-500/10 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-red-500/10 rounded-full blur-[100px] translate-y-1/3 -translate-x-1/3 pointer-events-none"></div>
        
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/30">
            <span className="text-white font-black text-xl">U</span>
          </div>
          <Link to="/" className="text-2xl font-black text-white tracking-tight hover:opacity-80 transition-opacity">KNOW</Link>
        </div>

        <div className="relative z-10 my-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/5 backdrop-blur-md rounded-full border border-white/10 mb-8">
            <FaStar className="text-yellow-400 w-4 h-4" />
            <span className="text-xs font-bold text-orange-100 uppercase tracking-widest">Nền tảng số 1 Việt Nam</span>
          </div>
          <h1 className="text-4xl lg:text-5xl font-black text-white mb-6 leading-[1.2] tracking-tight">
            Khởi tạo hành trình <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-400">Tăng trưởng đột phá</span>
          </h1>
          <p className="text-lg text-slate-400 max-w-md leading-relaxed mb-12">
            Hệ sinh thái tự động hóa quy trình Marketing, thu thập Lead và chăm sóc khách hàng đa kênh dành cho doanh nghiệp.
          </p>

          <div className="space-y-5">
            <div className="flex items-center gap-4 text-slate-300 font-medium">
              <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                <FaCheckCircle className="text-orange-400 w-4 h-4" />
              </div>
              <span>Triển khai tự động hóa siêu tốc trong 5 phút</span>
            </div>
            <div className="flex items-center gap-4 text-slate-300 font-medium">
              <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                <FaCheckCircle className="text-orange-400 w-4 h-4" />
              </div>
              <span>Giao diện kéo thả Landing Page trực quan</span>
            </div>
            <div className="flex items-center gap-4 text-slate-300 font-medium">
              <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                <FaCheckCircle className="text-orange-400 w-4 h-4" />
              </div>
              <span>Bảo mật dữ liệu trên hạ tầng Cloud cao cấp</span>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-6 text-sm font-semibold text-slate-500">
          <span>© 2026 Founder AI Marketing.</span>
          <Link to="/privacy-policy" className="hover:text-orange-400 transition-colors">Bảo mật</Link>
          <a href="mailto:support@Founder AI.vn" className="hover:text-orange-400 transition-colors">Hỗ trợ</a>
        </div>
      </div>

      {/* Right side: Form Container */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 bg-slate-50 lg:bg-white relative">
        <div className="lg:hidden absolute top-6 left-6 flex items-center gap-2">
          <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/30">
            <span className="text-white font-black text-xl">U</span>
          </div>
          <Link to="/" className="text-2xl font-black text-slate-900 tracking-tight">KNOW</Link>
        </div>

        {/* Subtle background decoration for mobile/tablet */}
        <div className="lg:hidden absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-orange-200 rounded-full opacity-30 blur-3xl"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-red-200 rounded-full opacity-20 blur-3xl"></div>
        </div>

        <div className="w-full max-w-[420px] relative z-10">
          {children}
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
