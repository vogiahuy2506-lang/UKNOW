import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { requestPasswordReset } from '../../features/auth/services/authApi.service';

const ForgotPasswordPage = () => {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

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
    <div className="w-full">
      <div className="mb-10">
        <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight mb-2">{t('forgotPassword.title')}</h1>
        <p className="text-slate-500 font-medium">
          {t('forgotPassword.subtitle')}
        </p>
      </div>

      {submitted ? (
        <div className="space-y-6">
          <div className="p-5 rounded-xl bg-green-50 border border-green-200 text-center space-y-2">
            <div className="w-12 h-12 mx-auto rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-green-800 font-semibold">{t('forgotPassword.successTitle')}</p>
            <p className="text-green-700 text-sm">
              {t('forgotPassword.successMessage')} <strong>{email}</strong> {t('forgotPassword.successNote')} <strong>{t('forgotPassword.successHour')}</strong>.
            </p>
            <p className="text-green-600 text-xs">{t('forgotPassword.successSpamNote')}</p>
          </div>
          <Link to="/login" className="btn btn-primary w-full block text-center">
            {t('forgotPassword.backToLogin')}
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="block text-sm font-bold text-slate-700">{t('forgotPassword.emailLabel')}</label>
            <input
              type="email"
              className={`w-full px-4 py-3.5 border rounded-xl outline-none transition-all duration-200 bg-slate-50 focus:bg-white ${
                error ? 'border-red-500 focus:border-red-500 focus:ring-4 focus:ring-red-500/10'
                      : 'border-slate-200 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10'
              }`}
              placeholder={t('forgotPassword.emailPlaceholder')}
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              autoComplete="email"
            />
            {error && <p className="text-sm font-medium text-red-500 mt-1">{error}</p>}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 px-6 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-xl transition-colors duration-200"
          >
            {isLoading ? t('forgotPassword.sending') : t('forgotPassword.submitButton')}
          </button>

          <p className="text-center text-sm text-slate-500">
            <Link to="/login" className="font-bold text-orange-500 hover:text-orange-600 transition-colors">
              {t('forgotPassword.backToLogin')}
            </Link>
          </p>
        </form>
      )}
    </div>
  );
};

export default ForgotPasswordPage;
