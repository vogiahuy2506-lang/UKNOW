import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) {
      setError('Vui lòng nhập email');
      return;
    }
    setIsLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      setSubmitted(true);
    } catch {
      setError('Không thể gửi email. Vui lòng thử lại sau.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-white tracking-tight mb-1.5">Quên mật khẩu</h1>
        <p className="text-white/50 font-medium text-sm">
          Nhập email của bạn, chúng tôi sẽ gửi link đặt lại mật khẩu.
        </p>
      </div>

      {submitted ? (
        <div className="space-y-6">
          <div className="p-5 rounded-xl bg-emerald-900/30 border border-emerald-500/25 text-center space-y-2">
            <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-emerald-300 font-semibold">Đã gửi email!</p>
            <p className="text-emerald-300/70 text-sm">
              Kiểm tra hộp thư <strong className="text-emerald-200">{email}</strong> và làm theo hướng dẫn.
              Link có hiệu lực trong <strong className="text-emerald-200">1 giờ</strong>.
            </p>
            <p className="text-emerald-400/60 text-xs">Không thấy email? Kiểm tra thư mục spam.</p>
          </div>
          <Link
            to="/login"
            className="block w-full py-3.5 text-center bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-orange-500/25 transition-all active:scale-[0.98]"
          >
            Quay lại đăng nhập
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="block text-sm font-bold text-white/70">Email</label>
            <input
              type="email"
              className={`w-full px-4 py-3.5 border rounded-xl outline-none transition-all duration-200 bg-white/8 text-white placeholder:text-white/30 ${
                error
                  ? 'border-red-400/60 focus:border-red-400 focus:ring-4 focus:ring-red-400/10'
                  : 'border-white/12 focus:border-orange-400 focus:ring-4 focus:ring-orange-400/10'
              }`}
              placeholder="email@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              autoComplete="email"
            />
            {error && <p className="text-sm font-medium text-red-400 mt-1">{error}</p>}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 px-6 bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-orange-500/25 disabled:opacity-60 transition-all active:scale-[0.98] disabled:pointer-events-none"
          >
            {isLoading ? 'Đang gửi...' : 'Gửi link đặt lại mật khẩu'}
          </button>

          <p className="text-center text-sm text-white/45">
            <Link to="/login" className="font-bold text-orange-400 hover:text-orange-300 transition-colors">
              Quay lại đăng nhập
            </Link>
          </p>
        </form>
      )}
    </div>
  );
};

export default ForgotPasswordPage;
