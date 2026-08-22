import { HiOutlineClipboardList, HiOutlineExclamationCircle } from 'react-icons/hi';
import CopyRow from './CopyRow';

/**
 * PayOSInstructions — the QR + bank-info + manual-transfer guidance block
 * shown on the right side of the checkout page when the order has been
 * created. Parses the VietQR string once and renders copyable rows for
 * bank name, account number, account name, amount, and description.
 *
 * Props are kept flat (no nested objects) so the parent stays in charge of
 * the data sources.
 */
export default function PayOSInstructions({
  t,
  qrInfo,
  // qrImageUrl kept in the prop list for future use (e.g. inline QR display
  // inside this card); ignore the unused-arg lint rule for now.
  qrImageUrl: _qrImageUrl,
  bank,
  orderCode,
  payableAmount,
  fmtVnd,
  formatAccountNumber,
}) {
  if (!qrInfo?.valid) {
    return (
      <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
        <HiOutlineExclamationCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-700 leading-snug">
          {qrInfo?.error ? t('checkout.qrCorrupted') : t('checkout.checkingTransaction')}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-50/80 border border-slate-200/70 rounded-2xl p-3.5 space-y-2.5">
      <div className="flex items-center gap-2 mb-1">
        <HiOutlineClipboardList className="w-4 h-4 text-orange-500 shrink-0" />
        <p className="text-xs font-bold text-slate-900 uppercase tracking-wider">
          {t('checkout.bankInfoTitle')}
        </p>
      </div>
      <p className="text-[11px] text-slate-500 leading-snug">
        {t('checkout.bankInfoSubtitle')}
      </p>

      <div className="grid grid-cols-1 gap-1.5 mt-1">
        <CopyRow
          label={t('checkout.bankNameLabel')}
          value={bank?.name || qrInfo.bin}
          displayValue={bank ? `${bank.name} (${bank.short})` : qrInfo.bin}
          t={t}
        />
        <CopyRow
          label={t('checkout.accountNumberLabel')}
          value={qrInfo.accountNumber}
          displayValue={qrInfo.accountNumber ? formatAccountNumber(qrInfo.accountNumber) : '—'}
          t={t}
        />
        <CopyRow
          label={t('checkout.accountNameLabel')}
          value={qrInfo.merchantName}
          displayValue={qrInfo.merchantName || '—'}
          hint={qrInfo.merchantName ? t('checkout.accountNameDisclaimer') : null}
          t={t}
        />
        <CopyRow
          label={t('checkout.amountLabel')}
          value={String(payableAmount)}
          displayValue={fmtVnd(payableAmount)}
          t={t}
        />
        <CopyRow
          label={t('checkout.descriptionLabel')}
          value={qrInfo.description || (orderCode ? `TT ${orderCode}` : null)}
          displayValue={qrInfo.description || (orderCode ? `TT ${orderCode}` : '—')}
          hint={t('checkout.descriptionHint')}
          t={t}
        />
      </div>
    </div>
  );
}
