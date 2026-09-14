import { useState, useRef } from 'react';
import { useI18n } from '../../../i18n';

/**
 * FormRenderer: Component hiển thị biểu mẫu công khai và xử lý nộp bài.
 * Thiết kế decoupled để PR-4 dùng cho xem trước (previewMode) và PR-5 dùng cho bản nhúng.
 *
 * @param {object} props
 * @param {object} props.form - Định nghĩa biểu mẫu (title, description, fields, settings, theme)
 * @param {Function} props.onSubmit - Callback nộp bài: (payload) => Promise<void>
 * @param {boolean} [props.isSubmitting] - Trạng thái đang gửi từ bên ngoài
 * @param {string} [props.externalError] - Lỗi từ server (nếu có)
 * @param {boolean} [props.previewMode] - Chế độ xem trước trong trình soạn thảo
 */
export default function FormRenderer({
  form,
  onSubmit,
  isSubmitting = false,
  externalError = '',
  previewMode = false,
}) {
  const { t } = useI18n();

  const [answers, setAnswers] = useState({});
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [clientErrors, setClientErrors] = useState({});
  const [submittedSuccess, setSubmittedSuccess] = useState(false);

  // Chống bấm đúp bằng useRef để chặn ngay lập tức trong event loop
  const submittingRef = useRef(false);
  // Ref cho trường bẫy bot không điều khiển (uncontrolled input)
  const honeypotRef = useRef(null);

  const fields = Array.isArray(form?.fields) ? form.fields : [];
  const settings = form?.settings || {};
  const submitButtonText = settings.submitButtonText?.trim() || t('publicForm.defaultSubmit');
  const successMessage = settings.successMessage?.trim() || t('publicForm.defaultSuccess');

  const normalizePhoneClient = (raw) => {
    const s = String(raw || '').trim();
    if (!s) return '';
    const hasPlus = s.startsWith('+');
    const digits = s.replace(/\D/g, '');
    return hasPlus ? `+${digits}` : digits;
  };

  const handleFieldChange = (key, val) => {
    setAnswers((prev) => ({ ...prev, [key]: val }));
    if (clientErrors[key]) {
      setClientErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const handleCheckboxItemToggle = (key, optVal) => {
    const current = Array.isArray(answers[key]) ? answers[key] : [];
    const exists = current.includes(optVal);
    const updated = exists ? current.filter((v) => v !== optVal) : [...current, optVal];
    handleFieldChange(key, updated);
  };

  const validateClient = () => {
    const errors = {};

    for (const field of fields) {
      const { key, label, required, type } = field;
      const val = answers[key];

      // Kiểm tra bắt buộc
      const isEmpty =
        val === undefined ||
        val === null ||
        (typeof val === 'string' && val.trim() === '') ||
        (Array.isArray(val) && val.length === 0);

      if (required && isEmpty) {
        errors[key] = t('publicForm.validation.required', { label });
        continue;
      }

      if (!isEmpty) {
        if (type === 'short_text' && String(val).length > 500) {
          errors[key] = t('publicForm.validation.shortTextMax', { label });
        } else if (type === 'long_text' && String(val).length > 5000) {
          errors[key] = t('publicForm.validation.longTextMax', { label });
        } else if (type === 'email') {
          const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRe.test(String(val).trim())) {
            errors[key] = t('publicForm.validation.emailInvalid');
          }
        } else if (type === 'phone') {
          const normalizedPhone = normalizePhoneClient(val);
          if (!/^\+?[0-9]{8,20}$/.test(normalizedPhone)) {
            errors[key] = t('publicForm.validation.phoneInvalid');
          }
        }
      }
    }

    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (previewMode) return;

    // Chặn bấm đúp ngay lập tức bằng cờ ref
    if (submittingRef.current || isSubmitting) {
      return;
    }

    const errors = validateClient();
    if (Object.keys(errors).length > 0) {
      setClientErrors(errors);
      return;
    }

    submittingRef.current = true;

    try {
      const cleanAnswers = { ...answers };

      for (const field of fields) {
        if (field.type === 'phone' && cleanAnswers[field.key]) {
          cleanAnswers[field.key] = normalizePhoneClient(cleanAnswers[field.key]);
        }
      }

      // Bẫy bot: lấy giá trị thật từ input honeypot không điều khiển
      const honeypotVal = honeypotRef.current ? honeypotRef.current.value : '';

      const payload = {
        answers: cleanAnswers,
        _hp_website: honeypotVal,
      };

      // Chỉ gửi marketingConsent khi form bật settings.consentEnabled
      if (settings.consentEnabled === true) {
        payload.marketingConsent = Boolean(marketingConsent);
      }

      if (onSubmit) {
        await onSubmit(payload);
      }

      // Xử lý chuyển hướng phòng thủ lớp 2
      if (settings.redirectUrl && settings.redirectUrl.trim() !== '') {
        try {
          const parsed = new URL(settings.redirectUrl.trim());
          if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            window.location.href = settings.redirectUrl.trim();
            return;
          }
        } catch {
          // URL không hợp lệ -> không redirect, hiện thông báo thành công
        }
      }

      setSubmittedSuccess(true);
    } catch {
      // Lỗi do bên ngoài/caller quản lý qua externalError
    } finally {
      submittingRef.current = false;
    }
  };

  if (submittedSuccess) {
    return (
      <div className="w-full max-w-xl mx-auto p-6 bg-white rounded-2xl shadow-sm border border-gray-100 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-50 text-green-600 flex items-center justify-center text-3xl font-bold">
          ✓
        </div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          {t('publicForm.submitSuccess')}
        </h3>
        <p className="text-gray-600 whitespace-pre-line leading-relaxed">
          {successMessage}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl mx-auto p-4 sm:p-6 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-hidden box-border">
      {/* Tiêu đề & mô tả biểu mẫu */}
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2 break-words">
          {form?.title || t('forms.formTitle')}
        </h1>
        {form?.description && (
          <p className="text-gray-600 text-sm sm:text-base whitespace-pre-line break-words leading-relaxed">
            {form.description}
          </p>
        )}
      </div>

      {/* Lỗi tổng thể từ server */}
      {externalError && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm break-words">
          {externalError}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {/* Trường bẫy Bot (Honeypot) — ẩn hoàn toàn khỏi người dùng */}
        <div
          style={{ opacity: 0, position: 'absolute', top: 0, left: 0, height: 0, width: 0, zIndex: -1 }}
          aria-hidden="true"
        >
          <label htmlFor="_hp_website">Do not fill this</label>
          <input
            id="_hp_website"
            type="text"
            name="_hp_website"
            tabIndex={-1}
            autoComplete="off"
            ref={honeypotRef}
            defaultValue=""
          />
        </div>

        {/* Danh sách các trường */}
        {fields.map((field) => {
          const { key, label, type, required, options = [] } = field;
          const val = answers[key] ?? '';
          const fieldError = clientErrors[key];
          const fieldControlId = ['radio', 'checkbox'].includes(type) ? undefined : `field_${key}`;

          return (
            <div key={key} className="space-y-1.5">
              <label
                htmlFor={fieldControlId}
                className="block text-sm font-medium text-gray-800 break-words"
              >
                {label}
                {required && <span className="text-red-500 ml-1">*</span>}
              </label>

              {/* short_text */}
              {type === 'short_text' && (
                <input
                  id={fieldControlId}
                  type="text"
                  maxLength={500}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 ${
                    fieldError
                      ? 'border-red-300 focus:ring-red-200'
                      : 'border-gray-300 focus:border-primary-500 focus:ring-primary-100'
                  }`}
                  value={val}
                  onChange={(e) => handleFieldChange(key, e.target.value)}
                  disabled={isSubmitting || previewMode}
                />
              )}

              {/* long_text */}
              {type === 'long_text' && (
                <textarea
                  id={fieldControlId}
                  rows={4}
                  maxLength={5000}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 resize-y ${
                    fieldError
                      ? 'border-red-300 focus:ring-red-200'
                      : 'border-gray-300 focus:border-primary-500 focus:ring-primary-100'
                  }`}
                  value={val}
                  onChange={(e) => handleFieldChange(key, e.target.value)}
                  disabled={isSubmitting || previewMode}
                />
              )}

              {/* email */}
              {type === 'email' && (
                <input
                  id={fieldControlId}
                  type="email"
                  maxLength={255}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 ${
                    fieldError
                      ? 'border-red-300 focus:ring-red-200'
                      : 'border-gray-300 focus:border-primary-500 focus:ring-primary-100'
                  }`}
                  value={val}
                  onChange={(e) => handleFieldChange(key, e.target.value)}
                  disabled={isSubmitting || previewMode}
                />
              )}

              {/* phone */}
              {type === 'phone' && (
                <input
                  id={fieldControlId}
                  type="tel"
                  maxLength={50}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 ${
                    fieldError
                      ? 'border-red-300 focus:ring-red-200'
                      : 'border-gray-300 focus:border-primary-500 focus:ring-primary-100'
                  }`}
                  value={val}
                  onChange={(e) => handleFieldChange(key, e.target.value)}
                  disabled={isSubmitting || previewMode}
                />
              )}

              {/* number */}
              {type === 'number' && (
                <input
                  id={fieldControlId}
                  type="number"
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 ${
                    fieldError
                      ? 'border-red-300 focus:ring-red-200'
                      : 'border-gray-300 focus:border-primary-500 focus:ring-primary-100'
                  }`}
                  value={val}
                  onChange={(e) => handleFieldChange(key, e.target.value)}
                  disabled={isSubmitting || previewMode}
                />
              )}

              {/* date */}
              {type === 'date' && (
                <input
                  id={fieldControlId}
                  type="date"
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 ${
                    fieldError
                      ? 'border-red-300 focus:ring-red-200'
                      : 'border-gray-300 focus:border-primary-500 focus:ring-primary-100'
                  }`}
                  value={val}
                  onChange={(e) => handleFieldChange(key, e.target.value)}
                  disabled={isSubmitting || previewMode}
                />
              )}

              {/* select */}
              {type === 'select' && (
                <select
                  id={fieldControlId}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 bg-white ${
                    fieldError
                      ? 'border-red-300 focus:ring-red-200'
                      : 'border-gray-300 focus:border-primary-500 focus:ring-primary-100'
                  }`}
                  value={val}
                  onChange={(e) => handleFieldChange(key, e.target.value)}
                  disabled={isSubmitting || previewMode}
                >
                  <option value="">{t('publicForm.selectPlaceholder')}</option>
                  {options.map((opt, i) => {
                    const optVal = typeof opt === 'object' ? opt.value : opt;
                    const optLbl = typeof opt === 'object' ? opt.label : opt;
                    return (
                      <option key={optVal || i} value={optVal}>
                        {optLbl}
                      </option>
                    );
                  })}
                </select>
              )}

              {/* radio */}
              {type === 'radio' && (
                <div className="space-y-2 pt-1">
                  {options.map((opt, i) => {
                    const optVal = typeof opt === 'object' ? opt.value : opt;
                    const optLbl = typeof opt === 'object' ? opt.label : opt;
                    const id = `radio-${key}-${i}`;
                    return (
                      <label
                        key={optVal || i}
                        htmlFor={id}
                        className="flex items-center gap-2.5 cursor-pointer text-sm text-gray-700"
                      >
                        <input
                          id={id}
                          type="radio"
                          name={key}
                          value={optVal}
                          checked={val === optVal}
                          onChange={(e) => handleFieldChange(key, e.target.value)}
                          disabled={isSubmitting || previewMode}
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300"
                        />
                        <span>{optLbl}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* checkbox */}
              {type === 'checkbox' && (
                <div className="space-y-2 pt-1">
                  {options.map((opt, i) => {
                    const optVal = typeof opt === 'object' ? opt.value : opt;
                    const optLbl = typeof opt === 'object' ? opt.label : opt;
                    const isChecked = Array.isArray(val) && val.includes(optVal);
                    const id = `chk-${key}-${i}`;
                    return (
                      <label
                        key={optVal || i}
                        htmlFor={id}
                        className="flex items-center gap-2.5 cursor-pointer text-sm text-gray-700"
                      >
                        <input
                          id={id}
                          type="checkbox"
                          value={optVal}
                          checked={isChecked}
                          onChange={() => handleCheckboxItemToggle(key, optVal)}
                          disabled={isSubmitting || previewMode}
                          className="h-4 w-4 rounded text-primary-600 focus:ring-primary-500 border-gray-300"
                        />
                        <span>{optLbl}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {fieldError && (
                <p className="text-xs text-red-600 mt-1">{fieldError}</p>
              )}
            </div>
          );
        })}

        {/* Ô đồng ý tiếp thị: chỉ hiện khi consentEnabled = true */}
        {settings.consentEnabled === true && (
          <div className="pt-2">
            <label className="flex items-start gap-3 cursor-pointer text-sm text-gray-700 select-none">
              <input
                type="checkbox"
                checked={marketingConsent}
                onChange={(e) => setMarketingConsent(e.target.checked)}
                disabled={isSubmitting || previewMode}
                className="mt-0.5 h-4 w-4 rounded text-primary-600 focus:ring-primary-500 border-gray-300"
              />
              <span className="leading-snug">
                {settings.consentText || t('publicForm.consentLabel')}
              </span>
            </label>
          </div>
        )}

        {/* Nút gửi */}
        <div className="pt-4">
          <button
            type="submit"
            disabled={isSubmitting || previewMode}
            className="w-full py-3 px-6 rounded-xl font-medium text-white bg-primary-600 hover:bg-primary-700 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {isSubmitting ? t('publicForm.submitting') : submitButtonText}
          </button>
        </div>
      </form>
    </div>
  );
}
