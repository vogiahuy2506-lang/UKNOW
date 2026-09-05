import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import affiliateService from '../../services/affiliate.service';

const MIN_AMOUNT = 1_000_000;

function formatVnd(num) {
  return `${Number(num || 0).toLocaleString('vi-VN')} đ`;
}

export default function WithdrawalModal({ isOpen, onClose, currentBalance, onSuccess }) {
  const { t } = useI18n();

  const [amount, setAmount] = useState(currentBalance || MIN_AMOUNT);
  const [partnerType, setPartnerType] = useState('personal');
  const [fullName, setFullName] = useState('');
  const [idCardNumber, setIdCardNumber] = useState('');
  const [idCardIssuedDate, setIdCardIssuedDate] = useState('');
  const [idCardIssuedPlace, setIdCardIssuedPlace] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState('');

  // Khi modal mở, điền sẵn số dư và gọi prefill
  useEffect(() => {
    if (!isOpen) return;

    setAmount(currentBalance || MIN_AMOUNT);
    setValidationError('');

    let isMounted = true;

    affiliateService
      .getPrefill()
      .then((res) => {
        if (!isMounted || !res?.data) return;
        const p = res.data;
        if (p.fullName) setFullName(p.fullName);
        if (p.idNumber) setIdCardNumber(p.idNumber);
        if (p.taxCode) setTaxCode(p.taxCode);
        if (p.bankName) setBankName(p.bankName);
        if (p.bankAccountNumber) setBankAccountNumber(p.bankAccountNumber);
        if (p.bankAccountName) setBankAccountName(p.bankAccountName);
        if (p.idCardIssuedDate) {
          setIdCardIssuedDate(p.idCardIssuedDate.slice(0, 10));
        }
        if (p.idCardIssuedPlace) setIdCardIssuedPlace(p.idCardIssuedPlace);
      })
      .catch((err) => {
        console.error('Failed to load withdrawal prefill:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, currentBalance]);

  // Kiểm tra tính hợp lệ của số tiền ngay tại chỗ
  const numericAmount = Math.round(Number(amount) || 0);
  const taxAmount = Math.round(numericAmount * 0.1);
  const netAmount = Math.max(0, numericAmount - taxAmount);

  useEffect(() => {
    if (numericAmount < MIN_AMOUNT) {
      setValidationError(t('affiliate.errMinAmount'));
    } else if (numericAmount > currentBalance) {
      setValidationError(
        t('affiliate.errMaxAmount', { balance: formatVnd(currentBalance) })
      );
    } else {
      setValidationError('');
    }
  }, [numericAmount, currentBalance, t]);

  if (!isOpen) return null;

  const handleWithdrawAll = () => {
    setAmount(currentBalance);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (numericAmount < MIN_AMOUNT) {
      toast.error(t('affiliate.errMinAmount'));
      return;
    }

    if (numericAmount > currentBalance) {
      toast.error(
        t('affiliate.errMaxAmount', { balance: formatVnd(currentBalance) })
      );
      return;
    }

    if (
      !fullName.trim() ||
      !idCardNumber.trim() ||
      !idCardIssuedDate.trim() ||
      !idCardIssuedPlace.trim() ||
      !bankName.trim() ||
      !bankAccountNumber.trim() ||
      !bankAccountName.trim()
    ) {
      toast.error(t('affiliate.errRequiredFields'));
      return;
    }

    const cleanIdCard = idCardNumber.trim();
    if (!/^\d{9}$|^\d{12}$/.test(cleanIdCard)) {
      toast.error(t('affiliate.errIdCardInvalid'));
      return;
    }

    try {
      setSubmitting(true);
      await affiliateService.requestWithdrawal({
        amount: numericAmount,
        partner_type: partnerType,
        full_name: fullName.trim(),
        id_card_number: cleanIdCard,
        id_card_issued_date: idCardIssuedDate,
        id_card_issued_place: idCardIssuedPlace.trim(),
        tax_code: taxCode.trim() || undefined,
        bank_name: bankName.trim(),
        bank_account_number: bankAccountNumber.trim(),
        bank_account_name: bankAccountName.trim().toUpperCase(),
      });

      toast.success(t('affiliate.requestSuccess'));
      onSuccess?.();
      onClose();
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Có lỗi xảy ra khi tạo yêu cầu rút';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6">
      <div className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gradient-to-r from-orange-50 to-amber-50 dark:from-gray-800/60 dark:to-gray-800/40">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              {t('affiliate.modalWithdrawalTitle')}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {t('affiliate.walletBalance')}:{' '}
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {formatVnd(currentBalance)}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 text-sm flex-1">
          {/* Nhập số tiền rút */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-gray-800 dark:text-gray-200">
                {t('affiliate.withdrawalAmountLabel')} <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={handleWithdrawAll}
                className="text-xs text-orange-600 dark:text-orange-400 hover:underline font-medium"
              >
                {t('affiliate.withdrawalAll')} ({formatVnd(currentBalance)})
              </button>
            </div>
            <div className="relative">
              <input
                type="number"
                step="10000"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={t('affiliate.withdrawalAmountPlaceholder')}
                className={`w-full px-4 py-2.5 rounded-xl border font-semibold text-base transition-colors ${
                  validationError
                    ? 'border-red-400 dark:border-red-600 focus:ring-red-400 bg-red-50/30'
                    : 'border-gray-200 dark:border-gray-700 focus:ring-orange-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white'
                }`}
              />
              <span className="absolute right-3.5 top-3 text-gray-400 font-medium">VNĐ</span>
            </div>
            {validationError && (
              <p className="text-xs text-red-500 dark:text-red-400 font-medium flex items-center gap-1">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {validationError}
              </p>
            )}
          </div>

          {/* 🔴 BẢNG BA SỐ: Gộp / Thuế 10% / Thực nhận */}
          <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
              {t('affiliate.amountBreakdownTitle')}
            </h4>
            <div className="flex justify-between text-gray-600 dark:text-gray-300">
              <span>{t('affiliate.grossAmount')}</span>
              <span className="font-semibold text-gray-900 dark:text-white">
                {formatVnd(numericAmount)}
              </span>
            </div>
            <div className="flex justify-between text-gray-600 dark:text-gray-300">
              <span className="flex items-center gap-1">
                {t('affiliate.taxDeduction')}
                <span className="text-xs text-gray-400">(TNCN)</span>
              </span>
              <span className="font-semibold text-red-600 dark:text-red-400">
                - {formatVnd(taxAmount)}
              </span>
            </div>
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center text-emerald-700 dark:text-emerald-400">
              <span className="font-bold">{t('affiliate.netPayout')}</span>
              <span className="font-extrabold text-base">
                {formatVnd(netAmount)}
              </span>
            </div>
          </div>

          {/* Loại đối tác */}
          <div className="space-y-2">
            <label className="font-semibold text-gray-800 dark:text-gray-200">
              {t('affiliate.partnerTypeLabel')}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 p-3 rounded-xl border border-orange-500 bg-orange-50/50 dark:bg-orange-950/20 cursor-pointer">
                <input
                  type="radio"
                  name="partnerType"
                  value="personal"
                  checked={partnerType === 'personal'}
                  onChange={() => setPartnerType('personal')}
                  className="text-orange-600 focus:ring-orange-500"
                />
                <span className="font-medium text-gray-900 dark:text-white">
                  {t('affiliate.partnerPersonal')}
                </span>
              </label>

              <label className="flex items-center gap-2 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100/60 dark:bg-gray-800/40 opacity-60 cursor-not-allowed">
                <input
                  type="radio"
                  name="partnerType"
                  value="company"
                  disabled
                  className="text-gray-400"
                />
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-400">
                    {t('affiliate.partnerCompany')}
                  </span>
                  <span className="block text-[10px] text-amber-600 dark:text-amber-400">
                    (Sắp ra mắt)
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Thông tin KYC Cá nhân */}
          <div className="space-y-3.5 pt-2 border-t border-gray-100 dark:border-gray-800">
            <h4 className="font-bold text-gray-900 dark:text-white">
              {t('affiliate.personalInfoTitle')}
            </h4>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                {t('affiliate.fullNameLabel')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3.5 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {t('affiliate.idCardLabel')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="9 hoặc 12 số"
                  value={idCardNumber}
                  onChange={(e) => setIdCardNumber(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3.5 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {t('affiliate.idCardIssuedDateLabel')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={idCardIssuedDate}
                  onChange={(e) => setIdCardIssuedDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {t('affiliate.taxCodeLabel')}
                </label>
                <input
                  type="text"
                  placeholder="10 hoặc 13 số"
                  value={taxCode}
                  onChange={(e) => setTaxCode(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                {t('affiliate.idCardIssuedPlaceLabel')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ví dụ: Cục Cảnh sát QLHC về TTXH"
                value={idCardIssuedPlace}
                onChange={(e) => setIdCardIssuedPlace(e.target.value)}
                className="w-full px-3.5 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>
          </div>

          {/* Thông tin Ngân hàng */}
          <div className="space-y-3.5 pt-2 border-t border-gray-100 dark:border-gray-800">
            <h4 className="font-bold text-gray-900 dark:text-white">
              {t('affiliate.bankTitle')}
            </h4>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                {t('affiliate.bankNameLabel')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ví dụ: Vietcombank, Techcombank, MB Bank..."
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="w-full px-3.5 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {t('affiliate.bankAccountLabel')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Số tài khoản"
                  value={bankAccountNumber}
                  onChange={(e) => setBankAccountNumber(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {t('affiliate.bankAccountNameLabel')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="NGUYEN VAN A"
                  value={bankAccountName}
                  onChange={(e) => setBankAccountName(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white uppercase font-medium"
                />
              </div>
            </div>
          </div>

          {/* 🔴 Thông báo pháp lý theo Nghị định 330/2026/NĐ-CP */}
          <div className="p-3.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300 leading-relaxed flex items-start gap-2.5">
            <svg className="w-5 h-5 flex-shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p>{t('affiliate.legalNotice')}</p>
          </div>

          {/* Buttons */}
          <div className="pt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting || !!validationError}
              className="px-6 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-semibold shadow-md shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  {t('affiliate.submitting')}
                </>
              ) : (
                t('affiliate.submitWithdrawal')
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
