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

  if (!token) {
    return (
      <div className="w-full text-center space-y-4 py-8">
        <div className="w-16 h-16 mx-auto rounded-full bg-red-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900">Link không hợp lệ</h2>
        <p className="text-gray-500 text-sm">Vui lòng yêu cầu đặt lại mật khẩu lại từ đầu.</p>
        <Link to="/forgot-password" className="btn btn-primary block w-full">Quên mật khẩu</Link>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-10">
        <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight mb-2">Đặt lại mật khẩu</h1>
        <p className="text-slate-500 font-medium">Nhập mật khẩu mới cho tài khoản của bạn.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="space-y-1.5">
          <label className="block text-sm font-bold text-slate-700">Mật khẩu mới</label>
          <input
            type="password"
            className={`w-full px-4 py-3.5 border rounded-xl outline-none transition-all duration-200 bg-slate-50 focus:bg-white ${
              errors.password ? 'border-red-500 focus:border-red-500 focus:ring-4 focus:ring-red-500/10'
                              : 'border-slate-200 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10'
            }`}
            placeholder="Tối thiểu 6 ký tự"
            {...register('password', {
              required: 'Vui lòng nhập mật khẩu mới',
              minLength: { value: 6, message: 'Mật khẩu phải có ít nhất 6 ký tự' },
            })}
          />
          {errors.password && <p className="text-sm font-medium text-red-500 mt-1">{errors.password.message}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-bold text-slate-700">Xác nhận mật khẩu</label>
          <input
            type="password"
            className={`w-full px-4 py-3.5 border rounded-xl outline-none transition-all duration-200 bg-slate-50 focus:bg-white ${
              errors.confirmPassword ? 'border-red-500 focus:border-red-500 focus:ring-4 focus:ring-red-500/10'
                                     : 'border-slate-200 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10'
            }`}
            placeholder="Nhập lại mật khẩu mới"
            {...register('confirmPassword', {
              required: 'Vui lòng xác nhận mật khẩu',
              validate: (v) => v === password || 'Mật khẩu không khớp',
            })}
          />
          {errors.confirmPassword && <p className="text-sm font-medium text-red-500 mt-1">{errors.confirmPassword.message}</p>}
        </div>

        {serverError && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200">
            <p className="text-red-600 text-sm">{serverError}</p>
            {serverError.includes('hết hạn') && (
              <Link to="/forgot-password" className="text-red-700 font-semibold text-sm underline mt-1 block">
                Gửi lại yêu cầu đặt lại mật khẩu
              </Link>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3.5 px-6 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-xl transition-colors duration-200"
        >
          {isSubmitting ? 'Đang lưu...' : 'Xác nhận đặt lại mật khẩu'}
        </button>
      </form>
    </div>
  );
};

export default ResetPasswordPage;
