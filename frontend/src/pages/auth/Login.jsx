import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';
import { useI18n } from '../../i18n';
import { HiOutlineUser, HiOutlineLockClosed, HiOutlineEye, HiOutlineEyeOff } from 'react-icons/hi';
import GoogleAuthButton from '../../components/GoogleAuthButton';
import { getPostAuthPath } from '../../utils/authRedirect';

const Login = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, googleLogin } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const loginSchema = z.object({
    username: z.string().min(1, t('auth.emailRequired')),
    password: z.string().min(1, t('auth.passwordRequired')),
    rememberMe: z.boolean().optional(),
  });

  const handleGoogleSuccess = async (tokenResponse) => {
    setIsLoading(true);
    try {
      const result = await googleLogin({ access_token: tokenResponse.access_token });
      toast.success(t('auth.googleLoginSuccess'));
      navigate(getPostAuthPath(result?.data?.user));
    } catch (error) {
      const message = error.response?.data?.message || t('auth.googleLoginFailed');
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleError = () => {
    toast.error(t('auth.googleError'));
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
      toast.success(t('common.success'));
      navigate(getPostAuthPath(result?.data?.user));
    } catch (error) {
      const message = error.response?.data?.message || t('auth.invalidCredentials');
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Banner đặt lại mật khẩu */}
      {isPasswordReset && (
        <div className="mb-5 p-3 rounded-xl bg-green-50 border border-green-200">
          <p className="text-green-700 font-medium text-sm">{t('auth.passwordChanged')}</p>
        </div>
      )}

      {/* Banner kích hoạt */}
      {isActivated && (
        <div className="mb-5 p-3 rounded-xl bg-orange-50 border border-orange-200">
          <p className="text-orange-700 font-medium text-sm">{t('auth.accountActivated')}</p>
          <p className="text-orange-600 text-xs mt-1">
            {t('auth.email')}: <strong>{activatedUsername}</strong> · {t('auth.password')}: <strong>digiso@2026</strong>
          </p>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{t('auth.login')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('auth.loginSubtitle')}</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Username */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('auth.usernameLabel')}</label>
          <div className="relative">
            <HiOutlineUser className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              {...register('username')}
              className={`w-full pl-10 pr-4 py-2.5 border rounded-xl outline-none transition-all text-sm ${errors.username ? 'border-red-400 focus:border-red-500' : 'border-slate-200 focus:border-orange-500'} focus:ring-2 focus:ring-orange-500/10 bg-white`}
              placeholder={t('auth.email')}
              autoComplete="username"
            />
          </div>
          {errors.username && (
            <p className="text-xs text-red-500 mt-1">{errors.username.message}</p>
          )}
        </div>

        {/* Password */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('auth.password')}</label>
          <div className="relative">
            <HiOutlineLockClosed className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type={showPassword ? 'text' : 'password'}
              {...register('password')}
              className={`w-full pl-10 pr-10 py-2.5 border rounded-xl outline-none transition-all text-sm ${errors.password ? 'border-red-400 focus:border-red-500' : 'border-slate-200 focus:border-orange-500'} focus:ring-2 focus:ring-orange-500/10 bg-white`}
              placeholder={t('auth.password')}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-orange-500 p-1"
            >
              {showPassword ? <HiOutlineEyeOff className="w-4 h-4" /> : <HiOutlineEye className="w-4 h-4" />}
            </button>
          </div>
          {errors.password && (
            <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>
          )}
        </div>

        {/* Remember & Forgot */}
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              {...register('rememberMe')}
              className="w-3.5 h-3.5 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
            />
            <span className="ml-2 text-slate-600">{t('auth.rememberMe')}</span>
          </label>
          <Link to="/forgot-password" className="text-orange-500 hover:text-orange-600 font-medium">{t('auth.forgotPassword')}?</Link>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-orange-500/25 transition-all active:scale-[0.98] disabled:opacity-60 text-sm"
        >
          {isLoading ? t('common.loading') : t('auth.loginButton')}
        </button>
      </form>

      {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
        <>
          {/* Divider */}
          <div className="flex items-center my-4">
            <div className="flex-1 border-t border-slate-200"></div>
            <span className="px-3 text-xs text-slate-400">{t('auth.orContinueWith')}</span>
            <div className="flex-1 border-t border-slate-200"></div>
          </div>

          {/* Google Login */}
          <GoogleAuthButton
            onSuccess={handleGoogleSuccess}
            onError={handleGoogleError}
            text={t('auth.continueWithGoogle')}
            disabled={isLoading}
          />
        </>
      )}

      {/* Register */}
      <p className="mt-5 text-center text-sm text-slate-600">
        {t('auth.dontHaveAccount')}{' '}
        <Link to="/register" className="text-orange-500 hover:text-orange-600 font-semibold">
          {t('auth.registerHere')}
        </Link>
      </p>
    </>
  );
};

export default Login;
