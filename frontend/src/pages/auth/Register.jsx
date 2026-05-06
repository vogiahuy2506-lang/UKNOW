import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';
import EmailAuthModal from '../../components/auth/EmailAuthModal';
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
import { GoogleLogin } from '@react-oauth/google';

const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'Tên đăng nhập phải có ít nhất 3 ký tự')
    .max(50, 'Tên đăng nhập không được quá 50 ký tự')
    .regex(/^[A-Za-z0-9]+$/, 'Tên đăng nhập chỉ được chứa chữ cái không dấu và số'),
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu phải có ít nhất 6 ký tự'),
  confirmPassword: z.string(),
  fullName: z.string().optional(),
  phone: z.string().optional().refine(
    (v) => !v || /^[0-9]{10,11}$/.test(v),
    { message: 'Số điện thoại không hợp lệ' }
  ),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Mật khẩu xác nhận không khớp',
  path: ['confirmPassword'],
});

const RESEND_COOLDOWN = 60;

const inputBase = 'w-full pl-10 pr-3 py-3 border rounded-xl outline-none transition-all duration-200 bg-slate-50 focus:bg-white';
const inputNormal = `${inputBase} border-slate-200 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10`;
const inputError = `${inputBase} border-red-500 focus:border-red-500 focus:ring-4 focus:ring-red-500/10`;
const FieldError = ({ msg }) => msg ? (
  <p className="text-xs font-medium text-red-500 flex items-start gap-1 mt-1">
    <span className="w-1 h-1 rounded-full bg-red-500 inline-block mt-1 flex-shrink-0" />
    <span>{msg}</span>
  </p>
) : null;

// ── Màn nhập OTP ─────────────────────────────────────────────────────────────
const OtpStep = ({ email, formData, onBack }) => {
  const navigate = useNavigate();
  const { register: registerUser } = useAuthStore();

  const [digits, setDigits]           = useState(['', '', '', '', '', '']);
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
      toast.success('Đã gửi lại mã xác minh');
      document.getElementById('otp-0')?.focus();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Không thể gửi lại mã');
    } finally {
      setIsResending(false);
    }
  };

  const handleSubmit = async () => {
    const code = digits.join('');
    if (code.length < 6) { toast.error('Vui lòng nhập đủ 6 chữ số'); return; }
    setIsSubmitting(true);
    try {
      await registerUser({ ...formData, emailVerificationCode: code });
      toast.success('Đăng ký thành công!');
      navigate('/');
    } catch (err) {
      const msg = err?.response?.data?.message || 'Xác minh thất bại';
      toast.error(msg);
      // Nếu mã sai thì xóa để nhập lại
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
        Quay lại
      </button>

      <div className="mb-8">
        <div className="w-14 h-14 bg-orange-100 rounded-2xl flex items-center justify-center mb-5">
          <HiOutlineMail className="w-7 h-7 text-orange-500" />
        </div>
        <h1 className="text-2xl font-black text-slate-900 mb-2">Xác minh email</h1>
        <p className="text-slate-500 text-sm leading-relaxed">
          Chúng tôi đã gửi mã xác minh 6 chữ số đến
        </p>
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
            className="w-12 h-14 text-center text-xl font-bold border-2 rounded-xl outline-none transition-all bg-slate-50 focus:bg-white border-slate-200 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
          />
        ))}
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isSubmitting || code.length < 6}
        className="w-full py-4 bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold text-base rounded-xl hover:shadow-lg hover:shadow-orange-500/30 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
      >
        {isSubmitting ? (
          <span className="flex items-center justify-center gap-2">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Đang xác minh...
          </span>
        ) : 'Xác nhận & Tạo tài khoản'}
      </button>

      <div className="mt-5 text-center text-sm text-slate-500">
        Không nhận được mã?{' '}
        {countdown > 0 ? (
          <span className="text-slate-400">Gửi lại sau {countdown}s</span>
        ) : (
          <button type="button" onClick={handleResend} disabled={isResending}
            className="font-bold text-orange-500 hover:text-orange-600 transition-colors disabled:opacity-50"
          >
            {isResending ? 'Đang gửi...' : 'Gửi lại'}
          </button>
        )}
      </div>
    </div>
  );
};

