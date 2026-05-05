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
      <div className="mb-10">
        <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight mb-2">Quên mật khẩu</h1>
        <p className="text-slate-500 font-medium">
          Nhập email của bạn, chúng tôi sẽ gửi link đặt lại mật khẩu.
        </p>
      </div>

      {submitted ? (
        <div className="space-y-6">
          <div className="p-5 rounded-xl bg-green-50 border border-green-200 text-center space-y-2">
            <div className="w-12 h-12 mx-auto rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-green-800 font-semibold">Đã gửi email!</p>
            <p className="text-green-700 text-sm">
              Kiểm tra hộp thư <strong>{email}</strong> và làm theo hướng dẫn. Link có hiệu lực trong <strong>1 giờ</strong>.
            </p>
            <p className="text-green-600 text-xs">Không thấy email? Kiểm tra thư mục spam.</p>
          </div>
          <Link to="/login" className="btn btn-primary w-full block text-center">
            Quay lại đăng nhập
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="block text-sm font-bold text-slate-700">Email</label>
            <input
              type="email"
              className={`w-full px-4 py-3.5 border rounded-xl outline-none transition-all duration-200 bg-slate-50 focus:bg-white ${
                error ? 'border-red-500 focus:border-red-500 focus:ring-4 focus:ring-red-500/10'
                      : 'border-slate-200 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10'
              }`}
              placeholder="email@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              autoComplete="email"
            />
            {error && <p className="text-sm font-medium text-red-500 mt-1">{error}</p>}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 px-6 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-xl transition-colors duration-200"
          >
            {isLoading ? 'Đang gửi...' : 'Gửi link đặt lại mật khẩu'}
          </button>

          <p className="text-center text-sm text-slate-500">
            <Link to="/login" className="font-bold text-orange-500 hover:text-orange-600 transition-colors">
              Quay lại đăng nhập
            </Link>
          </p>
        </form>
      )}
    </div>
  );
};

export default ForgotPasswordPage;
