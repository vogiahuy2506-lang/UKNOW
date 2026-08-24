import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { HiOutlineLockClosed, HiOutlineEye, HiOutlineEyeOff, HiOutlineShieldCheck } from 'react-icons/hi';
import { useI18n } from '../../i18n';
import { resetPassword } from '../../features/auth/services/authApi.service';
import { PASSWORD_MIN_LENGTH, PASSWORD_PATTERN } from '../../utils/passwordValidation';

/**
 * ResetPasswordPage - Refactored với Impeccable design principles
 */
const ResetPasswordPage = () => {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  const { register, handleSubmit, watch, formState: { errors } } = useForm();
  const password = watch('password');

  const onSubmit = async (values) => {
    setIsSubmitting(true);
    setServerError('');
    try {
      await resetPassword({ token, password: values.password });
      navigate('/login?reset=1', { replace: true });
    } catch (err) {
      setServerError(err?.response?.data?.message || t('resetPassword.errorReset'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div 
        className="w-full max-w-md mx-auto text-center py-12 opacity-0 animate-fadeIn"
        style={{ animation: 'fadeIn 0.5s ease forwards' }}
      >
        <div 
          className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center mb-6"
          style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.1) 0%, rgba(239,68,68,0.2) 100%)' }}
        >
          <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-3">{t('resetPassword.invalidLink')}</h2>
        <p className="text-slate-500 text-sm mb-8">{t('resetPassword.pleaseRequestAgain')}</p>
        <Link 
          to="/forgot-password" 
          className="inline-block w-full py-4 text-center font-semibold rounded-xl text-white transition-all hover:shadow-lg hover:shadow-orange-500/25"
          style={{
            background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'
          }}
        >
          {t('resetPassword.requestReset')}
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto opacity-0 animate-fadeIn" style={{ animation: 'fadeIn 0.5s ease forwards' }}>
      {/* Header */}
      <div className="mb-8">
        <div 
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
          style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.1) 0%, rgba(239,68,68,0.1) 100%)' }}
        >
          <HiOutlineShieldCheck className="w-8 h-8 text-orange-500" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">{t('resetPassword.title')}</h1>
        <p className="text-slate-500 leading-relaxed">{t('resetPassword.subtitle')}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* New Password */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">{t('resetPassword.newPasswordLabel')}</label>
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
              className={`w-full pl-12 pr-12 py-4 border rounded-xl outline-none transition-all duration-200 text-sm bg-white ${
                errors.password 
                  ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/10' 
                  : focusedField === 'password'
                    ? 'border-orange-500 shadow-lg shadow-orange-500/10'
                    : 'border-slate-200 hover:border-slate-300 focus:border-orange-500 focus:shadow-lg focus:shadow-orange-500/10'
              }`}
              placeholder={t('resetPassword.newPasswordPlaceholder')}
              onFocus={() => setFocusedField('password')}
              onBlur={() => setFocusedField(null)}
              {...register('password', {
                required: t('resetPassword.validationPasswordRequired'),
                minLength: { value: PASSWORD_MIN_LENGTH, message: t('resetPassword.validationPasswordMin') },
                pattern: {
                  value: PASSWORD_PATTERN,
                  message:
                    t('auth.passwordPattern')
                    || t('auth.passwordNeedLetter')
                    || 'Mật khẩu phải chứa ít nhất một chữ cái và một số',
                },
              })}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-orange-500 p-1 transition-colors"
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

        {/* Confirm Password */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">{t('resetPassword.confirmPasswordLabel')}</label>
          <div className="relative">
            <div 
              className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-200 ${
                focusedField === 'confirmPassword' ? 'text-orange-500' : 'text-slate-400'
              }`}
            >
              <HiOutlineLockClosed className="w-5 h-5" />
            </div>
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              className={`w-full pl-12 pr-12 py-4 border rounded-xl outline-none transition-all duration-200 text-sm bg-white ${
                errors.confirmPassword 
                  ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/10' 
                  : focusedField === 'confirmPassword'
                    ? 'border-orange-500 shadow-lg shadow-orange-500/10'
                    : 'border-slate-200 hover:border-slate-300 focus:border-orange-500 focus:shadow-lg focus:shadow-orange-500/10'
              }`}
              placeholder={t('resetPassword.confirmPasswordPlaceholder')}
              onFocus={() => setFocusedField('confirmPassword')}
              onBlur={() => setFocusedField(null)}
              {...register('confirmPassword', {
                required: t('resetPassword.validationConfirmRequired'),
                validate: (v) => v === password || t('resetPassword.validationMismatch'),
              })}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-orange-500 p-1 transition-colors"
            >
              {showConfirmPassword ? <HiOutlineEyeOff className="w-5 h-5" /> : <HiOutlineEye className="w-5 h-5" />}
            </button>
          </div>
          {errors.confirmPassword && (
            <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
              <span className="inline-block w-1 h-1 rounded-full bg-red-500" />
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        {/* Server Error */}
        {serverError && (
          <div 
            className="p-4 rounded-xl bg-red-50 border border-red-200"
            style={{ animation: 'shake 0.5s ease' }}
          >
            <p className="text-red-600 text-sm">{serverError}</p>
            {serverError.includes(t('resetPassword.errorExpired').split(' ')[0]) && (
              <Link to="/forgot-password" className="text-red-700 font-semibold text-sm hover:underline mt-2 block">
                {t('resetPassword.requestReset')}
              </Link>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-4 text-white font-semibold rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-orange-500/25 active:scale-[0.99] disabled:opacity-60"
          style={{
            background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'
          }}
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {t('resetPassword.saving')}
            </span>
          ) : t('resetPassword.submitButton')}
        </button>
      </form>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
      `}</style>
    </div>
  );
};

export default ResetPasswordPage;
