import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { HiOutlineLockClosed, HiOutlineEye, HiOutlineEyeOff, HiOutlineShieldCheck } from 'react-icons/hi';
import { useI18n } from '../../i18n';
import { activateAccount } from '../../features/auth/services/authApi.service';

/**
 * ActivatePage - Refactored với Impeccable design principles
 */
const ActivatePage = () => {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [state, setState] = useState('form');
  const [errorMessage, setErrorMessage] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  if (!token) {
    return (
      <div 
        className="w-full max-w-md mx-auto text-center py-12"
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
        <h2 className="text-2xl font-bold text-slate-900 mb-3">{t('activate.failedTitle')}</h2>
        <p className="text-slate-500 text-sm mb-8">{t('activate.invalidLink')}</p>
        <Link 
          to="/login" 
          className="inline-block w-full py-4 text-center font-semibold rounded-xl text-white transition-all hover:shadow-lg hover:shadow-orange-500/25"
          style={{
            background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'
          }}
        >
          {t('activate.backToLogin')}
        </Link>
      </div>
    );
  }

  const validatePassword = (pwd) => {
    if (pwd.length < 8) return t('auth.passwordMinLength');
    if (!/[a-zA-Z]/.test(pwd)) return t('auth.passwordNeedLetter');
    if (!/[0-9]/.test(pwd)) return t('auth.passwordNeedNumber');
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');

    const pwdError = validatePassword(password);
    if (pwdError) {
      setValidationError(pwdError);
      return;
    }

    if (password !== confirmPassword) {
      setValidationError(t('auth.passwordMismatch'));
      return;
    }

    setState('loading');

    try {
      await activateAccount({ token, password });
      setState('success');
    } catch (err) {
      setState('error');
      setErrorMessage(err?.response?.data?.message || t('activate.expiredOrInvalid'));
    }
  };

  if (state === 'loading') {
    return (
      <div 
        className="w-full max-w-md mx-auto text-center py-12"
        style={{ animation: 'fadeIn 0.5s ease forwards' }}
      >
        <div className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center mb-6" style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.1) 0%, rgba(239,68,68,0.1) 100%)' }}>
          <HiOutlineShieldCheck className="w-10 h-10 text-orange-500 animate-pulse" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-3">{t('activate.activating')}</h2>
        <div className="w-12 h-1 mx-auto rounded-full overflow-hidden bg-slate-200 mt-4">
          <div 
            className="h-full rounded-full"
            style={{ 
              background: 'linear-gradient(90deg, #f97316 0%, #ea580c 100%)',
              animation: 'progress 1.5s ease-in-out infinite'
            }} 
          />
        </div>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div 
        className="w-full max-w-md mx-auto text-center py-12"
        style={{ animation: 'scaleIn 0.5s ease forwards' }}
      >
        <div 
          className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center mb-6"
          style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
        >
          <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-3">{t('activate.successTitle')}</h2>
        <p className="text-slate-500 text-sm mb-8">{t('activate.successMessage')}</p>
        <Link 
          to="/login" 
          className="inline-block w-full py-4 text-center font-semibold rounded-xl text-white transition-all hover:shadow-lg hover:shadow-orange-500/25"
          style={{
            background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'
          }}
        >
          {t('activate.loginNow')}
        </Link>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div 
        className="w-full max-w-md mx-auto text-center py-12"
        style={{ animation: 'scaleIn 0.5s ease forwards' }}
      >
        <div 
          className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center mb-6"
          style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.1) 0%, rgba(239,68,68,0.2) 100%)' }}
        >
          <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-3">{t('activate.failedTitle')}</h2>
        <p className="text-slate-500 text-sm mb-8">{errorMessage}</p>
        <Link 
          to="/login" 
          className="inline-block w-full py-4 text-center font-semibold rounded-xl text-white transition-all hover:shadow-lg hover:shadow-orange-500/25"
          style={{
            background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'
          }}
        >
          {t('activate.backToLogin')}
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
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">{t('activate.title')}</h1>
        <p className="text-slate-500 leading-relaxed">Tạo mật khẩu cho tài khoản của bạn để kích hoạt.</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Password */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            {t('auth.newPassword')}
          </label>
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              <HiOutlineLockClosed className="w-5 h-5" />
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-12 pr-12 py-4 border border-slate-200 rounded-xl outline-none transition-all duration-200 text-sm bg-white hover:border-slate-300 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 focus:shadow-lg focus:shadow-orange-500/10"
              placeholder={t('auth.enterNewPassword')}
              minLength={8}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-orange-500 p-1 transition-colors"
            >
              {showPassword ? <HiOutlineEyeOff className="w-5 h-5" /> : <HiOutlineEye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Confirm Password */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            {t('auth.confirmPassword')}
          </label>
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              <HiOutlineLockClosed className="w-5 h-5" />
            </div>
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full pl-12 pr-12 py-4 border border-slate-200 rounded-xl outline-none transition-all duration-200 text-sm bg-white hover:border-slate-300 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 focus:shadow-lg focus:shadow-orange-500/10"
              placeholder={t('auth.confirmNewPassword')}
              minLength={8}
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-orange-500 p-1 transition-colors"
            >
              {showConfirmPassword ? <HiOutlineEyeOff className="w-5 h-5" /> : <HiOutlineEye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Validation Error */}
        {validationError && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200">
            <p className="text-red-600 text-sm flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {validationError}
            </p>
          </div>
        )}

        {/* Password requirements */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
          <p className="text-xs font-semibold text-slate-600 mb-2">Yêu cầu mật khẩu:</p>
          <ul className="text-xs text-slate-500 space-y-1">
            <li className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${password.length >= 8 ? 'bg-green-500' : 'bg-slate-300'}`} />
              Tối thiểu 8 ký tự
            </li>
            <li className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${/[a-zA-Z]/.test(password) ? 'bg-green-500' : 'bg-slate-300'}`} />
              Chứa ít nhất 1 chữ cái
            </li>
            <li className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${/[0-9]/.test(password) ? 'bg-green-500' : 'bg-slate-300'}`} />
              Chứa ít nhất 1 số
            </li>
          </ul>
        </div>

        <button
          type="submit"
          className="w-full py-4 text-white font-semibold rounded-xl transition-all hover:shadow-lg hover:shadow-orange-500/25 active:scale-[0.99]"
          style={{
            background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'
          }}
        >
          {t('activate.activateButton')}
        </button>

        <p className="text-center text-sm text-slate-500">
          <Link to="/login" className="font-semibold text-orange-500 hover:text-orange-600 hover:underline underline-offset-4 transition-colors">
            {t('activate.backToLogin')}
          </Link>
        </p>
      </form>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes progress {
          0% { width: 0%; }
          50% { width: 70%; }
          100% { width: 100%; }
        }
      `}</style>
    </div>
  );
};

export default ActivatePage;
