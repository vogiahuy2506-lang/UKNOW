import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';
import { useI18n } from '../../i18n';
import api from '../../services/api';
import {
  HiOutlineLockClosed,
  HiOutlineEye,
  HiOutlineEyeOff,
  HiOutlineUser,
  HiOutlinePhone,
  HiOutlineMail,
  HiOutlineArrowLeft,
} from 'react-icons/hi';
import GoogleAuthButton from '../../components/GoogleAuthButton';
import { getPostAuthPath } from '../../utils/authRedirect';

const registerSchema = (t) => z.object({
  username: z
    .string()
    .min(3, t('register.usernameMinLen'))
    .max(50, t('register.usernameMaxLen'))
    .regex(/^[A-Za-z0-9]+$/, t('register.usernamePattern')),
  email: z.string().email(t('register.invalidEmail')),
  password: z.string().min(6, t('auth.passwordMinLength')),
  confirmPassword: z.string(),
  fullName: z.string().optional(),
  phone: z.string().optional().refine(
    (v) => !v || /^[0-9]{10,11}$/.test(v),
    { message: t('register.invalidPhone') }
  ),
}).refine((d) => d.password === d.confirmPassword, {
  message: t('auth.passwordMismatch'),
  path: ['confirmPassword'],
});

const RESEND_COOLDOWN = 60;

