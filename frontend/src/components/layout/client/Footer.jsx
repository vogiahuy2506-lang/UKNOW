import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="bg-slate-950 text-slate-400 py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <Link to="/" className="flex items-center mb-8 md:mb-0 group">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105">
              <span className="text-white font-black text-xl">F</span>
            </div>
            <span className="ml-3 text-2xl font-black text-white tracking-tight">Founder AI</span>
          </Link>
          <div className="flex flex-wrap justify-center gap-8 text-sm">
            <Link to="/" className="hover:text-orange-500 transition-colors">Trang chủ</Link>
            <Link to="/pricing" className="hover:text-orange-500 transition-colors">Bảng giá</Link>
            <Link to="/contact" className="hover:text-orange-500 transition-colors">Liên hệ</Link>
            <a href="/privacy-policy" className="hover:text-orange-500 transition-colors">Chính sách bảo mật</a>
            <a href="/login" className="hover:text-orange-500 transition-colors">Đăng nhập</a>
          </div>
        </div>
        <div className="border-t border-slate-800 mt-8 pt-8 text-center text-sm">
          © 2026 Founder AI Marketing Platform. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