// ── Form đăng ký ──────────────────────────────────────────────────────────────
const Register = () => {
  const [showPassword, setShowPassword]               = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [step, setStep]                               = useState('form');
  const [isSendingCode, setIsSendingCode]             = useState(false);
  const [otpData, setOtpData]                         = useState(null); // { email, formData }
  const { googleLogin }                               = useAuthStore();
  const navigate                                      = useNavigate();

  const handleGoogleSuccess = async (credentialResponse) => {
    setIsSendingCode(true); // Reusing the loading state
    try {
      const result = await googleLogin(credentialResponse.credential);
      toast.success('Đăng nhập Google thành công!');
      const role = result?.data?.user?.role;
      navigate(role === 'super_admin' ? '/admin' : '/app');
    } catch (error) {
      const message = error.response?.data?.message || 'Đăng nhập Google thất bại';
      toast.error(message);
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleGoogleError = () => {
    toast.error('Lỗi khi kết nối với Google');
  };

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(registerSchema),
  });

  // Bước 1: validate form → gửi OTP → chuyển sang màn OTP
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
      toast.error(err?.response?.data?.message || 'Không thể gửi mã xác minh');
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
      <div className="w-full max-w-[480px] mx-auto">
        <div className="mb-8 lg:mb-10">
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight mb-2">Đăng ký tài khoản</h1>
          <p className="text-slate-500 font-medium">Bắt đầu trải nghiệm UKNOW miễn phí</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Username & Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-slate-700">
                Tên đăng nhập <span className="text-red-500">*</span>
              </label>
              <div className="relative group">
                <HiOutlineUser className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
                <input type="text" {...register('username')}
                  className={errors.username ? inputError : inputNormal}
                  placeholder="john_doe"
                />
              </div>
              <FieldError msg={errors.username?.message} />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-slate-700">
                Email <span className="text-red-500">*</span>
              </label>
              <div className="relative group">
                <HiOutlineMail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
                <input type="email" {...register('email')}
                  className={errors.email ? inputError : inputNormal}
                  placeholder="name@company.com"
                />
              </div>
              <FieldError msg={errors.email?.message} />
            </div>
          </div>

          {/* Full Name & Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-slate-700">Họ và tên</label>
              <div className="relative group">
                <HiOutlineUser className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
                <input type="text" {...register('fullName')} className={inputNormal} placeholder="Nguyễn Văn A" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-slate-700">Số điện thoại</label>
              <div className="relative group">
                <HiOutlinePhone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
                <input type="tel" {...register('phone')} className={inputNormal} placeholder="0901234567" />
              </div>
              <FieldError msg={errors.phone?.message} />
            </div>
          </div>

          {/* Password & Confirm */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-slate-700">
                Mật khẩu <span className="text-red-500">*</span>
              </label>
              <div className="relative group">
                <HiOutlineLockClosed className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
                <input type={showPassword ? 'text' : 'password'} {...register('password')}
                  className={`${errors.password ? inputError : inputNormal} pr-10`}
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
              <label className="block text-sm font-bold text-slate-700">
                Xác nhận <span className="text-red-500">*</span>
              </label>
              <div className="relative group">
                <HiOutlineLockClosed className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
                <input type={showConfirmPassword ? 'text' : 'password'} {...register('confirmPassword')}
                  className={`${errors.confirmPassword ? inputError : inputNormal} pr-10`}
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
              Tôi đồng ý với{' '}
              <a href="#" className="text-orange-600 hover:text-orange-700 font-bold hover:underline transition-colors">Điều khoản sử dụng</a>
              {' '}và{' '}
              <a href="#" className="text-orange-600 hover:text-orange-700 font-bold hover:underline transition-colors">Chính sách bảo mật</a>
            </span>
          </div>

          <button type="submit" disabled={isSendingCode}
            className="w-full py-4 px-4 bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold text-base rounded-xl hover:shadow-lg hover:shadow-orange-500/30 transition-all active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none mt-4"
          >
            {isSendingCode ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Đang gửi mã xác minh...
              </span>
            ) : 'Tạo tài khoản'}
          </button>
        </form>

        <div className="flex items-center my-8">
          <div className="flex-1 border-t border-slate-200" />
          <span className="px-4 text-xs font-bold text-slate-400 uppercase tracking-widest">hoặc</span>
          <div className="flex-1 border-t border-slate-200" />
        </div>

        <div className="w-full flex justify-center">
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={handleGoogleError}
            theme="outline"
            size="large"
            width="100%"
            text="signup_with"
            shape="rectangular"
          />
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm font-medium text-slate-600">
            Đã có tài khoản?{' '}
            <Link to="/login" className="font-bold text-orange-500 hover:text-orange-600 transition-colors ml-1">
              Đăng nhập ngay
            </Link>
          </p>
        </div>
      </div>

      {/* Removed EmailAuthModal since GoogleLogin is direct */}
    </>
  );
};

export default Register;