const inputClass = 'w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl outline-none transition-all focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 text-sm bg-white';
const FieldError = ({ msg }) => msg ? (
  <p className="text-xs text-red-500 mt-1">{msg}</p>
) : null;

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

  useEffect(() => {
    startTimer();
    document.getElementById('otp-0')?.focus();
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
    if (val && i < 5) document.getElementById(`otp-${i + 1}`)?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0)
      document.getElementById(`otp-${i - 1}`)?.focus();
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const next = [...digits];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setDigits(next);
    document.getElementById(`otp-${Math.min(pasted.length, 5)}`)?.focus();
  };

  const handleResend = async () => {
    setIsResending(true);
    try {
      await api.post('/verification/send-code', { email });
      setDigits(['', '', '', '', '', '']);
      startTimer();
      toast.success(t('register.resendSuccess'));
      document.getElementById('otp-0')?.focus();
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
      await registerUser({ ...formData, emailVerificationCode: code });
      toast.success(t('auth.registerSuccess'));
      navigate('/');
    } catch (err) {
      const msg = err?.response?.data?.message || t('auth.verificationFailed');
      toast.error(msg);
      if (err?.response?.status === 400) setDigits(['', '', '', '', '', '']);
    } finally {
      setIsSubmitting(false);
    }
  };

  const code = digits.join('');

  return (
    <div className="w-full max-w-[400px] mx-auto">
      <button type="button" onClick={onBack}
        className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 mb-8 transition-colors"
      >
        <HiOutlineArrowLeft className="w-4 h-4" />
        {t('register.back')}
      </button>

      <div className="mb-8">
        <div className="w-14 h-14 bg-orange-100 rounded-2xl flex items-center justify-center mb-5">
          <HiOutlineMail className="w-7 h-7 text-orange-500" />
        </div>
        <h1 className="text-2xl font-black text-slate-900 mb-2">{t('register.verifyEmail')}</h1>
        <p className="text-slate-500 text-sm leading-relaxed">{t('register.enterOtpCode')}</p>
        <p className="font-bold text-slate-800 text-sm mt-0.5">{email}</p>
      </div>

      {/* 6 ô OTP */}
      <div className="flex justify-center gap-2 mb-6">
        {digits.map((d, i) => (
          <input
            key={i}
            id={`otp-${i}`}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={i === 0 ? handlePaste : undefined}
            className="w-12 h-14 text-center text-xl font-bold border-2 rounded-xl outline-none transition-all bg-white border-slate-200 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
          />
        ))}
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isSubmitting || code.length < 6}
        className="w-full py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-orange-500/25 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none text-sm"
      >
        {isSubmitting ? (
          <span className="flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            {t('register.verifying')}
          </span>
        ) : t('register.confirmButton')}
      </button>

      <div className="mt-5 text-center text-sm text-slate-500">
        {t('register.didntReceiveCode')}{' '}
        {countdown > 0 ? (
          <span className="text-slate-400">{t('register.resendAfter', { n: countdown })}</span>
        ) : (
          <button type="button" onClick={handleResend} disabled={isResending}
            className="font-bold text-orange-500 hover:text-orange-600 transition-colors disabled:opacity-50"
          >
            {isResending ? t('register.sending') : t('register.resendButton')}
          </button>
        )}
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
  const { googleLogin }                               = useAuthStore();
  const navigate                                      = useNavigate();

  const handleGoogleSuccess = async (tokenResponse) => {
    setIsSendingCode(true);
    try {
      const result = await googleLogin({ access_token: tokenResponse.access_token });
      toast.success(t('register.googleLoginSuccess'));
      navigate(getPostAuthPath(result?.data?.user));
    } catch (error) {
      const message = error.response?.data?.message || t('register.googleLoginFailed');
      toast.error(message);
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleGoogleError = () => {
    toast.error(t('register.googleError'));
  };

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(registerSchema(t)),
  });

  const onSubmit = async (data) => {
    setIsSendingCode(true);
    try {
      await api.post('/verification/send-code', { email: data.email, username: data.username });
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
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{t('register.registerTitle')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('register.registerSubtitle')}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Username & Email */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">
              {t('auth.usernameLabel')} <span className="text-red-500">*</span>
            </label>
            <div className="relative group">
              <HiOutlineUser className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
              <input type="text" {...register('username')}
                className={errors.username ? `${inputClass} border-red-400` : inputClass}
                placeholder={t('register.usernamePlaceholder')}
              />
            </div>
            <FieldError msg={errors.username?.message} />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">
              {t('common.email')} <span className="text-red-500">*</span>
            </label>
            <div className="relative group">
              <HiOutlineMail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
              <input type="email" {...register('email')}
                className={errors.email ? `${inputClass} border-red-400` : inputClass}
                placeholder={t('register.emailPlaceholder')}
              />
            </div>
            <FieldError msg={errors.email?.message} />
          </div>
        </div>

        {/* Full Name & Phone */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t('register.fullName')}</label>
            <div className="relative group">
              <HiOutlineUser className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
              <input type="text" {...register('fullName')} className={inputClass} placeholder={t('register.fullNamePlaceholder')} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{t('register.phone')}</label>
            <div className="relative group">
              <HiOutlinePhone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
              <input type="tel" {...register('phone')} className={`${inputClass} ${errors.phone ? 'border-red-400' : ''}`} placeholder={t('register.phonePlaceholder')} />
            </div>
            <FieldError msg={errors.phone?.message} />
          </div>
        </div>

        {/* Password & Confirm */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">
              {t('auth.password')} <span className="text-red-500">*</span>
            </label>
            <div className="relative group">
              <HiOutlineLockClosed className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
              <input type={showPassword ? 'text' : 'password'} {...register('password')}
                className={`${errors.password ? `${inputClass} border-red-400` : inputClass} pr-10`}
                placeholder="••••••••"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-orange-500 transition-colors p-1">
                {showPassword ? <HiOutlineEyeOff className="w-4 h-4" /> : <HiOutlineEye className="w-4 h-4" />}
              </button>
            </div>
            <FieldError msg={errors.password?.message} />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">
              {t('auth.confirmPassword')} <span className="text-red-500">*</span>
            </label>
            <div className="relative group">
              <HiOutlineLockClosed className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
              <input type={showConfirmPassword ? 'text' : 'password'} {...register('confirmPassword')}
                className={`${errors.confirmPassword ? `${inputClass} border-red-400` : inputClass} pr-10`}
                placeholder="••••••••"
              />
              <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-orange-500 transition-colors p-1">
                {showConfirmPassword ? <HiOutlineEyeOff className="w-4 h-4" /> : <HiOutlineEye className="w-4 h-4" />}
              </button>
            </div>
            <FieldError msg={errors.confirmPassword?.message} />
          </div>
        </div>

        {/* Terms */}
        <div className="flex items-start pt-2">
          <input type="checkbox" required
            className="w-4 h-4 mt-0.5 rounded border-slate-300 text-orange-500 focus:ring-orange-500 cursor-pointer"
          />
          <span className="ml-2.5 text-xs text-slate-600 font-medium leading-relaxed">
            {t('auth.termsAgree')}{' '}
            <a href="#" className="text-orange-600 hover:text-orange-700 font-bold hover:underline transition-colors">{t('auth.terms')}</a>
            {' '}{t('auth.and')}{' '}
            <a href="#" className="text-orange-600 hover:text-orange-700 font-bold hover:underline transition-colors">{t('auth.privacyPolicy')}</a>
          </span>
        </div>

        <button type="submit" disabled={isSendingCode}
          className="w-full py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white font-semibold text-sm rounded-xl hover:shadow-lg hover:shadow-orange-500/25 transition-all active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none"
        >
          {isSendingCode ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {t('register.sendingCode')}
            </span>
          ) : t('register.registerButton')}
        </button>
      </form>

      {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
        <>
          <div className="flex items-center my-4">
            <div className="flex-1 border-t border-slate-200" />
            <span className="px-3 text-xs text-slate-400">{t('common.or')}</span>
            <div className="flex-1 border-t border-slate-200" />
          </div>

          <GoogleAuthButton
            onSuccess={handleGoogleSuccess}
            onError={handleGoogleError}
            text={t('register.continueWithGoogle')}
            disabled={isSendingCode}
          />
        </>
      )}

      <p className="mt-5 text-center text-sm text-slate-600">
        {t('auth.alreadyHaveAccount')}{' '}
        <Link to="/login" className="text-orange-500 hover:text-orange-600 font-semibold">
          {t('auth.loginHere')}
        </Link>
      </p>
    </>
  );
};

export default Register;
