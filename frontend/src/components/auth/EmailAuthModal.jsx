import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { HiOutlineMail, HiOutlineCheckCircle, HiOutlineArrowLeft } from 'react-icons/hi';
import { useI18n } from '../../i18n';

const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const EmailAuthModal = ({ isOpen, onClose, mode: initialMode = 'login' }) => {
  const { t } = useI18n();
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState('');
  const [codeDigits, setCodeDigits] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setEmail('');
      setCodeDigits(['', '', '', '', '', '']);
    }
  }, [isOpen]);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const handleSendCode = async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error(t('emailAuth.invalidEmail'));
      return;
    }

    setIsLoading(true);
    try {
      await api.post('/verification/send-code', { email });
      setStep(2);
      toast.success(t('emailAuth.codeSentSuccess'));
    } catch (error) {
      const message = error.response?.data?.message || t('emailAuth.sendCodeFailed');
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCodeChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newDigits = [...codeDigits];
    newDigits[index] = value.slice(-1);
    setCodeDigits(newDigits);
    if (value && index < 5) {
      document.getElementById(`modal-code-${index + 1}`)?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !codeDigits[index] && index > 0) {
      document.getElementById(`modal-code-${index - 1}`)?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newDigits = [...codeDigits];
    for (let i = 0; i < pastedData.length; i++) {
      newDigits[i] = pastedData[i];
    }
    setCodeDigits(newDigits);
    document.getElementById(`modal-code-${Math.min(pastedData.length, 5)}`)?.focus();
  };

  const handleVerify = async () => {
    const code = codeDigits.join('');
    if (code.length !== 6) {
      toast.error(t('emailAuth.enterFullCode'));
      return;
    }

    setIsLoading(true);
    try {
      await api.post('/verification/verify-code', { email, code });
      toast.success(t('emailAuth.verificationSuccess'));
      onClose();
    } catch (error) {
      const message = error.response?.data?.message || t('emailAuth.verificationFailed');
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setIsLoading(true);
    try {
      await api.post('/verification/send-code', { email });
      toast.success(t('emailAuth.newCodeSent'));
      setCodeDigits(['', '', '', '', '', '']);
    } catch (error) {
      toast.error(t('emailAuth.resendFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-500 to-primary-600 p-6 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-white/20 rounded-full mb-3">
            <GoogleIcon />
          </div>
          <h2 className="text-xl font-bold text-white">
            {mode === 'login' ? t('emailAuth.loginWithEmail') : t('emailAuth.registerWithEmail')}
          </h2>
          <p className="text-primary-100 text-sm mt-1">
            {step === 1 
              ? t('emailAuth.enterEmailForCode')
              : t('emailAuth.enterCodeSentToEmail')
            }
          </p>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 1 ? (
            <>
              {/* Email Input */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('emailAuth.yourEmail')}
                  </label>
                  <div className="relative">
                    <HiOutlineMail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendCode()}
                      className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all bg-gray-50 focus:bg-white"
                      placeholder={t('emailAuth.emailPlaceholder')}
                      autoFocus
                    />
                  </div>
                </div>

                <button
                  onClick={handleSendCode}
                  disabled={isLoading}
                  className="w-full py-3 px-4 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-semibold rounded-xl hover:from-primary-600 hover:to-primary-700 transition-all shadow-lg shadow-primary-500/30 disabled:opacity-70"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center">
                      <div className="spinner mr-2"></div>
                      {t('emailAuth.sending')}
                    </span>
                  ) : (
                    t('emailAuth.sendCode')
                  )}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Verification Code */}
              <div className="space-y-6">
                <p className="text-center text-gray-600 text-sm">
                  {t('emailAuth.codeSentTo')} <span className="font-medium text-gray-900">{email}</span>
                </p>

                <div className="flex justify-center gap-2" onPaste={handlePaste}>
                  {codeDigits.map((digit, index) => (
                    <input
                      key={index}
                      id={`modal-code-${index}`}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleCodeChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      className="w-12 h-14 text-center text-2xl font-bold border-2 border-gray-200 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                      autoFocus={index === 0}
                    />
                  ))}
                </div>

                {codeDigits.join('').length === 6 && (
                  <div className="flex items-center justify-center text-green-600">
                    <HiOutlineCheckCircle className="w-5 h-5 mr-1" />
                    <span className="text-sm">{t('emailAuth.fullCodeEntered')}</span>
                  </div>
                )}

                <button
                  onClick={handleVerify}
                  disabled={isLoading || codeDigits.join('').length !== 6}
                  className="w-full py-3 px-4 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-semibold rounded-xl hover:from-primary-600 hover:to-primary-700 transition-all shadow-lg shadow-primary-500/30 disabled:opacity-70"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center">
                      <div className="spinner mr-2"></div>
                      {t('emailAuth.verifying')}
                    </span>
                  ) : (
                    t('emailAuth.verify')
                  )}
                </button>

                <div className="flex items-center justify-between text-sm">
                  <button
                    onClick={() => setStep(1)}
                    className="flex items-center text-gray-500 hover:text-gray-700"
                  >
                    <HiOutlineArrowLeft className="w-4 h-4 mr-1" />
                    {t('emailAuth.changeEmail')}
                  </button>
                  <button
                    onClick={handleResendCode}
                    disabled={isLoading}
                    className="text-primary-600 hover:text-primary-700 font-medium disabled:opacity-50"
                  >
                    {t('emailAuth.resendCode')}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-4 text-center">
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            {t('emailAuth.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmailAuthModal;
