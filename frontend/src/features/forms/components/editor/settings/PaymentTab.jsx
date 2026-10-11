import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import QRCode from 'qrcode';
import { HiOutlineQrcode } from 'react-icons/hi';
import { buildVietQrString, decodeQrFromImageFile, parseAndValidateMoMoQr } from '../../../../../utils/vietqrParser';
import { useI18n } from '../../../../../i18n';
import BankSearchSelect from '../../BankSearchSelect';
import {
  PAYMENT_PURPOSES,
  resolvePaymentPurpose,
  editorPaymentPurposeKeys,
} from '../../../utils/paymentPurpose.util';
import {
  MIN_PAYMENT_AMOUNT,
  MAX_PAYMENT_AMOUNT,
  MIN_HOLD_MINUTES,
  MAX_HOLD_MINUTES,
} from '../formEditorConstants';

/**
 * Tab "Thanh toán" của modal Cài đặt (chỉ CHỦ tài khoản sửa được — nhân viên chỉ đọc). Chuyển NGUYÊN VĂN khối Thanh toán
 * giữ chỗ của trình soạn cũ, kèm xem trước QR MoMo và đọc ảnh QR (state `payment` vẫn nằm ở FormEditorPage).
 */
export default function PaymentTab({
  payment,
  setPayment,
  errors,
  isEmployee,
  hasSavedPreset,
  onApplySavedPreset,
  selectedProductAmount,
}) {
  const { t } = useI18n();
  const handleApplySavedPreset = onApplySavedPreset;
  const [isDecodingMomoQr, setIsDecodingMomoQr] = useState(false);
  const momoQrFileInputRef = useRef(null);
  const [momoPreviewQrDataUrl, setMomoPreviewQrDataUrl] = useState(null);

  useEffect(() => {
    let active = true;
    const hasMomo = payment.enabled && (payment.methods || []).includes('momo') && payment.momoQrMode !== 'none';
    if (hasMomo) {
      const acc = payment.momoQrMode === 'phone'
        ? (payment.momoPhone || '').trim()
        : (payment.momoQrAccount || '').replace(/\s+/g, '').toUpperCase();
      const amt = Number(payment.amount);
      const isAccValid = payment.momoQrMode === 'phone'
        ? /^0[35789]\d{8}$/.test(acc)
        : /^[A-Z0-9]{6,19}$/.test(acc);
      const isAmtValid = Number.isInteger(amt) && amt >= MIN_PAYMENT_AMOUNT && amt <= MAX_PAYMENT_AMOUNT;
      const isNameValid = Boolean((payment.momoName || '').trim());

      if (isAccValid && isAmtValid && isNameValid) {
        try {
          const qrStr = buildVietQrString({
            bin: '971025',
            accountNumber: acc,
            amount: amt,
            memo: 'KIEMTRA',
          });
          QRCode.toDataURL(qrStr, { width: 160, margin: 2 })
            .then((url) => {
              if (active) setMomoPreviewQrDataUrl(url);
            })
            .catch(() => {
              if (active) setMomoPreviewQrDataUrl(null);
            });
          return () => {
            active = false;
          };
        } catch {
          setMomoPreviewQrDataUrl(null);
        }
      } else {
        setMomoPreviewQrDataUrl(null);
      }
    } else {
      setMomoPreviewQrDataUrl(null);
    }
    return () => {
      active = false;
    };
  }, [
    payment.enabled,
    payment.methods,
    payment.momoQrMode,
    payment.momoQrAccount,
    payment.momoPhone,
    payment.amount,
    payment.momoName,
  ]);

  const handleUploadMomoQr = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsDecodingMomoQr(true);
    try {
      const decoded = await decodeQrFromImageFile(file);
      if (!decoded.success) {
        toast.error(t('forms.editorPage.payment.momoQrNotFound'));
        return;
      }
      const qrRes = parseAndValidateMoMoQr(decoded.raw);
      if (!qrRes.valid) {
        if (qrRes.error === 'INVALID_CHECKSUM') {
          toast.error(t('forms.editorPage.payment.momoQrChecksumError'));
        } else if (qrRes.error === 'INVALID_GUID') {
          toast.error(t('forms.editorPage.payment.momoQrGuidError'));
        } else {
          toast.error(t('forms.editorPage.payment.momoQrInvalid'));
        }
        return;
      }
      if (qrRes.momoQrBin !== '971025') {
        toast.error(t('forms.editorPage.payment.momoQrNotMomoError'));
        return;
      }
      setPayment((prev) => ({
        ...prev,
        momoQrMode: 'account',
        momoQrBin: '971025',
        momoQrAccount: qrRes.momoQrAccount,
        momoQrRefLabel: qrRes.momoQrRefLabel || '',
      }));
      toast.success(t('forms.editorPage.payment.momoQrAutoFilled'));
    } catch (err) {
      toast.error(err.message || t('forms.editorPage.payment.momoQrError'));
    } finally {
      setIsDecodingMomoQr(false);
      if (momoQrFileInputRef.current) {
        momoQrFileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-100 dark:border-dk-border">
        <p className="text-xs text-slate-500 dark:text-dk-text2 mt-0.5">
          {t('forms.editorPage.payment.enableHelp')}
        </p>
        <label className="flex items-center gap-2 cursor-pointer select-none shrink-0 pt-1">
          <span className="text-xs font-semibold text-slate-700 dark:text-dk-text">
            {t('forms.editorPage.payment.enableLabel')}
          </span>
          <input
            type="checkbox"
            checked={payment.enabled}
            disabled={isEmployee}
            onChange={(e) => {
              const enabled = e.target.checked;
              // Bật thu tiền khi đã chọn sản phẩm có giá số và ô số tiền trống → tự điền.
              setPayment((prev) => ({
                ...prev,
                enabled,
                amount: enabled && !prev.amount && selectedProductAmount !== null ? String(selectedProductAmount) : prev.amount,
              }));
            }}
            className="h-4 w-4 rounded text-emerald-600 dark:text-emerald-400 focus:ring-emerald-500 border-slate-300 dark:border-dk-border-strong dark:bg-dk-bg disabled:opacity-50"
          />
        </label>
      </div>

      {isEmployee && (
        <p className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300 text-xs">
          {t('forms.editorPage.payment.employeeReadOnlyNotice')}
        </p>
      )}

      {payment.enabled && (
        <div className="space-y-5">
          {!isEmployee && (
            <div className="space-y-3">
              <p className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 text-blue-700 dark:text-blue-300 text-xs">
                {t('forms.editorPage.payment.ownerWarning')}
              </p>
              {hasSavedPreset && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-dk-raised/50 border border-slate-200 dark:border-dk-border text-xs">
                  <span className="text-slate-600 dark:text-dk-text">
                    {t('forms.editorPage.payment.savedPresetNotice')}
                  </span>
                  <button
                    type="button"
                    onClick={handleApplySavedPreset}
                    className="font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 underline"
                  >
                    {t('forms.editorPage.payment.applySavedPreset')}
                  </button>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-2">
              {t('forms.editorPage.payment.methodLabel')}
            </label>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-dk-text cursor-pointer">
                <input
                  type="checkbox"
                  name="paymentMethodBank"
                  disabled={isEmployee}
                  checked={(payment.methods || []).includes('bank')}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setPayment((prev) => {
                      const currentMethods = prev.methods || (prev.method ? [prev.method] : ['bank']);
                      const nextMethods = checked
                        ? Array.from(new Set([...currentMethods, 'bank']))
                        : currentMethods.filter((m) => m !== 'bank');
                      return {
                        ...prev,
                        methods: nextMethods,
                        method: nextMethods[0] || 'bank',
                      };
                    });
                  }}
                  className="rounded text-primary-600 dark:text-primary-400 focus:ring-primary-500 border-slate-300 dark:border-dk-border-strong dark:bg-dk-bg"
                />
                {t('forms.editorPage.payment.methodBank')}
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-dk-text cursor-pointer">
                <input
                  type="checkbox"
                  name="paymentMethodMomo"
                  disabled={isEmployee}
                  checked={(payment.methods || []).includes('momo')}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setPayment((prev) => {
                      const currentMethods = prev.methods || (prev.method ? [prev.method] : ['bank']);
                      const nextMethods = checked
                        ? Array.from(new Set([...currentMethods, 'momo']))
                        : currentMethods.filter((m) => m !== 'momo');
                      return {
                        ...prev,
                        methods: nextMethods,
                        method: nextMethods[0] || 'momo',
                      };
                    });
                  }}
                  className="rounded text-primary-600 dark:text-primary-400 focus:ring-primary-500 border-slate-300 dark:border-dk-border-strong dark:bg-dk-bg"
                />
                {t('forms.editorPage.payment.methodMomo')}
              </label>
            </div>
            {errors.paymentMethods && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.paymentMethods}</p>
            )}
          </div>

          <div>
            <label htmlFor="form-payment-purpose" className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
              {t('forms.editorPage.payment.purposeLabel')}
            </label>
            <select
              id="form-payment-purpose"
              disabled={isEmployee}
              value={resolvePaymentPurpose(payment.purpose)}
              onChange={(e) => setPayment((prev) => ({ ...prev, purpose: e.target.value }))}
              className="w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border border-gray-300 dark:border-dk-border text-sm text-slate-900 dark:text-dk-text focus:outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-100 dark:focus:ring-primary-950/40 disabled:bg-gray-50 dark:disabled:bg-dk-raised disabled:text-gray-500 dark:disabled:text-dk-muted"
            >
              {PAYMENT_PURPOSES.map((p) => (
                <option key={p} value={p}>
                  {t(editorPaymentPurposeKeys(p).option)}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 dark:text-dk-text2 mt-1">{t('forms.editorPage.payment.purposeHelp')}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
                {t('forms.editorPage.payment.amountLabel')}
              </label>
              <input
                type="text"
                inputMode="numeric"
                disabled={isEmployee}
                value={payment.amount ? Number(payment.amount).toLocaleString('vi-VN') : ''}
                onChange={(e) =>
                  setPayment((prev) => ({ ...prev, amount: e.target.value.replace(/\D/g, '') }))
                }
                placeholder={t('forms.editorPage.payment.amountPlaceholder')}
                className={`w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border text-sm text-slate-900 dark:text-dk-text placeholder:text-slate-400 dark:placeholder:text-dk-muted focus:outline-none focus:ring-2 disabled:bg-gray-50 dark:disabled:bg-dk-raised disabled:text-gray-500 dark:disabled:text-dk-muted ${
                  errors.paymentAmount
                    ? 'border-red-300 dark:border-red-800 focus:ring-red-200 dark:focus:ring-red-950/40'
                    : 'border-gray-300 dark:border-dk-border focus:border-primary-500 focus:ring-primary-100 dark:focus:ring-primary-950/40'
                }`}
              />
              {errors.paymentAmount && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.paymentAmount}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
                {t(editorPaymentPurposeKeys(payment.purpose).holdMinutesLabel)}
              </label>
              <input
                type="number"
                min={MIN_HOLD_MINUTES}
                max={MAX_HOLD_MINUTES}
                disabled={isEmployee}
                value={payment.holdMinutes}
                onChange={(e) => setPayment((prev) => ({ ...prev, holdMinutes: e.target.value }))}
                className={`w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border text-sm text-slate-900 dark:text-dk-text focus:outline-none focus:ring-2 disabled:bg-gray-50 dark:disabled:bg-dk-raised disabled:text-gray-500 dark:disabled:text-dk-muted ${
                  errors.paymentHoldMinutes
                    ? 'border-red-300 dark:border-red-800 focus:ring-red-200 dark:focus:ring-red-950/40'
                    : 'border-gray-300 dark:border-dk-border focus:border-primary-500 focus:ring-primary-100 dark:focus:ring-primary-950/40'
                }`}
              />
              {errors.paymentHoldMinutes && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.paymentHoldMinutes}</p>
              )}
            </div>
          </div>

          {(payment.methods || []).includes('bank') && (
            <div className="p-4 bg-gray-50 dark:bg-dk-raised/40 rounded-xl border border-gray-200 dark:border-dk-border space-y-4">
              <h4 className="text-xs font-semibold text-gray-700 dark:text-dk-text uppercase tracking-wider">
                {t('forms.editorPage.payment.methodBank')}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
                    {t('forms.editorPage.payment.bankLabel')}
                  </label>
                  <BankSearchSelect
                    disabled={isEmployee}
                    value={payment.bankBin}
                    onChange={(bin) => setPayment((prev) => ({ ...prev, bankBin: bin }))}
                    hasError={Boolean(errors.paymentBank)}
                    placeholder={t('forms.editorPage.payment.bankPlaceholder')}
                  />
                  {errors.paymentBank && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.paymentBank}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
                    {t('forms.editorPage.payment.accountNumberLabel')}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    disabled={isEmployee}
                    value={payment.accountNumber}
                    onChange={(e) =>
                      setPayment((prev) => ({ ...prev, accountNumber: e.target.value.replace(/\D/g, '') }))
                    }
                    className={`w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border text-sm text-slate-900 dark:text-dk-text focus:outline-none focus:ring-2 disabled:bg-gray-50 dark:disabled:bg-dk-raised disabled:text-gray-500 dark:disabled:text-dk-muted ${
                      errors.paymentAccountNumber
                        ? 'border-red-300 dark:border-red-800 focus:ring-red-200 dark:focus:ring-red-950/40'
                        : 'border-gray-300 dark:border-dk-border focus:border-primary-500 focus:ring-primary-100 dark:focus:ring-primary-950/40'
                    }`}
                  />
                  {errors.paymentAccountNumber && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.paymentAccountNumber}</p>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
                    {t('forms.editorPage.payment.accountNameLabel')}
                  </label>
                  <input
                    type="text"
                    disabled={isEmployee}
                    value={payment.accountName}
                    onChange={(e) => setPayment((prev) => ({ ...prev, accountName: e.target.value }))}
                    placeholder={t('forms.editorPage.payment.accountNamePlaceholder')}
                    className={`w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border text-sm text-slate-900 dark:text-dk-text placeholder:text-slate-400 dark:placeholder:text-dk-muted focus:outline-none focus:ring-2 disabled:bg-gray-50 dark:disabled:bg-dk-raised disabled:text-gray-500 dark:disabled:text-dk-muted ${
                      errors.paymentAccountName
                        ? 'border-red-300 dark:border-red-800 focus:ring-red-200 dark:focus:ring-red-950/40'
                        : 'border-gray-300 dark:border-dk-border focus:border-primary-500 focus:ring-primary-100 dark:focus:ring-primary-950/40'
                    }`}
                  />
                  <p className="text-[11px] text-gray-400 dark:text-dk-muted mt-1">
                    {t('forms.editorPage.payment.accountNameHint')}
                  </p>
                  {errors.paymentAccountName && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.paymentAccountName}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {(payment.methods || []).includes('momo') && (
            <div className="p-4 bg-gray-50 dark:bg-dk-raised/40 rounded-xl border border-gray-200 dark:border-dk-border space-y-4">
              <h4 className="text-xs font-semibold text-gray-700 dark:text-dk-text uppercase tracking-wider">
                {t('forms.editorPage.payment.methodMomo')}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
                    {t('forms.editorPage.payment.momoPhoneLabel')}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    disabled={isEmployee}
                    value={payment.momoPhone}
                    onChange={(e) =>
                      setPayment((prev) => ({ ...prev, momoPhone: e.target.value.replace(/\D/g, '') }))
                    }
                    placeholder={t('forms.editorPage.payment.phonePlaceholder')}
                    className={`w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border text-sm text-slate-900 dark:text-dk-text placeholder:text-slate-400 dark:placeholder:text-dk-muted focus:outline-none focus:ring-2 disabled:bg-gray-50 dark:disabled:bg-dk-raised disabled:text-gray-500 dark:disabled:text-dk-muted ${
                      errors.paymentMomoPhone
                        ? 'border-red-300 dark:border-red-800 focus:ring-red-200 dark:focus:ring-red-950/40'
                        : 'border-gray-300 dark:border-dk-border focus:border-primary-500 focus:ring-primary-100 dark:focus:ring-primary-950/40'
                    }`}
                  />
                  {errors.paymentMomoPhone && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.paymentMomoPhone}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
                    {t('forms.editorPage.payment.momoNameLabel')}
                  </label>
                  <input
                    type="text"
                    disabled={isEmployee}
                    value={payment.momoName}
                    onChange={(e) => setPayment((prev) => ({ ...prev, momoName: e.target.value }))}
                    placeholder={t('forms.editorPage.payment.accountNamePlaceholder')}
                    className={`w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border text-sm text-slate-900 dark:text-dk-text placeholder:text-slate-400 dark:placeholder:text-dk-muted focus:outline-none focus:ring-2 disabled:bg-gray-50 dark:disabled:bg-dk-raised disabled:text-gray-500 dark:disabled:text-dk-muted ${
                      errors.paymentMomoName
                        ? 'border-red-300 dark:border-red-800 focus:ring-red-200 dark:focus:ring-red-950/40'
                        : 'border-gray-300 dark:border-dk-border focus:border-primary-500 focus:ring-primary-100 dark:focus:ring-primary-950/40'
                    }`}
                  />
                  <p className="text-[11px] text-gray-400 dark:text-dk-muted mt-1">
                    {t('forms.editorPage.payment.accountNameHint')}
                  </p>
                  {errors.paymentMomoName && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.paymentMomoName}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-700 dark:text-dk-text">
                  {t('forms.editorPage.payment.momoQrModeLabel')}
                </label>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-dk-text cursor-pointer">
                    <input
                      type="radio"
                      name="momoQrMode"
                      value="phone"
                      disabled={isEmployee}
                      checked={payment.momoQrMode === 'phone'}
                      onChange={() => setPayment((prev) => ({ ...prev, momoQrMode: 'phone' }))}
                      className="text-primary-600 dark:text-primary-400 focus:ring-primary-500 border-slate-300 dark:border-dk-border-strong dark:bg-dk-bg"
                    />
                    <span>{t('forms.editorPage.payment.momoQrModePhone')}</span>
                  </label>
                  {payment.momoQrMode === 'phone' && (
                    <p className="ml-6 text-[11px] text-gray-400 dark:text-dk-muted">
                      {t('forms.editorPage.payment.momoQrPhoneHint')}
                    </p>
                  )}

                  <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-dk-text cursor-pointer">
                    <input
                      type="radio"
                      name="momoQrMode"
                      value="account"
                      disabled={isEmployee}
                      checked={payment.momoQrMode === 'account'}
                      onChange={() => setPayment((prev) => ({ ...prev, momoQrMode: 'account' }))}
                      className="text-primary-600 dark:text-primary-400 focus:ring-primary-500 border-slate-300 dark:border-dk-border-strong dark:bg-dk-bg"
                    />
                    <span>{t('forms.editorPage.payment.momoQrModeAccount')}</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-dk-text cursor-pointer">
                    <input
                      type="radio"
                      name="momoQrMode"
                      value="none"
                      disabled={isEmployee}
                      checked={payment.momoQrMode === 'none'}
                      onChange={() => setPayment((prev) => ({ ...prev, momoQrMode: 'none' }))}
                      className="text-primary-600 dark:text-primary-400 focus:ring-primary-500 border-slate-300 dark:border-dk-border-strong dark:bg-dk-bg"
                    />
                    <span>{t('forms.editorPage.payment.momoQrModeNone')}</span>
                  </label>
                </div>
              </div>

              {payment.momoQrMode === 'account' && (
                <div className="space-y-3 p-3 bg-white dark:bg-dk-raised/60 rounded-xl border border-gray-200 dark:border-dk-border">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
                      {t('forms.editorPage.payment.momoQrAccountLabel')}
                    </label>
                    <input
                      type="text"
                      disabled={isEmployee}
                      value={payment.momoQrAccount || ''}
                      onChange={(e) => {
                        const cleanVal = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                        setPayment((prev) => ({ ...prev, momoQrAccount: cleanVal }));
                      }}
                      placeholder={t('forms.editorPage.payment.momoQrAccountPlaceholder')}
                      className={`w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border text-sm font-mono text-slate-900 dark:text-dk-text placeholder:text-slate-400 dark:placeholder:text-dk-muted focus:outline-none focus:ring-2 disabled:bg-gray-50 dark:disabled:bg-dk-raised disabled:text-gray-500 dark:disabled:text-dk-muted ${
                        errors.paymentMomoQrAccount
                          ? 'border-red-300 dark:border-red-800 focus:ring-red-200 dark:focus:ring-red-950/40'
                          : 'border-gray-300 dark:border-dk-border focus:border-primary-500 focus:ring-primary-100 dark:focus:ring-primary-950/40'
                      }`}
                    />
                    <p className="text-[11px] text-gray-500 dark:text-dk-text2 mt-1">
                      {t('forms.editorPage.payment.momoQrAccountHint')}
                    </p>
                    {errors.paymentMomoQrAccount && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.paymentMomoQrAccount}</p>
                    )}
                  </div>

                  <div>
                    <input
                      ref={momoQrFileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={isEmployee || isDecodingMomoQr}
                      onChange={handleUploadMomoQr}
                    />
                    <button
                      type="button"
                      disabled={isEmployee || isDecodingMomoQr}
                      onClick={() => momoQrFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-dk-border bg-white dark:bg-dk-raised hover:bg-gray-50 dark:hover:bg-dk-strong text-xs font-medium text-gray-700 dark:text-dk-text shadow-sm transition-colors disabled:opacity-50"
                    >
                      <HiOutlineQrcode className="w-4 h-4 text-gray-500 dark:text-dk-text2" />
                      {isDecodingMomoQr
                        ? t('forms.editorPage.payment.momoQrDecoding')
                        : t('forms.editorPage.payment.momoQrAutoFillBtn')}
                    </button>
                  </div>
                </div>
              )}

              {momoPreviewQrDataUrl && (
                <div className="p-3 bg-white dark:bg-dk-raised/60 rounded-xl border border-gray-200 dark:border-dk-border text-center space-y-2">
                  <p className="text-xs font-semibold text-gray-700 dark:text-dk-text">
                    {t('forms.editorPage.payment.momoPreviewQrTitle')}
                  </p>
                  <img
                    src={momoPreviewQrDataUrl}
                    alt="QR MoMo Preview"
                    data-testid="momo-preview-qr"
                    className="w-36 h-36 mx-auto rounded-lg border border-gray-100 dark:border-slate-700 bg-white dark:bg-white p-1" // dark-ngoai-le: khung QR code phải nền trắng cố ý
                  />
                  <p className="text-[11px] text-gray-600 dark:text-dk-text2 leading-relaxed">
                    {t('forms.editorPage.payment.momoPreviewQrInstruction', {
                      name: (payment.momoName || '').trim().toUpperCase(),
                    })}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
