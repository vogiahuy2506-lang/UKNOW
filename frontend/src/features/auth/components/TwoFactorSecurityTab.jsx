import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineShieldCheck, HiOutlineX } from 'react-icons/hi';
import {
  getTwoFactorStatus,
  disableTwoFactor,
  regenerateRecoveryCodes,
} from '../services/authApi.service';
import { useI18n } from '../../../i18n';
import TwoFactorSetupModal, { RecoveryCodesPanel } from './TwoFactorSetupModal';

/**
 * Modal hỏi mã (và mật khẩu khi cần) trước khi tắt 2FA / tạo bộ mã khôi phục mới.
 *
 * @param {{
 *   title: string,
 *   submitLabel: string,
 *   needPassword?: boolean,
 *   onSubmit: ({ code: string, password?: string }) => Promise<void>,
 *   onClose: () => void,
 * }} props
 */
const CodePromptModal = ({ title, submitLabel, needPassword = false, onSubmit, onClose }) => {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!code.trim() || (needPassword && !password)) {
      setError(t('twoFactor.fillAllFields'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSubmit({ code: code.trim(), ...(needPassword ? { password } : {}) });
    } catch (err) {
      setError(
        err?.response?.status === 401
          ? t('twoFactor.invalidCodeOrPassword')
          : err?.response?.data?.message || t('twoFactor.actionFailed'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content modal-content-animate w-full max-w-md mx-4"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {needPassword && (
            <div>
              <label htmlFor="two-factor-prompt-password" className="block text-sm font-medium text-gray-700 mb-1">
                {t('twoFactor.currentPassword')}
              </label>
              <input
                id="two-factor-prompt-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          )}
          <div>
            <label htmlFor="two-factor-prompt-code" className="block text-sm font-medium text-gray-700 mb-1">
              {t('twoFactor.codeOrRecovery')}
            </label>
            <input
              id="two-factor-prompt-code"
              type="text"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setError('');
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              {t('twoFactor.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? t('common.loading') : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

/**
 * Tab "Bảo mật" của AccountProfileModal: bật/tắt 2FA, tạo bộ mã khôi phục mới.
 */
const TwoFactorSecurityTab = () => {
  const { t } = useI18n();
  const [status, setStatus] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [setupOpen, setSetupOpen] = useState(false);
  const [prompt, setPrompt] = useState(null); // null | 'disable' | 'regenerate'
  const [newCodes, setNewCodes] = useState(null);

  const loadStatus = useCallback(async () => {
    setLoadError('');
    try {
      const res = await getTwoFactorStatus();
      setStatus(res.data);
    } catch (err) {
      setLoadError(err?.response?.data?.message || t('twoFactor.statusLoadFailed'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const formatDate = (iso) =>
    iso
      ? new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '—';

  if (loadError) {
    return (
      <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{loadError}</p>
    );
  }
  if (!status) {
    return (
      <div className="py-10 flex justify-center">
        <div className="spinner w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
            status.enabled ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-500'
          }`}
        >
          <HiOutlineShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{t('twoFactor.sectionTitle')}</h3>
          <p className="text-sm text-gray-600 mt-1">
            {t('twoFactor.sectionDescription')}{' '}
            <a
              href="/huong-dan/xac-thuc-hai-lop"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:underline underline-offset-4"
            >
              {t('twoFactor.setupHelpLink')}
            </a>
          </p>
        </div>
      </div>

      {status.enabled ? (
        <div className="space-y-3">
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
            {t('twoFactor.enabledSince', { date: formatDate(status.enabledAt) })}
          </p>
          <p className="text-sm text-gray-600">
            {t('twoFactor.recoveryCodesLeft', { count: status.recoveryCodesLeft })}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setPrompt('regenerate')}>
              {t('twoFactor.regenerateCodes')}
            </button>
            <button type="button" className="btn btn-secondary text-red-600" onClick={() => setPrompt('disable')}>
              {t('twoFactor.disable')}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-primary" onClick={() => setSetupOpen(true)}>
          {t('twoFactor.enable')}
        </button>
      )}

      <TwoFactorSetupModal
        isOpen={setupOpen}
        onClose={() => setSetupOpen(false)}
        onEnabled={loadStatus}
      />

      {prompt === 'disable' && (
        <CodePromptModal
          title={t('twoFactor.disableTitle')}
          submitLabel={t('twoFactor.disable')}
          needPassword={Boolean(status.requiresPasswordToDisable)}
          onClose={() => setPrompt(null)}
          onSubmit={async ({ code, password }) => {
            await disableTwoFactor({ code, password });
            setPrompt(null);
            await loadStatus();
          }}
        />
      )}

      {prompt === 'regenerate' && (
        <CodePromptModal
          title={t('twoFactor.regenerateTitle')}
          submitLabel={t('twoFactor.regenerateCodes')}
          onClose={() => setPrompt(null)}
          onSubmit={async ({ code }) => {
            const res = await regenerateRecoveryCodes(code);
            setPrompt(null);
            setNewCodes(res.data?.recoveryCodes || []);
          }}
        />
      )}

      {Array.isArray(newCodes) &&
        createPortal(
          <div className="modal-overlay">
            <div className="modal-content modal-content-animate w-full max-w-md mx-4" role="dialog" aria-modal="true">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-base font-semibold text-gray-900">{t('twoFactor.recoveryCodesTitle')}</h2>
              </div>
              <RecoveryCodesPanel
                codes={newCodes}
                onDone={() => {
                  setNewCodes(null);
                  loadStatus();
                }}
              />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default TwoFactorSecurityTab;
