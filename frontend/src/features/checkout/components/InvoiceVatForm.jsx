/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../../i18n';

/** Keep in sync with backend DEFAULT_INVOICE_VAT_RATE / INVOICE_VAT_RATE. */
export const DEFAULT_FE_INVOICE_VAT_RATE = 10;

export function computeDisplayVat(net, enabled = true, vatRate = DEFAULT_FE_INVOICE_VAT_RATE) {
  const n = Math.round(Number(net) || 0);
  if (!enabled || n <= 0) {
    return { net: n, vatAmount: 0, gross: n, vatRate };
  }
  const vatAmount = Math.round((n * vatRate) / 100);
  return { net: n, vatAmount, gross: n + vatAmount, vatRate };
}

export const TAX_CODE_REGEX = /^\d{10}(-\d{3})?$/;
export const ID_NUMBER_REGEX = /^\d{9,12}$/;

export function isInvoiceInfoValid(info) {
  if (!info || typeof info !== 'object') return false;
  const email = String(info.email || '').trim();
  if (!email) return false;
  if (info.buyerType === 'company') {
    const taxCode = String(info.taxCode || '').trim().replace(/\s+/g, '');
    const companyName = String(info.companyName || '').trim();
    return Boolean(taxCode && companyName && TAX_CODE_REGEX.test(taxCode));
  }
  if (info.buyerType === 'personal') {
    const fullName = String(info.fullName || '').trim();
    const idNumber = String(info.idNumber || '').trim().replace(/\s+/g, '');
    return Boolean(fullName && idNumber && ID_NUMBER_REGEX.test(idNumber));
  }
  return false;
}

/** Mask account email for display — recipient is server-owned, not editable. */
export function maskAccountEmail(email) {
  const s = String(email || '').trim();
  const at = s.indexOf('@');
  if (at <= 0) return s || '—';
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  const keep = local.length <= 2 ? 1 : 2;
  return `${local.slice(0, keep)}***@${domain}`;
}

/**
 * Mandatory VAT invoice form for Checkout.
 * Pre-fills known account info to minimize checkout friction.
 */
export default function InvoiceVatForm({
  netAmount = 0,
  disabled = false,
  defaultEmail = '',
  defaultFullName = '',
  defaultPhone = '',
  onChange,
  className = '',
}) {
  const { t } = useI18n();
  const vatRate = DEFAULT_FE_INVOICE_VAT_RATE;
  const net = Math.round(Number(netAmount) || 0);
  const canRequest = net > 0 && !disabled;
  const accountEmail = String(defaultEmail || '').trim();

  const [buyerType, setBuyerType] = useState('personal');
  const [taxCode, setTaxCode] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [fullName, setFullName] = useState(defaultFullName || '');
  const [idNumber, setIdNumber] = useState('');
  const [phone, setPhone] = useState(defaultPhone || '');
  const [address, setAddress] = useState('');

  // Synchronize defaults if profile loads after initial mount
  useEffect(() => {
    if (defaultFullName) {
      setFullName((prev) => prev || defaultFullName);
    }
    if (defaultPhone) {
      setPhone((prev) => prev || defaultPhone);
    }
  }, [defaultFullName, defaultPhone]);

  const payload = useMemo(() => {
    if (!canRequest) {
      return { wantInvoice: false };
    }
    const base = {
      wantInvoice: true,
      buyerType,
      email: accountEmail,
      phone: String(phone || '').trim() || undefined,
      address: String(address || '').trim() || undefined,
    };
    if (buyerType === 'company') {
      return {
        ...base,
        taxCode: String(taxCode || '').trim(),
        companyName: String(companyName || '').trim(),
        companyAddress: String(companyAddress || '').trim() || undefined,
      };
    }
    return {
      ...base,
      fullName: String(fullName || '').trim(),
      idNumber: String(idNumber || '').trim(),
    };
  }, [
    canRequest,
    buyerType,
    accountEmail,
    phone,
    address,
    taxCode,
    companyName,
    companyAddress,
    fullName,
    idNumber,
  ]);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    onChangeRef.current?.(payload);
  }, [payload]);

  if (!canRequest) return null;

  const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300';
  const readonlyClass =
    'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 cursor-not-allowed';

  return (
    <div className={`rounded-xl border border-orange-200/80 bg-orange-50/50 ${className}`}>
      <div className="px-3 pt-3 pb-2">
        <p className="text-sm font-semibold text-slate-800">{t('invoiceVat.bannerTitle')}</p>
        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
          {t('invoiceVat.bannerSubtitle') || t('invoiceVat.vatAdditiveNote', { rate: vatRate })}
        </p>
      </div>

      <div className="flex gap-1 px-3 mb-3">
        <button
          type="button"
          onClick={() => setBuyerType('personal')}
          className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            buyerType === 'personal'
              ? 'bg-white text-orange-700 shadow-sm border border-orange-200'
              : 'text-slate-500 hover:bg-white/60'
          }`}
        >
          {t('invoiceVat.tabPersonal')}
        </button>
        <button
          type="button"
          onClick={() => setBuyerType('company')}
          className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            buyerType === 'company'
              ? 'bg-white text-orange-700 shadow-sm border border-orange-200'
              : 'text-slate-500 hover:bg-white/60'
          }`}
        >
          {t('invoiceVat.tabCompany')}
        </button>
      </div>

      <div className="space-y-2 px-3 pb-3">
        {buyerType === 'company' ? (
          <>
            <input
              className={inputClass}
              value={taxCode}
              onChange={(e) => setTaxCode(e.target.value)}
              placeholder={t('invoiceVat.taxCode')}
              maxLength={14}
              autoComplete="off"
            />
            <input
              className={inputClass}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder={t('invoiceVat.companyName')}
              autoComplete="organization"
            />
            <input
              className={inputClass}
              value={companyAddress}
              onChange={(e) => setCompanyAddress(e.target.value)}
              placeholder={t('invoiceVat.companyAddress')}
              autoComplete="street-address"
            />
          </>
        ) : (
          <>
            <input
              className={inputClass}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t('invoiceVat.fullName')}
              autoComplete="name"
            />
            <input
              className={inputClass}
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              placeholder={t('invoiceVat.idNumber')}
              maxLength={12}
              autoComplete="off"
            />
            <input
              className={inputClass}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t('invoiceVat.address')}
              autoComplete="street-address"
            />
          </>
        )}
        <div>
          <input
            className={readonlyClass}
            type="text"
            value={maskAccountEmail(accountEmail)}
            readOnly
            aria-readonly="true"
            aria-label={t('invoiceVat.emailReadonly')}
            title={t('invoiceVat.emailPdfHint')}
          />
          <p className="mt-1 text-[11px] text-slate-500 leading-snug">
            {t('invoiceVat.emailPdfHint')}
          </p>
        </div>
        <input
          className={inputClass}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t('invoiceVat.phone')}
          autoComplete="tel"
        />
      </div>
    </div>
  );
}
