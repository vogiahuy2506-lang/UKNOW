import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';
import { useI18n } from '../../i18n';
import { sendVerificationCode } from '../../features/auth/services/authApi.service';
import { trackEvent } from '../../utils/analytics';
import {
  HiOutlineLockClosed,
  HiOutlineEye,
  HiOutlineEyeOff,
  HiOutlineUser,
  HiOutlinePhone,
  HiOutlineMail,
  HiOutlineArrowLeft,
  HiOutlineCheckCircle,
  HiOutlineShieldCheck,
  HiOutlineX,
} from 'react-icons/hi';
import GoogleAuthButton from '../../components/GoogleAuthButton';
import { getPostAuthPath } from '../../utils/authRedirect';
import { PASSWORD_MIN_LENGTH, PASSWORD_PATTERN } from '../../utils/passwordValidation';

/**
 * Register Page - Refactored với Impeccable design principles:
 * - Clear visual hierarchy
 * - Better form UX với progress indication
 * - Smooth transitions between steps
 * - Improved error handling
 */

const registerSchema = (t) => z.object({
  username: z
    .string()
    .min(3, t('register.usernameMinLen'))
    .max(50, t('register.usernameMaxLen'))
    .regex(/^[A-Za-z0-9]+$/, t('register.usernamePattern')),
  email: z.string().email(t('register.invalidEmail')),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, t('register.passwordMinChars') || t('auth.passwordMinLength'))
    .regex(
      PASSWORD_PATTERN,
      t('auth.passwordPattern') || t('auth.passwordNeedLetter') || 'Mật khẩu phải chứa ít nhất một chữ cái và một số'
    ),
  confirmPassword: z.string(),
  fullName: z.string().optional(),
  phone: z.string()
    .min(1, t('register.phoneRequired'))
    .refine((v) => /^[0-9]{10,11}$/.test(v), { message: t('register.invalidPhone') }),
}).refine((d) => d.password === d.confirmPassword, {
  message: t('auth.passwordMismatch'),
  path: ['confirmPassword'],
});

const RESEND_COOLDOWN = 60;

