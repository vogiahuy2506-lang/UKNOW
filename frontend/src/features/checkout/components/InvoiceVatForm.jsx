/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../../i18n';
import api from '../../../services/api';

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
 * Pre-fills known account info or saved profile to minimize checkout friction.
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
  const [saveProfile, setSaveProfile] = useState(true);

  // Field touch states for field-level error messages
  const [touched, setTouched] = useState({
    taxCode: false,
    companyName: false,
    fullName: false,
    idNumber: false,
  });

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  // Load saved profile on initial mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/users/invoice-profile');
        const profile = res?.data?.data;
        if (cancelled || !profile || typeof profile !== 'object') return;

        if (profile.buyerType === 'company' || profile.buyerType === 'personal') {
          setBuyerType(profile.buyerType);
        }
        if (profile.taxCode) setTaxCode(profile.taxCode);
        if (profile.companyName) setCompanyName(profile.companyName);
        if (profile.companyAddress) setCompanyAddress(profile.companyAddress);
        if (profile.fullName) setFullName(profile.fullName);
        if (profile.idNumber) setIdNumber(profile.idNumber);
        if (profile.phone) setPhone(profile.phone);
        if (profile.address) setAddress(profile.address);
      } catch {
        // Silently fallback to defaults on error
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Synchronize defaults if profile loads after initial mount
  useEffect(() => {
    if (defaultFullName) {
      setFullName((prev) => prev || defaultFullName);
    }
    if (defaultPhone) {
      setPhone((prev) => prev || defaultPhone);
    }
  }, [defaultFullName, defaultPhone]);

  // Compute validation errors
  const errors = useMemo(() => {
    const errs = {};
    if (buyerType === 'company') {
      const cleanTax = String(taxCode || '').trim().replace(/\s+/g, '');
      if (!cleanTax) {
        errs.taxCode = t('invoiceVat.errors.taxCodeRequired');
      } else if (!TAX_CODE_REGEX.test(cleanTax)) {
        errs.taxCode = t('invoiceVat.errors.taxCodeInvalid');
      }
      if (!String(companyName || '').trim()) {
        errs.companyName = t('invoiceVat.errors.companyNameRequired');
      }
    } else {
      if (!String(fullName || '').trim()) {
        errs.fullName = t('invoiceVat.errors.fullNameRequired');
      }
      const cleanId = String(idNumber || '').trim().replace(/\s+/g, '');
      if (!cleanId) {
        errs.idNumber = t('invoiceVat.errors.idNumberRequired');
      } else if (!ID_NUMBER_REGEX.test(cleanId)) {
        errs.idNumber = t('invoiceVat.errors.idNumberInvalid');
      }
    }
    return errs;
  }, [buyerType, taxCode, companyName, fullName, idNumber, t]);

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
      saveProfile,
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
    saveProfile,
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

  const getInputClass = (fieldName) => {
    const hasError = Boolean(touched[fieldName] && errors[fieldName]);
    if (hasError) {
      return 'w-full rounded-lg border border-red-400 bg-red-50/30 px-3 py-2 text-sm text-red-900 placeholder:text-red-300 focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400';
    }
    return 'w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300';
  };

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
            <div>
              <input
                className={getInputClass('taxCode')}
                value={taxCode}
                onChange={(e) => setTaxCode(e.target.value)}
                onBlur={() => handleBlur('taxCode')}
                placeholder={t('invoiceVat.taxCode')}
                maxLength={14}
                autoComplete="off"
                aria-invalid={Boolean(touched.taxCode && errors.taxCode)}
              />
              {touched.taxCode && errors.taxCode && (
                <p className="mt-1 text-[11px] text-red-600 leading-snug">{errors.taxCode}</p>
              )}
            </div>
            <div>
              <input
                className={getInputClass('companyName')}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                onBlur={() => handleBlur('companyName')}
                placeholder={t('invoiceVat.companyName')}
                autoComplete="organization"
                aria-invalid={Boolean(touched.companyName && errors.companyName)}
              />
              {touched.companyName && errors.companyName && (
                <p className="mt-1 text-[11px] text-red-600 leading-snug">{errors.companyName}</p>
              )}
            </div>
            <div>
              <input
                className={getInputClass('companyAddress')}
                value={companyAddress}
                onChange={(e) => setCompanyAddress(e.target.value)}
                placeholder={t('invoiceVat.companyAddress')}
                autoComplete="street-address"
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <input
                className={getInputClass('fullName')}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                onBlur={() => handleBlur('fullName')}
                placeholder={t('invoiceVat.fullName')}
                autoComplete="name"
                aria-invalid={Boolean(touched.fullName && errors.fullName)}
              />
              {touched.fullName && errors.fullName && (
                <p className="mt-1 text-[11px] text-red-600 leading-snug">{errors.fullName}</p>
              )}
            </div>
            <div>
              <input
                className={getInputClass('idNumber')}
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                onBlur={() => handleBlur('idNumber')}
                placeholder={t('invoiceVat.idNumber')}
                maxLength={12}
                autoComplete="off"
                aria-invalid={Boolean(touched.idNumber && errors.idNumber)}
              />
              {touched.idNumber && errors.idNumber && (
                <p className="mt-1 text-[11px] text-red-600 leading-snug">{errors.idNumber}</p>
              )}
            </div>
            <div>
              <input
                className={getInputClass('address')}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={t('invoiceVat.address')}
                autoComplete="street-address"
              />
            </div>
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
        <div>
          <input
            className={getInputClass('phone')}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t('invoiceVat.phone')}
            autoComplete="tel"
          />
        </div>

        {/* Checkbox auto-save profile for next time */}
        <div className="pt-1">
          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={saveProfile}
              onChange={(e) => setSaveProfile(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
            />
            <span>{t('invoiceVat.saveProfile')}</span>
          </label>
        </div>
      </div>
    </div>
  );
}
