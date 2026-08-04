import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { activateAccount } from '../../features/auth/services/authApi.service';

const ActivatePage = () => {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [state, setState] = useState('form'); // form | loading | success | error
  const [errorMessage, setErrorMessage] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState('');

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-sm text-center space-y-4">
          <h2 className="text-xl font-bold text-gray-900">{t('activate.failedTitle')}</h2>
          <p className="text-gray-500">{t('activate.invalidLink')}</p>
          <Link to="/login" className="btn btn-primary block w-full">{t('activate.backToLogin')}</Link>
        </div>
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4">
          <div className="spinner w-10 h-10 mx-auto" />
          <p className="text-gray-500">{t('activate.activating')}</p>
        </div>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900">{t('activate.successTitle')}</h2>
          <p className="text-gray-500 text-sm">{t('activate.successMessage')}</p>
          <Link to="/login" className="btn btn-primary block w-full">
            {t('activate.loginNow')}
          </Link>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900">{t('activate.failedTitle')}</h2>
          <p className="text-gray-500 text-sm">{errorMessage}</p>
          <Link to="/login" className="btn btn-primary block w-full">{t('activate.backToLogin')}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Founder AI</h1>
            <p className="text-gray-500 mt-1">{t('activate.title')}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('auth.newPassword')}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                placeholder={t('auth.enterNewPassword')}
                minLength={8}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('auth.confirmPassword')}
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                placeholder={t('auth.confirmNewPassword')}
                minLength={8}
                required
              />
            </div>

            {validationError && (
              <p className="text-sm text-red-600">{validationError}</p>
            )}

            <div className="text-xs text-gray-500">
              <p>{t('auth.passwordRequirements')}</p>
            </div>

            <button
              type="submit"
              className="w-full btn btn-primary py-2"
            >
              {t('activate.activateButton')}
            </button>
          </form>

          <div className="text-center">
            <Link to="/login" className="text-sm text-gray-500 hover:text-gray-700">
              {t('activate.backToLogin')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ActivatePage;
