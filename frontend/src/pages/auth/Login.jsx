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

const inputBase = 'w-full border rounded-xl outline-none transition-all duration-200 bg-white/8 text-white placeholder:text-white/30';
const inputNormal = `${inputBase} border-white/12 focus:border-orange-400 focus:ring-4 focus:ring-orange-400/10`;
const inputError  = `${inputBase} border-red-400/60 focus:border-red-400 focus:ring-4 focus:ring-red-400/10`;

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
    <div className="w-full">
      {/* Banner đặt lại mật khẩu thành công */}
      {isPasswordReset && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-900/30 border border-emerald-500/25">
          <p className="text-emerald-300 font-semibold text-sm">Đặt lại mật khẩu thành công!</p>
          <p className="text-emerald-300/70 text-sm mt-1">Đăng nhập với mật khẩu mới của bạn.</p>
        </div>
      )}

      {/* Banner kích hoạt thành công */}
      {isActivated && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-900/30 border border-emerald-500/25">
          <p className="text-emerald-300 font-semibold text-sm">Tài khoản đã được kích hoạt!</p>
          <p className="text-emerald-300/70 text-sm mt-1">
            Đăng nhập với tên đăng nhập: <strong className="text-emerald-200">{activatedUsername}</strong>
            <br />
            Mật khẩu mặc định: <strong className="text-emerald-200">digiso@2026</strong>
            <br />
            <span className="text-emerald-400/80">Vui lòng đổi mật khẩu sau khi đăng nhập.</span>
          </p>
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-black text-white tracking-tight mb-1.5">Đăng nhập</h1>
        <p className="text-white/50 font-medium text-sm">Chào mừng bạn quay trở lại với Founder AI</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Username */}
        <div className="space-y-1.5">
          <label className="block text-sm font-bold text-white/70">Tên đăng nhập</label>
          <div className="relative group">
            <HiOutlineUser className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30 group-focus-within:text-orange-400 transition-colors" />
            <input
              type="text"
              {...register('username')}
              className={`${errors.username ? inputError : inputNormal} pl-12 pr-4 py-3.5`}
              placeholder="Nhập tên đăng nhập"
              autoComplete="username"
            />
          </div>
          {errors.username && (
            <p className="text-sm font-medium text-red-400 flex items-center gap-1 mt-1">
              <span className="w-1 h-1 rounded-full bg-red-400 inline-block" /> {errors.username.message}
            </p>
          )}
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <label className="block text-sm font-bold text-white/70">Mật khẩu</label>
          <div className="relative group">
            <HiOutlineLockClosed className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30 group-focus-within:text-orange-400 transition-colors" />
            <input
              type={showPassword ? 'text' : 'password'}
              {...register('password')}
              className={`${errors.password ? inputError : inputNormal} pl-12 pr-12 py-3.5`}
              placeholder="Nhập mật khẩu"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-orange-400 transition-colors p-1"
            >
              {showPassword ? <HiOutlineEyeOff className="w-5 h-5" /> : <HiOutlineEye className="w-5 h-5" />}
            </button>
          </div>
          {errors.password && (
            <p className="text-sm font-medium text-red-400 flex items-center gap-1 mt-1">
              <span className="w-1 h-1 rounded-full bg-red-400 inline-block" /> {errors.password.message}
            </p>
          )}
        </div>

        {/* Remember me & Forgot Password */}
        <div className="flex items-center justify-between pt-1">
          <label className="flex items-center cursor-pointer group">
            <input
              type="checkbox"
              {...register('rememberMe')}
              className="w-4 h-4 rounded border-white/20 text-orange-500 focus:ring-orange-500 cursor-pointer bg-white/8"
            />
            <span className="ml-2 text-sm font-medium text-white/55 group-hover:text-white/75 transition-colors">Ghi nhớ đăng nhập</span>
          </label>
          <Link to="/forgot-password" className="text-sm font-bold text-orange-400 hover:text-orange-300 transition-colors">
            Quên mật khẩu?
          </Link>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-4 px-4 bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold text-base rounded-xl hover:shadow-lg hover:shadow-orange-500/25 transition-all active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none mt-2"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Đang xử lý...
            </span>
          ) : 'Đăng nhập ngay'}
        </button>
      </form>

      {/* Divider */}
      <div className="flex items-center my-7">
        <div className="flex-1 border-t border-white/10" />
        <span className="px-4 text-xs font-bold text-white/35 uppercase tracking-widest">hoặc</span>
        <div className="flex-1 border-t border-white/10" />
      </div>

      {/* Google Login */}
      <div className="w-full flex justify-center">
        <GoogleLogin
          clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}
          onSuccess={handleGoogleSuccess}
          onError={handleGoogleError}
          theme="filled_black"
          size="large"
          width="100%"
          text="continue_with"
          shape="rectangular"
        />
      </div>

      {/* Register Link */}
      <div className="mt-7 text-center">
        <p className="text-sm font-medium text-white/50">
          Bạn chưa có tài khoản?{' '}
          <Link to="/register" className="font-bold text-orange-400 hover:text-orange-300 transition-colors ml-1">
            Tạo tài khoản miễn phí
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
