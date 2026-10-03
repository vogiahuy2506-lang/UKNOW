import { useState } from 'react';
import { HiOutlineShieldCheck } from 'react-icons/hi';
import { useAuthStore } from '../../../stores/authStore';
import { useI18n } from '../../../i18n';

/**
 * Bước 2 của đăng nhập khi tài khoản đã bật xác thực hai lớp.
 * Gửi challengeToken + mã (6 số TOTP hoặc mã khôi phục) lên /auth/2fa/verify.
 *
 * @param {{
 *   challengeToken: string,
 *   rememberMe?: boolean,
 *   onSuccess: (result: object) => void,
 *   onBack: () => void,
 * }} props
 */
const TwoFactorLoginStep = ({ challengeToken, rememberMe = true, onSuccess, onBack }) => {
  const { t } = useI18n();
  const verifyTwoFactor = useAuthStore((s) => s.verifyTwoFactor);
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const raw = e.target.value;
    setError('');
    if (useRecovery) {
      setCode(raw.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 11));
    } else {
      setCode(raw.replace(/\D/g, '').slice(0, 6));
    }
  };

  const toggleMode = () => {
    setUseRecovery((v) => !v);
    setCode('');
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    const trimmed = code.trim();
    if (!trimmed) {
      setError(t('twoFactor.codeRequired'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await verifyTwoFactor({ challengeToken, code: trimmed, rememberMe });
      onSuccess?.(result);
    } catch (err) {
      const status = err?.response?.status;
      const serverMessage = err?.response?.data?.message;
      if (status === 401) {
        setError(t('twoFactor.invalidCode'));
      } else if (status === 403 || status === 429) {
        setError(serverMessage || t('twoFactor.lockedFallback'));
      } else {
        setError(serverMessage || t('twoFactor.verifyFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-8 text-center lg:text-left">
        <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center mb-4 mx-auto lg:mx-0">
          <HiOutlineShieldCheck className="w-6 h-6 text-orange-600" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{t('twoFactor.loginTitle')}</h1>
        <p className="text-slate-500 mt-2 text-sm leading-relaxed">
          {useRecovery ? t('twoFactor.loginSubtitleRecovery') : t('twoFactor.loginSubtitle')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="two-factor-code" className="block text-sm font-semibold text-slate-700 mb-2">
            {useRecovery ? t('twoFactor.recoveryCodeLabel') : t('twoFactor.codeLabel')}
          </label>
          <input
            id="two-factor-code"
            type="text"
            value={code}
            onChange={handleChange}
            inputMode={useRecovery ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            autoFocus
            maxLength={useRecovery ? 11 : 6}
            placeholder={useRecovery ? 'XXXXX-XXXXX' : '123456'}
            className="w-full px-4 py-3.5 border border-slate-200 rounded-xl outline-none text-center text-xl tracking-widest font-mono focus:border-orange-500 focus:shadow-lg focus:shadow-orange-500/10"
          />
          {error && (
            <p role="alert" className="text-xs text-red-500 mt-2">{error}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 text-white font-semibold rounded-xl transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed text-sm"
          style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 50%, #dc2626 100%)' }}
        >
          {loading ? t('common.loading') : t('twoFactor.confirm')}
        </button>
      </form>

      <div className="mt-6 flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={toggleMode}
          className="text-orange-500 hover:text-orange-600 font-semibold hover:underline underline-offset-4"
        >
          {useRecovery ? t('twoFactor.useAuthenticator') : t('twoFactor.useRecovery')}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="text-slate-500 hover:text-slate-700 hover:underline underline-offset-4"
        >
          {t('twoFactor.back')}
        </button>
      </div>
    </div>
  );
};

export default TwoFactorLoginStep;
