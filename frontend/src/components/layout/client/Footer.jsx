import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="bg-gray-950 text-gray-400 py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="flex items-center mb-8 md:mb-0">
            <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl flex items-center justify-center">
              <span className="text-white font-black text-xl">U</span>
            </div>
            <span className="ml-3 text-2xl font-bold text-white">UKNOW</span>
          </div>
          <div className="flex flex-wrap justify-center gap-8 text-sm">
            <a href="#" className="hover:text-orange-500 transition-colors">Điều khoản sử dụng</a>
            <a href="#" className="hover:text-orange-500 transition-colors">Chính sách bảo mật</a>
            <a href="#" className="hover:text-orange-500 transition-colors">Liên hệ</a>
          </div>
        </div>
        <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm">
          © 2024 UKNOW Campaign. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
