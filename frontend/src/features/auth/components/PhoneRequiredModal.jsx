import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlinePhone, HiOutlineShieldCheck } from 'react-icons/hi';
import { updateMyPhone, sendPhoneOtpCode, verifyPhoneOtpCode } from '../services/authApi.service';
import { useAuthStore } from '../../../stores/authStore';
import { useI18n } from '../../../i18n';
import { isPlausiblePhone } from '../../../utils/phoneValidation';

const RESEND_COOLDOWN = 60;

/**
 * Modal nhắc bổ sung SĐT — mở khi user.phone rỗng, hoặc (PR-2, PHONE_OTP_PROVIDER bật) khi
 * có SĐT nhưng chưa xác thực bằng OTP.
 *
 * ĐÓNG ĐƯỢC (đổi 04/09/2026). Trước đây là cổng chặn cứng không có lối thoát, và điều đó
 * đã gây sự cố thật: backend `requirePhone` trả 403 ở 13+ nhóm route, trong khi đường duy
 * nhất để user tự gỡ chặn là modal này — user nào có bundle JS cũ trong cache thì không
 * thấy modal và bị khoá khỏi toàn bộ tính năng mà không hiểu vì sao.
 *
 * Nay là lời nhắc: bấm "Để sau" hoặc bấm ra ngoài là đóng, user dùng app bình thường.
 * Nhắc lại ở lần vào `/app` kế tiếp — MainLayout cố ý giữ trạng thái đã tắt trong bộ nhớ
 * chứ KHÔNG lưu localStorage, để nạp lại trang là hiện lại.
 *
 * Đi kèm điều kiện bắt buộc: `PHONE_GATE_ENABLED=false` ở backend. Bật lại cổng chặn mà
 * vẫn cho đóng modal thì user bấm "Để sau" xong sẽ ăn 403 ở mọi nơi — tệ hơn cả bản cũ.
 *
 * PR-2 (11/09/2026): khi `phoneOtpEnabled` (đọc từ authStore, xem authStore.fetchPhoneOtpEnabled),
 * modal có HAI bước — nhập số → gửi mã → nhập mã 6 số → xác thực. Khi tắt, một bước như
 * trước (updateMyPhone thẳng, không OTP) — đường lùi nếu sếp đổi ý.
 *
 * @param {{ isOpen: boolean, onClose: () => void, onChanged: (phone: string, phoneVerifiedAt?: string) => void }} props
 */
