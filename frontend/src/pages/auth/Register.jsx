import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';
import EmailAuthModal from '../../components/auth/EmailAuthModal';
import {
  HiOutlineLockClosed,
  HiOutlineEye,
  HiOutlineEyeOff,
  HiOutlineUser,
  HiOutlinePhone,
  HiOutlineMail
} from 'react-icons/hi';

const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'Tên đăng nhập phải có ít nhất 3 ký tự')
    .max(50, 'Tên đăng nhập không được quá 50 ký tự')
    .regex(
      /^[A-Za-z0-9]+$/,
      'Tên đăng nhập chỉ được chứa chữ cái không dấu và số'
    ),
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu phải có ít nhất 6 ký tự'),
  confirmPassword: z.string(),
  fullName: z.string().optional(),
  phone: z
    .string()
    .optional()
    .refine((value) => !value || /^[0-9]{10,11}$/.test(value), {
      message: 'Số điện thoại không hợp lệ',
    }),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Mật khẩu xác nhận không khớp',
  path: ['confirmPassword'],
});

const Register = () => {
  const navigate = useNavigate();
  const { register: registerUser } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showEmailAuth, setShowEmailAuth] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data) => {
    setIsLoading(true);
    try {
      await registerUser({
        username: data.username,
        email: data.email,
        password: data.password,
        fullName: data.fullName?.trim() ? data.fullName : undefined,
        phone: data.phone?.trim() ? data.phone : undefined,
      });
      toast.success('Đăng ký thành công!');
      navigate('/');
    } catch (error) {
      const apiErrors = error.response?.data?.errors;
      const message = apiErrors?.[0]?.msg || error.response?.data?.message || 'Đăng ký thất bại';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="w-full max-w-[480px] mx-auto">
        {/* Header */}
        <div className="mb-8 lg:mb-10">
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight mb-2">Đăng ký tài khoản</h1>
          <p className="text-slate-500 font-medium">Bắt đầu trải nghiệm UKNOW miễn phí</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Username & Email row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-slate-700">
                Tên đăng nhập <span className="text-red-500">*</span>
              </label>
              <div className="relative group">
                <HiOutlineUser className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
                <input
                  type="text"
                  {...register('username')}
                  className={`w-full pl-10 pr-3 py-3 border rounded-xl outline-none transition-all duration-200 bg-slate-50 focus:bg-white ${errors.username ? 'border-red-500 focus:border-red-500 focus:ring-4 focus:ring-red-500/10' : 'border-slate-200 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10'}`}
                  placeholder="john_doe"
                />
              </div>
              {errors.username && (
                <p className="text-xs font-medium text-red-500 flex items-start gap-1 mt-1"><span className="w-1 h-1 rounded-full bg-red-500 inline-block mt-1 flex-shrink-0"></span> <span>{errors.username.message}</span></p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-slate-700">
                Email <span className="text-red-500">*</span>
              </label>
              <div className="relative group">
                <HiOutlineMail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
                <input
                  type="email"
                  {...register('email')}
                  className={`w-full pl-10 pr-3 py-3 border rounded-xl outline-none transition-all duration-200 bg-slate-50 focus:bg-white ${errors.email ? 'border-red-500 focus:border-red-500 focus:ring-4 focus:ring-red-500/10' : 'border-slate-200 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10'}`}
                  placeholder="name@company.com"
                />
              </div>
              {errors.email && (
                <p className="text-xs font-medium text-red-500 flex items-start gap-1 mt-1"><span className="w-1 h-1 rounded-full bg-red-500 inline-block mt-1 flex-shrink-0"></span> <span>{errors.email.message}</span></p>
              )}
            </div>
          </div>

          {/* Full Name & Phone row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-slate-700">
                Họ và tên
              </label>
              <div className="relative group">
                <HiOutlineUser className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
                <input
                  type="text"
                  {...register('fullName')}
                  className="w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl outline-none transition-all duration-200 bg-slate-50 focus:bg-white focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
                  placeholder="Nguyễn Văn A"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-slate-700">
                Số điện thoại
              </label>
              <div className="relative group">
                <HiOutlinePhone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
                <input
                  type="tel"
                  {...register('phone')}
                  className="w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl outline-none transition-all duration-200 bg-slate-50 focus:bg-white focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
                  placeholder="0901234567"
                />
              </div>
              {errors.phone && (
                <p className="text-xs font-medium text-red-500 flex items-start gap-1 mt-1"><span className="w-1 h-1 rounded-full bg-red-500 inline-block mt-1 flex-shrink-0"></span> <span>{errors.phone.message}</span></p>
              )}
            </div>
          </div>

          {/* Password & Confirm row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-slate-700">
                Mật khẩu <span className="text-red-500">*</span>
              </label>
              <div className="relative group">
                <HiOutlineLockClosed className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  {...register('password')}
                  className={`w-full pl-10 pr-10 py-3 border rounded-xl outline-none transition-all duration-200 bg-slate-50 focus:bg-white ${errors.password ? 'border-red-500 focus:border-red-500 focus:ring-4 focus:ring-red-500/10' : 'border-slate-200 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10'}`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-orange-500 transition-colors p-1"
                >
                  {showPassword ? <HiOutlineEyeOff className="w-4 h-4" /> : <HiOutlineEye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs font-medium text-red-500 flex items-start gap-1 mt-1"><span className="w-1 h-1 rounded-full bg-red-500 inline-block mt-1 flex-shrink-0"></span> <span>{errors.password.message}</span></p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-slate-700">
                Xác nhận <span className="text-red-500">*</span>
              </label>
              <div className="relative group">
                <HiOutlineLockClosed className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  {...register('confirmPassword')}
                  className={`w-full pl-10 pr-10 py-3 border rounded-xl outline-none transition-all duration-200 bg-slate-50 focus:bg-white ${errors.confirmPassword ? 'border-red-500 focus:border-red-500 focus:ring-4 focus:ring-red-500/10' : 'border-slate-200 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10'}`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-orange-500 transition-colors p-1"
                >
                  {showConfirmPassword ? <HiOutlineEyeOff className="w-4 h-4" /> : <HiOutlineEye className="w-4 h-4" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-xs font-medium text-red-500 flex items-start gap-1 mt-1"><span className="w-1 h-1 rounded-full bg-red-500 inline-block mt-1 flex-shrink-0"></span> <span>{errors.confirmPassword.message}</span></p>
              )}
            </div>
          </div>

          {/* Terms */}
          <div className="flex items-start pt-2">
            <input
              type="checkbox"
              required
              className="w-4 h-4 mt-0.5 rounded border-slate-300 text-orange-500 focus:ring-orange-500 cursor-pointer"
            />
            <span className="ml-2.5 text-xs text-slate-600 font-medium leading-relaxed">
              Tôi đồng ý với{' '}
              <a href="#" className="text-orange-600 hover:text-orange-700 font-bold hover:underline transition-colors">
                Điều khoản sử dụng
              </a>{' '}
              và{' '}
              <a href="#" className="text-orange-600 hover:text-orange-700 font-bold hover:underline transition-colors">
                Chính sách bảo mật
              </a>
            </span>
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
                Đang đăng ký...
              </span>
            ) : (
              'Tạo tài khoản'
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center my-8">
          <div className="flex-1 border-t border-slate-200"></div>
          <span className="px-4 text-xs font-bold text-slate-400 uppercase tracking-widest">hoặc</span>
          <div className="flex-1 border-t border-slate-200"></div>
        </div>

        {/* Google Register */}
        <button
          type="button"
          onClick={() => setShowEmailAuth(true)}
          className="w-full py-3.5 px-4 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center justify-center gap-3 shadow-sm"
        >
          <GoogleIcon />
          Đăng ký bằng Google
        </button>

        {/* Login link */}
        <div className="mt-8 text-center">
          <p className="text-sm font-medium text-slate-600">
            Đã có tài khoản?{' '}
            <Link
              to="/login"
              className="font-bold text-orange-500 hover:text-orange-600 transition-colors ml-1"
            >
              Đăng nhập ngay
            </Link>
          </p>
        </div>
      </div>

      <EmailAuthModal 
        isOpen={showEmailAuth} 
        onClose={() => setShowEmailAuth(false)}
        mode="register"
      />
    </>
  );
};

export default Register;
