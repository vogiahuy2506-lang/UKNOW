import { useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { 
  HiOutlineLockClosed, 
  HiOutlineEye, 
  HiOutlineEyeOff, 
  HiOutlineShieldCheck, 
  HiOutlineSparkles,
  HiOutlineCheck,
  HiOutlineExclamationCircle,
  HiOutlineArrowLeft
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import { activateAccount } from '../../features/auth/services/authApi.service';
import { useAuthStore } from '../../stores/authStore';
import GoogleAuthButton from '../../components/GoogleAuthButton';
import { getPostAuthPath } from '../../utils/authRedirect';

/**
 * ActivatePage - Kích hoạt tài khoản nhân viên được mời
 * Thiết kế chuẩn phong cách Impeccable Design:
 * - Tương thích hoàn hảo với AuthLayout (nền video, panel thương hiệu Founder AI, card kính)
 * - Tích hợp Google Sign-In để kích hoạt nhanh nếu dùng email Google
 * - Hiển thị checklist độ mạnh mật khẩu trực quan theo thời gian thực
 * - Chuyển đổi trạng thái mượt mà (Form -> Loading -> Success / Error)
 */
const ActivatePage = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { googleLogin } = useAuthStore();

  const [state, setState] = useState('form'); // 'form' | 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Live password checks
  const hasMinLength = password.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  // Google Login handling: tự động kích hoạt tài khoản pending_activation từ backend
  const handleGoogleSuccess = async (tokenResponse) => {
    setIsGoogleLoading(true);
    try {
      const result = await googleLogin({ access_token: tokenResponse.access_token });
      toast.success(t('auth.googleLoginSuccess') || 'Đăng nhập thành công!');
      navigate(getPostAuthPath(result?.data?.user));
    } catch (error) {
      const message = error.response?.data?.message || t('auth.googleLoginFailed') || 'Đăng nhập Google thất bại';
      toast.error(message);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleGoogleError = () => {
    toast.error(t('auth.googleError') || 'Đăng nhập Google thất bại');
  };

  const validatePassword = (pwd) => {
    if (pwd.length < 8) return t('auth.passwordMinLength') || 'Mật khẩu phải có ít nhất 8 ký tự';
    if (!/[a-zA-Z]/.test(pwd)) return t('auth.passwordNeedLetter') || 'Mật khẩu phải chứa ít nhất 1 chữ cái';
    if (!/[0-9]/.test(pwd)) return t('auth.passwordNeedNumber') || 'Mật khẩu phải chứa ít nhất 1 chữ số';
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
      setValidationError(t('auth.passwordMismatch') || 'Mật khẩu xác nhận không khớp');
      return;
    }

    setIsSubmitting(true);

    try {
      await activateAccount({ token, password });
      setState('success');
    } catch (err) {
      setState('error');
      setErrorMessage(err?.response?.data?.message || t('activate.expiredOrInvalid'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Trường hợp không có token trong URL
  if (!token) {
    return (
      <div 
        className="w-full max-w-md mx-auto text-center py-6 opacity-0 animate-fadeIn"
        style={{ animation: 'fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
      >
        <div 
          className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-5"
          style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.12) 0%, rgba(239,68,68,0.2) 100%)' }}
        >
          <HiOutlineExclamationCircle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight mb-2">
          {t('activate.failedTitle')}
        </h2>
        <p className="text-slate-500 text-sm leading-relaxed mb-6">
          {t('activate.invalidLink')}
        </p>
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 mb-6 text-left leading-relaxed">
          {t('activate.contactManager')}
        </div>
        <Link 
          to="/login" 
          className="inline-flex items-center justify-center gap-2 w-full py-3.5 text-center font-semibold rounded-xl text-white transition-all shadow-md shadow-orange-500/20 hover:shadow-lg hover:shadow-orange-500/30 active:scale-[0.99]"
          style={{
            background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'
          }}
        >
          <HiOutlineArrowLeft className="w-4 h-4" />
          <span>{t('activate.backToLogin')}</span>
        </Link>
      </div>
    );
  }

  // Trường hợp kích hoạt thành công
  if (state === 'success') {
    return (
      <div 
        className="w-full max-w-md mx-auto text-center py-6 opacity-0 animate-fadeIn"
        style={{ animation: 'fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
      >
        <div 
          className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-5 shadow-lg shadow-emerald-500/20"
          style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
        >
          <HiOutlineCheck className="w-9 h-9 text-white stroke-[2.5]" />
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold mb-3">
          <HiOutlineSparkles className="w-3.5 h-3.5" />
          <span>Thành công</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight mb-2">
          {t('activate.successTitle')}
        </h2>
        <p className="text-slate-500 text-sm leading-relaxed mb-8">
          {t('activate.successMessage')}
        </p>
        <Link 
          to="/login?activated=1" 
          className="inline-flex items-center justify-center gap-2 w-full py-3.5 text-center font-semibold rounded-xl text-white transition-all shadow-md shadow-orange-500/20 hover:shadow-lg hover:shadow-orange-500/30 active:scale-[0.99]"
          style={{
            background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'
          }}
        >
          <span>{t('activate.loginNow')}</span>
        </Link>
      </div>
    );
  }

  // Trường hợp kích hoạt thất bại / token hết hạn
  if (state === 'error') {
    return (
      <div 
        className="w-full max-w-md mx-auto text-center py-6 opacity-0 animate-fadeIn"
        style={{ animation: 'fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
      >
        <div 
          className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-5 shadow-md shadow-red-500/10"
          style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.12) 0%, rgba(239,68,68,0.2) 100%)' }}
        >
          <HiOutlineExclamationCircle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight mb-2">
          {t('activate.failedTitle')}
        </h2>
        <p className="text-slate-500 text-sm leading-relaxed mb-6">
          {errorMessage}
        </p>
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 mb-6 text-left leading-relaxed">
          {t('activate.contactManager')}
        </div>
        <Link 
          to="/login" 
          className="inline-flex items-center justify-center gap-2 w-full py-3.5 text-center font-semibold rounded-xl text-white transition-all shadow-md shadow-orange-500/20 hover:shadow-lg hover:shadow-orange-500/30 active:scale-[0.99]"
          style={{
            background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'
          }}
        >
          <HiOutlineArrowLeft className="w-4 h-4" />
          <span>{t('activate.backToLogin')}</span>
        </Link>
      </div>
    );
  }

  // Giao diện chính: Form tạo mật khẩu + tùy chọn Google Sign-In
  return (
    <div 
      className="w-full max-w-md mx-auto opacity-0 animate-fadeIn"
      style={{ animation: 'fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
    >
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <div 
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm"
            style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.12) 0%, rgba(239,68,68,0.12) 100%)' }}
          >
            <HiOutlineShieldCheck className="w-5 h-5 text-orange-500" />
          </div>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-50 text-orange-600 border border-orange-200/60">
            {t('activate.badge')}
          </span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight mb-2">
          {t('activate.title')}
        </h1>
        <p className="text-slate-500 text-sm leading-relaxed">
          {t('activate.subtitle')}
        </p>
      </div>

      {/* Tùy chọn 1: Đăng nhập nhanh bằng Google (nếu dùng email Google) */}
      <div className="mb-6">
        <div className="p-3.5 rounded-xl bg-orange-50/60 border border-orange-100 mb-3">
          <p className="text-xs text-orange-800 leading-relaxed font-medium">
            💡 {t('activate.googleSectionDesc')}
          </p>
        </div>
        <GoogleAuthButton
          onSuccess={handleGoogleSuccess}
          onError={handleGoogleError}
          text={t('activate.googleSectionTitle')}
          disabled={isGoogleLoading || isSubmitting}
        />
      </div>

      {/* Phân cách */}
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-slate-200/80" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-3 text-slate-400 font-semibold tracking-wider">
            {t('activate.orCreatePassword')}
          </span>
        </div>
      </div>

      {/* Form tạo mật khẩu */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Mật khẩu mới */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
            {t('auth.newPassword')}
          </label>
          <div className="relative">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              <HiOutlineLockClosed className="w-5 h-5" />
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-11 pr-11 py-3 text-sm bg-white border border-slate-200 rounded-xl outline-none transition-all duration-150 hover:border-slate-300 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
              placeholder={t('auth.enterNewPassword')}
              minLength={8}
              required
              disabled={isSubmitting}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
              tabIndex={-1}
            >
              {showPassword ? <HiOutlineEyeOff className="w-4 h-4" /> : <HiOutlineEye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Xác nhận mật khẩu */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
            {t('auth.confirmPassword')}
          </label>
          <div className="relative">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              <HiOutlineLockClosed className="w-5 h-5" />
            </div>
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full pl-11 pr-11 py-3 text-sm bg-white border border-slate-200 rounded-xl outline-none transition-all duration-150 hover:border-slate-300 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
              placeholder={t('auth.confirmNewPassword')}
              minLength={8}
              required
              disabled={isSubmitting}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
              tabIndex={-1}
            >
              {showConfirmPassword ? <HiOutlineEyeOff className="w-4 h-4" /> : <HiOutlineEye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Thông báo lỗi validation */}
        {validationError && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200/80">
            <p className="text-red-600 text-xs font-medium flex items-center gap-1.5">
              <HiOutlineExclamationCircle className="w-4 h-4 shrink-0" />
              <span>{validationError}</span>
            </p>
          </div>
        )}

        {/* Checklist yêu cầu mật khẩu tương tác trực quan */}
        <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/80">
          <p className="text-xs font-semibold text-slate-600 mb-2">Yêu cầu bảo mật:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
            <div className={`flex items-center gap-1.5 transition-colors ${hasMinLength ? 'text-emerald-600 font-medium' : 'text-slate-400'}`}>
              <HiOutlineCheck className={`w-3.5 h-3.5 ${hasMinLength ? 'text-emerald-600' : 'text-slate-300'}`} />
              <span>Tối thiểu 8 ký tự</span>
            </div>
            <div className={`flex items-center gap-1.5 transition-colors ${hasLetter ? 'text-emerald-600 font-medium' : 'text-slate-400'}`}>
              <HiOutlineCheck className={`w-3.5 h-3.5 ${hasLetter ? 'text-emerald-600' : 'text-slate-300'}`} />
              <span>Ít nhất 1 chữ cái</span>
            </div>
            <div className={`flex items-center gap-1.5 transition-colors ${hasNumber ? 'text-emerald-600 font-medium' : 'text-slate-400'}`}>
              <HiOutlineCheck className={`w-3.5 h-3.5 ${hasNumber ? 'text-emerald-600' : 'text-slate-300'}`} />
              <span>Ít nhất 1 chữ số</span>
            </div>
            <div className={`flex items-center gap-1.5 transition-colors ${passwordsMatch ? 'text-emerald-600 font-medium' : 'text-slate-400'}`}>
              <HiOutlineCheck className={`w-3.5 h-3.5 ${passwordsMatch ? 'text-emerald-600' : 'text-slate-300'}`} />
              <span>Khớp mật khẩu</span>
            </div>
          </div>
        </div>

        {/* Nút kích hoạt */}
        <button
          type="submit"
          disabled={isSubmitting || isGoogleLoading}
          className="w-full py-3.5 text-white font-semibold rounded-xl transition-all shadow-md shadow-orange-500/20 hover:shadow-lg hover:shadow-orange-500/30 active:scale-[0.99] disabled:opacity-60 disabled:pointer-events-none cursor-pointer"
          style={{
            background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'
          }}
        >
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>{t('activate.activating')}</span>
            </span>
          ) : (
            t('activate.activateButton')
          )}
        </button>

        {/* Ghi chú chân trang */}
        <p className="text-center text-xs text-slate-400 leading-relaxed pt-1">
          {t('activate.infoNote')}
        </p>

        {/* Link quay lại */}
        <div className="pt-2 text-center">
          <Link 
            to="/login" 
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-orange-500 transition-colors"
          >
            <HiOutlineArrowLeft className="w-3.5 h-3.5" />
            <span>{t('activate.backToLogin')}</span>
          </Link>
        </div>
      </form>
    </div>
  );
};

export default ActivatePage;