// ── Màn nhập OTP ─────────────────────────────────────────────────────────────
const OtpStep = ({ email, formData, onBack }) => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { register: registerUser } = useAuthStore();

  const [digits, setDigits]            = useState(['', '', '', '', '', '']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending]  = useState(false);
  const [countdown, setCountdown]      = useState(RESEND_COOLDOWN);
  const timerRef                        = useRef(null);
  const inputRefs = useRef([]);

  useEffect(() => {
    startTimer();
    inputRefs.current[0]?.focus();
    return () => clearInterval(timerRef.current);
  }, []);

  const startTimer = () => {
    clearInterval(timerRef.current);
    setCountdown(RESEND_COOLDOWN);
    timerRef.current = setInterval(() => {
      setCountdown((c) => { if (c <= 1) { clearInterval(timerRef.current); return 0; } return c - 1; });
    }, 1000);
  };

  const handleChange = (i, val) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...digits];
    next[i] = val.slice(-1);
    setDigits(next);
    if (val && i < 5) inputRefs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const next = [...digits];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setDigits(next);
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const handleResend = async () => {
    setIsResending(true);
    try {
      await sendVerificationCode({ email });
      setDigits(['', '', '', '', '', '']);
      startTimer();
      toast.success(t('register.resendSuccess'));
      inputRefs.current[0]?.focus();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('register.resendFailed'));
    } finally {
      setIsResending(false);
    }
  };

  const handleSubmit = async () => {
    const code = digits.join('');
    if (code.length < 6) { toast.error(t('auth.enterFullCode')); return; }
    setIsSubmitting(true);
    try {
      const result = await registerUser({ ...formData, emailVerificationCode: code });
      trackEvent('sign_up', { method: 'email' });
      toast.success(t('auth.registerSuccess'));
      // TẠM GIỮ LẠI (đã gỡ rồi phục hồi 22/08): lẽ ra TrialWelcomeModal thay được
      // toast này, nhưng P2-1 (modal không hiện ở luồng Google) chưa xác nhận là
      // đã hết — không có bằng chứng modal chạy đúng ở CẢ HAI luồng. Gỡ toast lúc
      // modal còn nghi vấn = không ai được báo trial nào cả. Chỉ gỡ lại sau khi
      // test tay xác nhận modal hiện đúng (xem P2-1 trong plan 22/08).
      const trialDays = result?.data?.trial?.durationDays;
      if (trialDays) {
        toast.success(t('register.trialGranted', { days: trialDays }));
      }
      navigate(getPostAuthPath(result?.data?.user));
    } catch (err) {
      const resData = err?.response?.data;
      const firstFieldError = Array.isArray(resData?.errors) && resData.errors.length > 0 ? resData.errors[0] : null;
      const fieldPath = firstFieldError?.path || firstFieldError?.param;
      const msg = firstFieldError?.msg || resData?.message || t('auth.verificationFailed');
      toast.error(msg);

      // Chỉ xoá mã OTP khi lỗi thật sự thuộc về mã xác minh/OTP (mã sai hoặc hết hạn)
      const isOtpError =
        fieldPath === 'emailVerificationCode' ||
        fieldPath === 'otp' ||
        (Boolean(msg) && /mã xác minh|mã otp|mã xác thực|mã không đúng|mã đã hết hạn/i.test(msg));
      if (isOtpError && err?.response?.status === 400) {
        setDigits(['', '', '', '', '', '']);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const code = digits.join('');

  return (
    <div className="w-full max-w-md mx-auto opacity-0 animate-fadeIn" style={{ animation: 'fadeIn 0.5s ease forwards' }}>
      <button 
        type="button" 
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-700 mb-8 transition-colors duration-200 group"
      >
        <HiOutlineArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        {t('register.back')}
      </button>

      {/* Success icon */}
      <div className="mb-8">
        <div 
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
          style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.1) 0%, rgba(239,68,68,0.1) 100%)' }}
        >
          <HiOutlineShieldCheck className="w-8 h-8 text-orange-500" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2 tracking-tight">{t('register.verifyEmail')}</h1>
        <p className="text-slate-500 text-sm leading-relaxed">{t('register.enterOtpCode')}</p>
        <p className="font-bold text-slate-800 text-sm mt-1">{email}</p>
      </div>

      {/* 6 ô OTP */}
      <div className="flex justify-center gap-3 mb-8">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => (inputRefs.current[i] = el)}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={i === 0 ? handlePaste : undefined}
            className="w-12 h-14 text-center text-xl font-bold border-2 rounded-xl outline-none transition-all duration-200 bg-white border-slate-200 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 focus:shadow-lg focus:shadow-orange-500/10"
          />
        ))}
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isSubmitting || code.length < 6}
        className="w-full py-4 text-white font-semibold rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-orange-500/25 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed text-sm relative overflow-hidden"
        style={{
          background: code.length === 6 
            ? 'linear-gradient(135deg, #f97316 0%, #ea580c 50%, #dc2626 100%)'
            : 'linear-gradient(135deg, #94a3b8 0%, #94a3b8 100%)'
        }}
      >
        {isSubmitting ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            {t('register.verifying')}
          </span>
        ) : t('register.confirmButton')}
      </button>

      <div className="mt-6 text-center text-sm text-slate-500">
        {t('register.didntReceiveCode')}{' '}
        {countdown > 0 ? (
          <span className="text-slate-400">{t('register.resendAfter', { n: countdown })}</span>
        ) : (
          <button 
            type="button" 
            onClick={handleResend} 
            disabled={isResending}
            className="font-bold text-orange-500 hover:text-orange-600 transition-colors disabled:opacity-50"
          >
            {isResending ? t('register.sending') : t('register.resendButton')}
          </button>
        )}
      </div>
    </div>
  );
};

