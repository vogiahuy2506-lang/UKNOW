import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import api from '../../services/api';

const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  const { register, handleSubmit, watch, formState: { errors } } = useForm();
  const password = watch('password');

  const onSubmit = async (values) => {
    setIsSubmitting(true);
    setServerError('');
    try {
      await api.post('/auth/reset-password', { token, password: values.password });
      navigate('/login?reset=1', { replace: true });
    } catch (err) {
      setServerError(err?.response?.data?.message || 'Không thể đặt lại mật khẩu. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputBase = 'w-full px-4 py-3.5 border rounded-xl outline-none transition-all duration-200 bg-white/8 text-white placeholder:text-white/30';
  const inputNormal = `${inputBase} border-white/12 focus:border-orange-400 focus:ring-4 focus:ring-orange-400/10`;
  const inputErr    = `${inputBase} border-red-400/60 focus:border-red-400 focus:ring-4 focus:ring-red-400/10`;

  if (!token) {
    return (
      <div className="w-full text-center space-y-4 py-8">
        <div className="w-16 h-16 mx-auto rounded-full bg-red-500/20 flex items-center justify-center">
          <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white">Link không hợp lệ</h2>
        <p className="text-white/50 text-sm">Vui lòng yêu cầu đặt lại mật khẩu lại từ đầu.</p>
        <Link
          to="/forgot-password"
          className="block w-full py-3.5 bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold rounded-xl text-center hover:shadow-lg transition-all active:scale-[0.98]"
        >
          Quên mật khẩu
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-white tracking-tight mb-1.5">Đặt lại mật khẩu</h1>
        <p className="text-white/50 font-medium text-sm">Nhập mật khẩu mới cho tài khoản của bạn.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="space-y-1.5">
          <label className="block text-sm font-bold text-white/70">Mật khẩu mới</label>
          <input
            type="password"
            className={errors.password ? inputErr : inputNormal}
            placeholder="Tối thiểu 6 ký tự"
            {...register('password', {
              required: 'Vui lòng nhập mật khẩu mới',
              minLength: { value: 6, message: 'Mật khẩu phải có ít nhất 6 ký tự' },
            })}
          />
          {errors.password && <p className="text-sm font-medium text-red-400 mt-1">{errors.password.message}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-bold text-white/70">Xác nhận mật khẩu</label>
          <input
            type="password"
            className={errors.confirmPassword ? inputErr : inputNormal}
            placeholder="Nhập lại mật khẩu mới"
            {...register('confirmPassword', {
              required: 'Vui lòng xác nhận mật khẩu',
              validate: (v) => v === password || 'Mật khẩu không khớp',
            })}
          />
          {errors.confirmPassword && <p className="text-sm font-medium text-red-400 mt-1">{errors.confirmPassword.message}</p>}
        </div>

        {serverError && (
          <div className="p-4 rounded-xl bg-red-900/30 border border-red-500/25">
            <p className="text-red-400 text-sm">{serverError}</p>
            {serverError.includes('hết hạn') && (
              <Link to="/forgot-password" className="text-red-300 font-semibold text-sm underline mt-1 block">
                Gửi lại yêu cầu đặt lại mật khẩu
              </Link>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-4 px-6 bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-orange-500/25 disabled:opacity-60 transition-all active:scale-[0.98] disabled:pointer-events-none"
        >
          {isSubmitting ? 'Đang lưu...' : 'Xác nhận đặt lại mật khẩu'}
        </button>
      </form>
    </div>
  );
};

export default ResetPasswordPage;
