import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';
import { HiOutlineUser, HiOutlineLockClosed, HiOutlineEye, HiOutlineEyeOff } from 'react-icons/hi';
import { GoogleLogin } from '@react-oauth/google';

const loginSchema = z.object({
  username: z.string().min(1, 'Vui lòng nhập tên đăng nhập'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
  rememberMe: z.boolean().optional(),
});

const Login = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, googleLogin } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSuccess = async (credentialResponse) => {
    setIsLoading(true);
    try {
      const result = await googleLogin(credentialResponse.credential);
      toast.success('Đăng nhập Google thành công!');
      const role = result?.data?.user?.role;
      navigate(role === 'admin' ? '/admin' : '/app');
    } catch (error) {
      const message = error.response?.data?.message || 'Đăng nhập Google thất bại';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleError = () => {
    toast.error('Lỗi khi kết nối với Google');
  };

  const isActivated = searchParams.get('activated') === '1';
  const activatedUsername = searchParams.get('username') || '';
  const isPasswordReset = searchParams.get('reset') === '1';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { rememberMe: true },
  });

  const onSubmit = async (data) => {
    setIsLoading(true);
    try {
      const result = await login(data.username, data.password, data.rememberMe ?? true);
      toast.success('Đăng nhập thành công!');
      const role = result?.data?.user?.role;
      navigate(role === 'admin' ? '/admin' : '/app');
    } catch (error) {
      const message = error.response?.data?.message || 'Đăng nhập thất bại';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="w-full">
        {/* Banner đặt lại mật khẩu thành công */}
        {isPasswordReset && (
          <div className="mb-6 p-4 rounded-xl bg-green-50 border border-green-200">
            <p className="text-green-800 font-semibold text-sm">Đặt lại mật khẩu thành công!</p>
            <p className="text-green-700 text-sm mt-1">Đăng nhập với mật khẩu mới của bạn.</p>
          </div>
        )}

        {/* Banner kích hoạt thành công */}
        {isActivated && (
          <div className="mb-6 p-4 rounded-xl bg-green-50 border border-green-200">
            <p className="text-green-800 font-semibold text-sm">Tài khoản đã được kích hoạt!</p>
            <p className="text-green-700 text-sm mt-1">
              Đăng nhập với tên đăng nhập: <strong>{activatedUsername}</strong>
              <br />
              Mật khẩu mặc định: <strong>digiso@2026</strong>
              <br />
              <span className="text-green-600">Vui lòng đổi mật khẩu sau khi đăng nhập.</span>
            </p>
          </div>
        )}

        {/* Header */}
        <div className="mb-10 lg:mb-12">
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight mb-2">Đăng nhập</h1>
          <p className="text-slate-500 font-medium">Chào mừng bạn quay trở lại với nền tảng Founder AI</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Username */}
          <div className="space-y-1.5">
            <label className="block text-sm font-bold text-slate-700">
              Tên đăng nhập
            </label>
            <div className="relative group">
              <HiOutlineUser className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
              <input
                type="text"
                {...register('username')}
                className={`w-full pl-12 pr-4 py-3.5 border rounded-xl outline-none transition-all duration-200 bg-slate-50 focus:bg-white ${errors.username ? 'border-red-500 focus:border-red-500 focus:ring-4 focus:ring-red-500/10' : 'border-slate-200 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10'}`}
                placeholder="Nhập tên đăng nhập"
                autoComplete="username"
              />
            </div>
            {errors.username && (
              <p className="text-sm font-medium text-red-500 flex items-center gap-1 mt-1"><span className="w-1 h-1 rounded-full bg-red-500 inline-block"></span> {errors.username.message}</p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="block text-sm font-bold text-slate-700">
              Mật khẩu
            </label>
            <div className="relative group">
              <HiOutlineLockClosed className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
              <input
                type={showPassword ? 'text' : 'password'}
                {...register('password')}
                className={`w-full pl-12 pr-12 py-3.5 border rounded-xl outline-none transition-all duration-200 bg-slate-50 focus:bg-white ${errors.password ? 'border-red-500 focus:border-red-500 focus:ring-4 focus:ring-red-500/10' : 'border-slate-200 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10'}`}
                placeholder="Nhập mật khẩu"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-orange-500 transition-colors p-1"
              >
                {showPassword ? (
                  <HiOutlineEyeOff className="w-5 h-5" />
                ) : (
                  <HiOutlineEye className="w-5 h-5" />
                )}
              </button>
            </div>
            {errors.password && (
              <p className="text-sm font-medium text-red-500 flex items-center gap-1 mt-1"><span className="w-1 h-1 rounded-full bg-red-500 inline-block"></span> {errors.password.message}</p>
            )}
          </div>

          {/* Remember me & Forgot Password (mock) */}
          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center cursor-pointer group">
              <input
                type="checkbox"
                {...register('rememberMe')}
                className="w-4 h-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500 cursor-pointer"
              />
              <span className="ml-2 text-sm font-medium text-slate-600 group-hover:text-slate-900 transition-colors">Ghi nhớ đăng nhập</span>
            </label>
            <Link to="/forgot-password" className="text-sm font-bold text-orange-500 hover:text-orange-600 transition-colors">Quên mật khẩu?</Link>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 px-4 bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold text-base rounded-xl hover:shadow-lg hover:shadow-orange-500/30 transition-all transform active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none mt-4"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Đang xử lý...
              </span>
            ) : (
              'Đăng nhập ngay'
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center my-8">
          <div className="flex-1 border-t border-slate-200"></div>
          <span className="px-4 text-xs font-bold text-slate-400 uppercase tracking-widest">hoặc</span>
          <div className="flex-1 border-t border-slate-200"></div>
        </div>

        {/* Google Login */}
        <div className="w-full flex justify-center">
          <GoogleLogin
            clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}
            onSuccess={handleGoogleSuccess}
            onError={handleGoogleError}
            theme="outline"
            size="large"
            width="100%"
            text="continue_with"
            shape="rectangular"
          />
        </div>

        {/* Register Link */}
        <div className="mt-8 text-center">
          <p className="text-sm font-medium text-slate-600">
            Bạn chưa có tài khoản?{' '}
            <Link
              to="/register"
              className="font-bold text-orange-500 hover:text-orange-600 transition-colors ml-1"
            >
              Tạo tài khoản miễn phí
            </Link>
          </p>
        </div>
      </div>

    </>
  );
};

export default Login;
