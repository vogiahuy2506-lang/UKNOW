import { useState } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlinePhone } from 'react-icons/hi';
import { updateMyPhone } from '../services/authApi.service';
import { useI18n } from '../../../i18n';
import { isPlausiblePhone } from '../../../utils/phoneValidation';

/**
 * Modal nhắc bổ sung SĐT — mở khi user.phone rỗng.
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
 * @param {{ isOpen: boolean, onClose: () => void, onChanged: (phone: string) => void }} props
 */
const PhoneRequiredModal = ({ isOpen, onClose, onChanged }) => {
  const { t } = useI18n();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleChange = (e) => {
    setPhone(e.target.value);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!isPlausiblePhone(phone)) {
      setError(t('phoneRequired.validationInvalid'));
      return;
    }

    setLoading(true);
    try {
      const res = await updateMyPhone({ phone: phone.trim() });
      if (res.success) {
        onChanged?.(res.data?.phone ?? phone.trim());
      } else {
        setError(res.message || t('phoneRequired.failed'));
      }
    } catch (err) {
      if (err?.response?.status === 404) {
        setError(t('phoneRequired.versionMismatchError'));
      } else {
        // 409 PHONE_TAKEN: user phải đổi số khác, không phải thử lại — message từ
        // backend đã nói rõ điều đó, hiển thị nguyên văn thay vì viết lại.
        setError(err?.response?.data?.message || t('phoneRequired.errorOccurred'));
      }
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="modal-overlay" onClick={loading ? undefined : onClose}>
      <div
        className="modal-content modal-content-animate w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100">
          <HiOutlinePhone className="w-5 h-5 text-primary-600" />
          <h2 className="text-base font-semibold text-gray-900">{t('phoneRequired.title')}</h2>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-600">{t('phoneRequired.description')}</p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('phoneRequired.phoneLabel')}
            </label>
            <input
              type="tel"
              value={phone}
              onChange={handleChange}
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
              {loading ? t('phoneRequired.saving') : t('phoneRequired.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

export default PhoneRequiredModal;