const PhoneRequiredModal = ({ isOpen, onClose, onChanged }) => {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const phoneOtpEnabled = useAuthStore((s) => s.phoneOtpEnabled);

  // step 'phone' | 'code' — chỉ có ý nghĩa khi phoneOtpEnabled; tắt thì luôn coi như 'phone'
  // và submit gọi thẳng updateMyPhone (hành vi cũ, không đổi).
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef(null);

  // Điền sẵn số đang có (tài khoản cũ / vừa đổi số) mỗi lần modal MỞ — không điền lại khi
  // đang mở dở (user gõ tay không bị ghi đè bởi một lần re-render khác).
  useEffect(() => {
    if (isOpen) {
      setPhone(user?.phone || '');
      setCode('');
      setStep('phone');
      setError('');
    }
  }, [isOpen, user?.phone]);

  useEffect(() => () => clearInterval(timerRef.current), []);

  if (!isOpen) return null;

  const startCountdown = (seconds) => {
    clearInterval(timerRef.current);
    setCountdown(seconds);
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const handlePhoneChange = (e) => {
    setPhone(e.target.value);
    setError('');
  };

  const handleCodeChange = (e) => {
    setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
    setError('');
  };

  /** Bước 1 (cờ tắt): lưu số thẳng, không OTP — hành vi y hệt trước PR-2. */
  const submitPhoneDirect = async () => {
    const res = await updateMyPhone({ phone: phone.trim() });
    if (res.success) {
      onChanged?.(res.data?.phone ?? phone.trim());
    } else {
      setError(res.message || t('phoneRequired.failed'));
    }
  };

  /** Bước 1 (cờ bật): gửi mã OTP, chuyển sang bước 2. */
  const submitSendCode = async () => {
    const res = await sendPhoneOtpCode({ phone: phone.trim() });
    if (res.success) {
      setStep('code');
      startCountdown(RESEND_COOLDOWN);
    } else {
      setError(res.message || t('phoneRequired.failed'));
    }
  };

  const handlePhoneSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!isPlausiblePhone(phone)) {
      setError(t('phoneRequired.validationInvalid'));
      return;
    }

    setLoading(true);
    try {
      if (phoneOtpEnabled) {
        await submitSendCode();
      } else {
        await submitPhoneDirect();
      }
    } catch (err) {
      if (err?.response?.status === 404) {
        setError(t('phoneRequired.versionMismatchError'));
      } else {
        // 409 PHONE_TAKEN, 429 cooldown/trần: message từ backend đã nói rõ, hiển thị
        // nguyên văn thay vì viết lại.
        setError(err?.response?.data?.message || t('phoneRequired.errorOccurred'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCodeSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (code.length !== 6) {
      setError(t('phoneRequired.codeInvalidLength'));
      return;
    }

    setLoading(true);
    try {
      const res = await verifyPhoneOtpCode({ phone: phone.trim(), code });
      if (res.success) {
        onChanged?.(res.data?.phone ?? phone.trim(), res.data?.phoneVerifiedAt);
      } else {
        setError(res.message || t('phoneRequired.failed'));
      }
    } catch (err) {
      // 409 PHONE_TAKEN (số đã được tài khoản khác xác thực trong lúc chờ), mã sai/hết hạn
      // (400 PHONE_OTP_INVALID) — cả hai backend đều trả message rõ nghĩa, hiển thị nguyên văn.
      setError(err?.response?.data?.message || t('phoneRequired.errorOccurred'));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0 || loading) return;
    setError('');
    setLoading(true);
    try {
      const res = await sendPhoneOtpCode({ phone: phone.trim() });
      if (res.success) {
        startCountdown(RESEND_COOLDOWN);
      } else {
        setError(res.message || t('phoneRequired.failed'));
      }
    } catch (err) {
      // 429: backend trả retryAfterSec thật (có thể < 60s nếu user gửi lại gần đúng mốc) —
      // dùng giá trị đó thay vì cứng 60s để đếm ngược khớp với thứ backend thực sự chặn.
      const retryAfterSec = Number(err?.response?.data?.retryAfterSec);
      if (Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
        startCountdown(retryAfterSec);
      }
      setError(err?.response?.data?.message || t('phoneRequired.errorOccurred'));
    } finally {
      setLoading(false);
    }
  };

  const handleBackToPhone = () => {
    setStep('phone');
    setCode('');
    setError('');
    clearInterval(timerRef.current);
    setCountdown(0);
  };

  return createPortal(
    <div className="modal-overlay" onClick={loading ? undefined : onClose}>
      <div
        className="modal-content modal-content-animate w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100">
          {step === 'code'
            ? <HiOutlineShieldCheck className="w-5 h-5 text-primary-600" />
            : <HiOutlinePhone className="w-5 h-5 text-primary-600" />}
          <h2 className="text-base font-semibold text-gray-900">{t('phoneRequired.title')}</h2>
        </div>

        {step === 'phone' && (
          <form onSubmit={handlePhoneSubmit} className="px-6 py-5 space-y-4">
            <p className="text-sm text-gray-600">{t('phoneRequired.description')}</p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('phoneRequired.phoneLabel')}
              </label>
              <input
                type="tel"
                value={phone}
                onChange={handlePhoneChange}
                autoFocus
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder={t('phoneRequired.phonePlaceholder')}
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex justify-end items-center gap-2 pt-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                disabled={loading}
              >
                {t('phoneRequired.later')}
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading
                  ? (phoneOtpEnabled ? t('phoneRequired.sendingCode') : t('phoneRequired.saving'))
                  : (phoneOtpEnabled ? t('phoneRequired.sendCode') : t('phoneRequired.submit'))}
              </button>
            </div>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={handleCodeSubmit} className="px-6 py-5 space-y-4">
            <p className="text-sm text-gray-600">
              {t('phoneRequired.otpDescription', { phone: phone.trim() })}
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('phoneRequired.codeLabel')}
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={handleCodeChange}
                autoFocus
                maxLength={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-center text-lg tracking-[0.4em] font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="······"
              />
            </div>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                className="text-gray-500 hover:text-gray-700 underline"
                onClick={handleBackToPhone}
                disabled={loading}
              >
                {t('phoneRequired.backToPhoneStep')}
              </button>
              <button
                type="button"
                className="text-primary-600 hover:text-primary-700 font-medium disabled:text-gray-400 disabled:cursor-not-allowed"
                onClick={handleResend}
                disabled={loading || countdown > 0}
              >
                {countdown > 0
                  ? t('phoneRequired.resendCountdown', { seconds: countdown })
                  : t('phoneRequired.resendButton')}
              </button>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex justify-end items-center gap-2 pt-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                disabled={loading}
              >
                {t('phoneRequired.later')}
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading || code.length !== 6}>
                {loading ? t('phoneRequired.verifying') : t('phoneRequired.verifyButton')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default PhoneRequiredModal;
