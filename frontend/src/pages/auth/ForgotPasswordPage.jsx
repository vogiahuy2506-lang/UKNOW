import { useState } from 'react';
import { Link } from 'react-router-dom';
import { HiOutlineMail, HiOutlineArrowLeft } from 'react-icons/hi';
import { useI18n } from '../../i18n';
import { requestPasswordReset } from '../../features/auth/services/authApi.service';

/**
 * ForgotPasswordPage - Refactored với Impeccable design principles
 */
const ForgotPasswordPage = () => {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [focusedField, setFocusedField] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) {
      setError(t('forgotPassword.validationEmail'));
      return;
    }
    setIsLoading(true);
    try {
      await requestPasswordReset({ email: email.trim() });
      setSubmitted(true);
    } catch {
      setError(t('forgotPassword.errorSend'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto opacity-0 animate-fadeIn" style={{ animation: 'fadeIn 0.5s ease forwards' }}>
      {/* Back link */}
      <Link 
        to="/login" 
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-700 mb-8 transition-colors group"
      >
        <HiOutlineArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        {t('forgotPassword.backToLogin')}
      </Link>

      {/* Success state */}
      {submitted ? (
        <div className="space-y-6">
          <div 
            className="p-8 rounded-2xl bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-200 text-center space-y-4"
            style={{ animation: 'scaleIn 0.4s ease' }}
          >
            <div 
              className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
            >
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900">{t('forgotPassword.successTitle')}</p>
              <p className="text-slate-600 text-sm mt-2 leading-relaxed">
                {t('forgotPassword.successMessage')} <strong className="text-slate-800">{email}</strong> 
                <br className="sm:hidden" />
                {t('forgotPassword.successNote')} <strong className="text-slate-800">{t('forgotPassword.successHour')}</strong>.
              </p>
            </div>
            <p className="text-slate-500 text-xs">{t('forgotPassword.successSpamNote')}</p>
          </div>
          
          <Link 
            to="/login" 
            className="block w-full py-4 text-center font-semibold rounded-xl text-white transition-all hover:shadow-lg hover:shadow-orange-500/25"
            style={{
              background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'
            }}
          >
            {t('forgotPassword.backToLogin')}
          </Link>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="mb-8">
            <div 
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
              style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.1) 0%, rgba(239,68,68,0.1) 100%)' }}
            >
              <HiOutlineMail className="w-8 h-8 text-orange-500" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">{t('forgotPassword.title')}</h1>
            <p className="text-slate-500 leading-relaxed">
              {t('forgotPassword.subtitle')}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">{t('forgotPassword.emailLabel')}</label>
              <div className="relative">
                <div 
                  className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-200 ${
                    focusedField === 'email' ? 'text-orange-500' : 'text-slate-400'
                  }`}
                >
                  <HiOutlineMail className="w-5 h-5" />
                </div>
                <input
                  type="email"
                  className={`w-full pl-12 pr-4 py-4 border rounded-xl outline-none transition-all duration-200 text-sm bg-white ${
                    error 
                      ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/10' 
                      : focusedField === 'email'
                        ? 'border-orange-500 shadow-lg shadow-orange-500/10'
                        : 'border-slate-200 hover:border-slate-300 focus:border-orange-500 focus:shadow-lg focus:shadow-orange-500/10'
                  }`}
                  placeholder={t('forgotPassword.emailPlaceholder')}
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  autoComplete="email"
                />
              </div>
              {error && (
                <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
                  <span className="inline-block w-1 h-1 rounded-full bg-red-500" />
                  {error}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 text-white font-semibold rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-orange-500/25 active:scale-[0.99] disabled:opacity-60"
              style={{
                background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'
              }}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t('forgotPassword.sending')}
                </span>
              ) : t('forgotPassword.submitButton')}
            </button>

            <p className="text-center text-sm text-slate-500">
              Nhớ mật khẩu?{' '}
              <Link to="/login" className="font-semibold text-orange-500 hover:text-orange-600 hover:underline underline-offset-4 transition-colors">
                {t('forgotPassword.backToLogin')}
              </Link>
            </p>
          </form>
        </>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
};

export default ForgotPasswordPage;
