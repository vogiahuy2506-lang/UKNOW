import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';
import { useI18n } from '../../i18n';
import { HiOutlineUser, HiOutlineLockClosed, HiOutlineEye, HiOutlineEyeOff, HiOutlineShieldCheck } from 'react-icons/hi';
import GoogleAuthButton from '../../components/GoogleAuthButton';
import { getPostAuthPath } from '../../utils/authRedirect';

/**
 * Login Page - Refactored với Impeccable design principles:
 * - Clear visual hierarchy với spacing đúng
 * - Strategic color sử dụng
 * - Micro-interactions thay vì animations lớn
 * - Better error states
 */
const Login = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, googleLogin } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

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
    <div className="w-full max-w-md mx-auto opacity-0 animate-fadeIn" style={{ animation: 'fadeIn 0.5s ease forwards' }}>
      {/* Banner đặt lại mật khẩu */}
      {isPasswordReset && (
        <div 
          className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 opacity-0 animate-slideDown"
          style={{ animation: 'slideDown 0.4s ease forwards' }}
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <HiOutlineShieldCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-emerald-700 font-medium text-sm leading-relaxed">{t('auth.passwordChanged')}</p>
          </div>
        </div>
      )}

      {/* Banner kích hoạt */}
      {isActivated && (
        <div 
          className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 opacity-0 animate-slideDown"
          style={{ animation: 'slideDown 0.4s ease forwards' }}
        >
          <p className="text-amber-700 font-medium text-sm">{t('auth.accountActivated')}</p>
          <p className="text-amber-600 text-xs mt-1">
            {t('auth.email')}: <strong>{activatedUsername}</strong> · {t('auth.password')}: <strong>digiso@2026</strong>
          </p>
        </div>
      )}

      {/* Header */}
      <div className="mb-8 text-center lg:text-left">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{t('auth.login')}</h1>
        <p className="text-slate-500 mt-2 text-sm leading-relaxed">{t('auth.loginSubtitle')}</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Username */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            {t('auth.usernameLabel')}
          </label>
          <div className="relative">
            <div 
              className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-200 ${
                focusedField === 'username' ? 'text-orange-500' : 'text-slate-400'
              }`}
            >
              <HiOutlineUser className="w-5 h-5" />
            </div>
            <input
              type="text"
              {...register('username')}
              onFocus={() => setFocusedField('username')}
              onBlur={() => setFocusedField(null)}
              className={`w-full pl-12 pr-4 py-3.5 border rounded-xl outline-none transition-all duration-200 text-sm bg-white ${
                errors.username 
                  ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/10' 
                  : focusedField === 'username'
                    ? 'border-orange-500 shadow-lg shadow-orange-500/10'
                    : 'border-slate-200 hover:border-slate-300 focus:border-orange-500 focus:shadow-lg focus:shadow-orange-500/10'
              }`}
              placeholder={t('auth.email')}
              autoComplete="username"
            />
          </div>
          {errors.username && (
            <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
              <span className="inline-block w-1 h-1 rounded-full bg-red-500" />
              {errors.username.message}
            </p>
          )}
        </div>

        {/* Password */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            {t('auth.password')}
          </label>
          <div className="relative">
            <div 
              className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-200 ${
                focusedField === 'password' ? 'text-orange-500' : 'text-slate-400'
              }`}
            >
              <HiOutlineLockClosed className="w-5 h-5" />
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              {...register('password')}
              onFocus={() => setFocusedField('password')}
              onBlur={() => setFocusedField(null)}
              className={`w-full pl-12 pr-12 py-3.5 border rounded-xl outline-none transition-all duration-200 text-sm bg-white ${
                errors.password 
                  ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/10' 
                  : focusedField === 'password'
                    ? 'border-orange-500 shadow-lg shadow-orange-500/10'
                    : 'border-slate-200 hover:border-slate-300 focus:border-orange-500 focus:shadow-lg focus:shadow-orange-500/10'
              }`}
              placeholder={t('auth.password')}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-orange-500 p-1 transition-colors duration-200"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <HiOutlineEyeOff className="w-5 h-5" /> : <HiOutlineEye className="w-5 h-5" />}
            </button>
          </div>
          {errors.password && (
            <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
              <span className="inline-block w-1 h-1 rounded-full bg-red-500" />
              {errors.password.message}
            </p>
          )}
        </div>

        {/* Remember & Forgot */}
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center cursor-pointer group">
            <div className="relative">
              <input
                type="checkbox"
                {...register('rememberMe')}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 rounded-full peer peer-checked:bg-orange-500 transition-colors duration-200 cursor-pointer" />
              <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 peer-checked:translate-x-4 cursor-pointer" />
            </div>
            <span className="ml-3 text-slate-600 group-hover:text-slate-700 transition-colors">{t('auth.rememberMe')}</span>
          </label>
          <Link 
            to="/forgot-password" 
            className="text-orange-500 hover:text-orange-600 font-semibold hover:underline underline-offset-4 transition-colors"
          >
            {t('auth.forgotPassword')}?
          </Link>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-4 text-white font-semibold rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-orange-500/25 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed text-sm relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #f97316 0%, #ea580c 50%, #dc2626 100%)',
          }}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {t('common.loading')}
            </span>
          ) : (
            t('auth.loginButton')
          )}
        </button>
      </form>

      {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
        <>
          {/* Divider */}
          <div className="flex items-center my-6">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="px-4 text-xs text-slate-400 font-medium uppercase tracking-wider">{t('auth.orContinueWith')}</span>
            <div className="flex-1 h-px bg-slate-200" />
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

      {/* Register link */}
      <p className="mt-8 text-center text-sm text-slate-600">
        {t('auth.dontHaveAccount')}{' '}
        <Link 
          to="/register" 
          className="text-orange-500 hover:text-orange-600 font-bold hover:underline underline-offset-4 transition-colors"
        >
          {t('auth.registerHere')}
        </Link>
      </p>
    </div>
  );
};

export default Login;