// ── Popup đồng ý điều khoản cho Google ─────────────────────────────────────
const TermsConsentPopup = ({ isOpen, onClose, onAccept, isLoading }) => {
  const { t } = useI18n();
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptDpa, setAcceptDpa] = useState(false);

  const allChecked = acceptTerms && acceptPrivacy && acceptDpa;

  const handleAccept = () => {
    if (!allChecked) {
      toast.error(t('register.acceptAllTerms'));
      return;
    }
    onAccept();
  };

  // Reset checkboxes when popup opens
  useEffect(() => {
    if (isOpen) {
      setAcceptTerms(false);
      setAcceptPrivacy(false);
      setAcceptDpa(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-red-500 px-6 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">{t('register.termsConsentTitle')}</h3>
            <button
              onClick={onClose}
              className="p-1 rounded-full hover:bg-white/20 transition-colors"
            >
              <HiOutlineX className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          <p className="text-sm text-slate-600 leading-relaxed mb-4">
            {t('register.termsConsentDesc')}
          </p>
          <div className="mt-4 space-y-3">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                className="mt-1 w-4 h-4 text-orange-500 border-slate-300 rounded focus:ring-orange-500"
              />
              <span className="text-xs text-slate-600 leading-relaxed group-hover:text-slate-700 transition-colors">
                {t('register.termsConsentTerms')}
                {' '}
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline font-medium">(Xem)</a>
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={acceptPrivacy}
                onChange={(e) => setAcceptPrivacy(e.target.checked)}
                className="mt-1 w-4 h-4 text-orange-500 border-slate-300 rounded focus:ring-orange-500"
              />
              <span className="text-xs text-slate-600 leading-relaxed group-hover:text-slate-700 transition-colors">
                {t('register.termsConsentPrivacy')}
                {' '}
                <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline font-medium">(Xem)</a>
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={acceptDpa}
                onChange={(e) => setAcceptDpa(e.target.checked)}
                className="mt-1 w-4 h-4 text-orange-500 border-slate-300 rounded focus:ring-orange-500"
              />
              <span className="text-xs text-slate-600 leading-relaxed group-hover:text-slate-700 transition-colors">
                {t('register.termsConsentDpa')}
                {' '}
                <a href="/public-dpa" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline font-medium">(Xem)</a>
              </span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 font-medium transition-colors"
          >
            {t('register.cancel')}
          </button>
          <button
            onClick={handleAccept}
            disabled={isLoading || !allChecked}
            className="px-6 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white text-sm font-semibold rounded-lg hover:shadow-lg hover:shadow-orange-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t('register.processing')}
              </span>
            ) : t('register.acceptAndContinue')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Form đăng ký ──────────────────────────────────────────────────────────────
const Register = () => {
  const { t } = useI18n();
  const [showPassword, setShowPassword]               = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [step, setStep]                               = useState('form');
  const [isSendingCode, setIsSendingCode]             = useState(false);
  const [otpData, setOtpData]                         = useState(null);
  const [termsChecked, setTermsChecked]               = useState(false);
  const [showGoogleConsent, setShowGoogleConsent]   = useState(false);
  const [pendingGoogleToken, setPendingGoogleToken] = useState(null);
  const { googleLogin }                               = useAuthStore();
  const navigate                                      = useNavigate();

  const handleGoogleSuccess = (tokenResponse) => {
    setPendingGoogleToken(tokenResponse);
    setShowGoogleConsent(true);
  };

  const handleGoogleConsentAccept = async () => {
    if (!pendingGoogleToken) return;
    setIsSendingCode(true);
    try {
      const result = await googleLogin({ access_token: pendingGoogleToken.access_token });
      toast.success(t('register.googleLoginSuccess'));
      // TẠM GIỮ LẠI — đây chính xác là luồng bị nghi TrialWelcomeModal không hiện
      // (P2-1, 22/08). Xem comment đầy đủ ở handleSubmit phía trên.
      const trialDays = result?.data?.trial?.durationDays;
      if (trialDays) {
        toast.success(t('register.trialGranted', { days: trialDays }));
      }
      setShowGoogleConsent(false);
      navigate(getPostAuthPath(result?.data?.user));
    } catch (error) {
      const message = error.response?.data?.message || t('register.googleLoginFailed');
      toast.error(message);
      setShowGoogleConsent(false);
    } finally {
      setIsSendingCode(false);
      setPendingGoogleToken(null);
    }
  };

  const handleGoogleError = () => {
    toast.error(t('register.googleError'));
  };

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(registerSchema(t)),
  });

  const onSubmit = async (data) => {
    if (!termsChecked) {
      toast.error(t('auth.acceptTerms'));
      return;
    }
    setIsSendingCode(true);
    try {
      await sendVerificationCode({ email: data.email, username: data.username });
      setOtpData({
        email: data.email,
        formData: {
          username: data.username,
          email:    data.email,
          password: data.password,
          fullName: data.fullName?.trim() || undefined,
          phone:    data.phone?.trim()    || undefined,
        },
      });
      setStep('otp');
    } catch (err) {
      toast.error(err?.response?.data?.message || t('register.sendCodeFailed'));
    } finally {
      setIsSendingCode(false);
    }
  };

  if (step === 'otp' && otpData) {
    return (
      <OtpStep
        email={otpData.email}
        formData={otpData.formData}
        onBack={() => setStep('form')}
      />
    );
  }

  return (
    <div className="w-full max-w-md mx-auto opacity-0 animate-fadeIn" style={{ animation: 'fadeIn 0.5s ease forwards' }}>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{t('register.registerTitle')}</h1>
        <p className="text-slate-500 mt-2 text-sm leading-relaxed">{t('register.registerSubtitle')}</p>
      </div>

      {/* Progress indicator */}
      <div className="flex items-center gap-2 mb-8">
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-bold">1</div>
        <div className="flex-1 h-0.5 bg-slate-200 rounded">
          <div className="h-full bg-orange-500 rounded" style={{ width: '0%' }} />
        </div>
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 text-slate-500 text-xs font-bold">2</div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Username & Email */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">
              {t('auth.usernameLabel')} <span className="text-red-500">*</span>
            </label>
            <div className="relative group">
              <HiOutlineUser className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
              <input 
                type="text" 
                {...register('username')}
                className={`w-full pl-12 pr-4 py-3.5 border rounded-xl outline-none transition-all duration-200 text-sm bg-white ${
                  errors.username 
                    ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/10' 
                    : 'border-slate-200 hover:border-slate-300 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 focus:shadow-lg focus:shadow-orange-500/10'
                }`}
                placeholder={t('register.usernamePlaceholder')}
              />
            </div>
            {errors.username && (
              <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <span className="inline-block w-1 h-1 rounded-full bg-red-500" />
                {errors.username.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">
              {t('common.email')} <span className="text-red-500">*</span>
            </label>
            <div className="relative group">
              <HiOutlineMail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
              <input 
                type="email" 
                {...register('email')}
                className={`w-full pl-12 pr-4 py-3.5 border rounded-xl outline-none transition-all duration-200 text-sm bg-white ${
                  errors.email 
                    ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/10' 
                    : 'border-slate-200 hover:border-slate-300 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 focus:shadow-lg focus:shadow-orange-500/10'
                }`}
                placeholder={t('register.emailPlaceholder')}
              />
            </div>
            {errors.email && (
              <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <span className="inline-block w-1 h-1 rounded-full bg-red-500" />
                {errors.email.message}
              </p>
            )}
          </div>
        </div>

        {/* Full Name & Phone */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">{t('register.fullName')}</label>
            <div className="relative group">
              <HiOutlineUser className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
              <input 
                type="text" 
                {...register('fullName')} 
                className="w-full pl-12 pr-4 py-3.5 border border-slate-200 rounded-xl outline-none transition-all duration-200 text-sm bg-white hover:border-slate-300 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 focus:shadow-lg focus:shadow-orange-500/10"
                placeholder={t('register.fullNamePlaceholder')} 
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">
              {t('register.phone')} <span className="text-red-500">*</span>
            </label>
            <div className="relative group">
              <HiOutlinePhone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
              <input 
                type="tel" 
                {...register('phone')} 
                className={`w-full pl-12 pr-4 py-3.5 border rounded-xl outline-none transition-all duration-200 text-sm bg-white ${
                  errors.phone 
                    ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/10' 
                    : 'border-slate-200 hover:border-slate-300 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 focus:shadow-lg focus:shadow-orange-500/10'
                }`}
                placeholder={t('register.phonePlaceholder')} 
              />
            </div>
            {errors.phone && (
              <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <span className="inline-block w-1 h-1 rounded-full bg-red-500" />
                {errors.phone.message}
              </p>
            )}
          </div>
        </div>

        {/* Password & Confirm */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">
              {t('auth.password')} <span className="text-red-500">*</span>
            </label>
            <div className="relative group">
              <HiOutlineLockClosed className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
              <input 
                type={showPassword ? 'text' : 'password'} 
                {...register('password')}
                className={`w-full pl-12 pr-12 py-3.5 border rounded-xl outline-none transition-all duration-200 text-sm bg-white ${
                  errors.password 
                    ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/10' 
                    : 'border-slate-200 hover:border-slate-300 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 focus:shadow-lg focus:shadow-orange-500/10'
                }`}
                placeholder="••••••••"
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-orange-500 transition-colors p-1"
              >
                {showPassword ? <HiOutlineEyeOff className="w-5 h-5" /> : <HiOutlineEye className="w-5 h-5" />}
              </button>
            </div>
            {errors.password && (
              <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <span className="inline-block w-1 h-1 rounded-full bg-red-500" />
                {errors.password.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">
              {t('auth.confirmPassword')} <span className="text-red-500">*</span>
            </label>
            <div className="relative group">
              <HiOutlineLockClosed className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
              <input 
                type={showConfirmPassword ? 'text' : 'password'} 
                {...register('confirmPassword')}
                className={`w-full pl-12 pr-12 py-3.5 border rounded-xl outline-none transition-all duration-200 text-sm bg-white ${
                  errors.confirmPassword 
                    ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/10' 
                    : 'border-slate-200 hover:border-slate-300 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 focus:shadow-lg focus:shadow-orange-500/10'
                }`}
                placeholder="••••••••"
              />
              <button 
                type="button" 
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-orange-500 transition-colors p-1"
              >
                {showConfirmPassword ? <HiOutlineEyeOff className="w-5 h-5" /> : <HiOutlineEye className="w-5 h-5" />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <span className="inline-block w-1 h-1 rounded-full bg-red-500" />
                {errors.confirmPassword.message}
              </p>
            )}
          </div>
        </div>

        {/* Terms, Privacy Policy & Public DPA */}
        <div className="space-y-3 pt-2">
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="relative mt-0.5">
              <input 
                type="checkbox" 
                checked={termsChecked}
                onChange={(e) => setTermsChecked(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-5 h-5 border-2 border-slate-300 rounded-md peer-checked:bg-orange-500 peer-checked:border-orange-500 transition-all duration-200 flex items-center justify-center">
                {termsChecked && <HiOutlineCheckCircle className="w-3.5 h-3.5 text-white" />}
              </div>
            </div>
            <span className="text-xs text-slate-600 font-medium leading-relaxed group-hover:text-slate-700 transition-colors">
              {t('auth.termsAgree')}{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:text-orange-700 font-bold hover:underline underline-offset-2 transition-colors">{t('auth.terms')}</a>
              {', '}
              <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:text-orange-700 font-bold hover:underline underline-offset-2 transition-colors">{t('auth.privacyPolicy')}</a>
              {' '}{t('auth.and')}{' '}
              <a href="/public-dpa" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:text-orange-700 font-bold hover:underline underline-offset-2 transition-colors">{t('auth.publicDPA')}</a>
            </span>
          </label>
        </div>

        {/* Submit button */}
        <button 
          type="submit" 
          disabled={isSendingCode}
          className="w-full py-4 text-white font-semibold rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-orange-500/25 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed text-sm relative overflow-hidden mt-2"
          style={{
            background: 'linear-gradient(135deg, #f97316 0%, #ea580c 50%, #dc2626 100%)',
          }}
        >
          {isSendingCode ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {t('register.sendingCode')}
            </span>
          ) : t('register.registerButton')}
        </button>
      </form>

      {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
        <>
          <div className="flex items-center my-6">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="px-4 text-xs text-slate-400 font-medium uppercase tracking-wider">{t('common.or')}</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <GoogleAuthButton
            onSuccess={handleGoogleSuccess}
            onError={handleGoogleError}
            text={t('register.continueWithGoogle')}
            disabled={isSendingCode}
          />
        </>
      )}

      <p className="mt-8 text-center text-sm text-slate-600">
        {t('auth.alreadyHaveAccount')}{' '}
        <Link
          to="/login"
          className="text-orange-500 hover:text-orange-600 font-bold hover:underline underline-offset-4 transition-colors"
        >
          {t('auth.loginHere')}
        </Link>
      </p>

      {/* Terms Consent Popup for Google Signup */}
      <TermsConsentPopup
        isOpen={showGoogleConsent}
        onClose={() => {
          setShowGoogleConsent(false);
          setPendingGoogleToken(null);
        }}
        onAccept={handleGoogleConsentAccept}
        isLoading={isSendingCode}
      />
    </div>
  );
};

export default Register;
