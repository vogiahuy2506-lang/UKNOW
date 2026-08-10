import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { HiMinus, HiPlus, HiOutlineExclamation } from 'react-icons/hi';
import { toast } from 'react-hot-toast';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../stores/authStore';
import { getTopupConfig, quoteTopup, createTopupPayment } from '../../services/topup.service';
import InvoiceVatForm, { computeDisplayVat } from '../../features/checkout/components/InvoiceVatForm';
import { isInvoiceVatUiEnabled } from '../../constants/invoiceVat';

const fmtVnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')} đ`;

const ITEM_LABEL_KEYS = {
  zalo_messages: 'topup.items.zaloMessages',
  emails: 'topup.items.emails',
  ai_credits: 'topup.items.aiCredits',
  zalo_accounts: 'topup.items.zaloAccounts',
  email_accounts: 'topup.items.emailAccounts',
  landing_pages: 'topup.items.landingPages',
  chatbots: 'topup.items.chatbots',
  employees: 'topup.items.employees',
};

const UNIT_LABEL_KEYS = {
  zalo_messages: 'topup.units.zaloMessages',
  emails: 'topup.units.emails',
  ai_credits: 'topup.units.aiCredits',
  zalo_accounts: 'topup.units.zaloAccounts',
  email_accounts: 'topup.units.emailAccounts',
  landing_pages: 'topup.units.landingPages',
  chatbots: 'topup.units.chatbots',
  employees: 'topup.units.employees',
};

const STRUCTURAL_KEYS = new Set([
  'zalo_accounts',
  'email_accounts',
  'landing_pages',
  'chatbots',
  'employees',
]);

function formatQtyInput(value) {
  if (value === '' || value === null || value === undefined) return '';
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('vi-VN') : '';
}

const TopupPage = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  const [loading, setLoading] = useState(true);
  const [quoting, setQuoting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState(null);
  const [config, setConfig] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [months, setMonths] = useState(1);
  const [quote, setQuote] = useState(null);
  const [invoiceInfo, setInvoiceInfo] = useState({ wantInvoice: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const { data } = await getTopupConfig();
        if (cancelled) return;
        const result = data.result || data.data || data;
        setConfig(result);
        const initial = {};
        for (const item of result.items || []) {
          initial[item.itemKey] = 0;
        }
        setQuantities(initial);
        const allowed = result.allowedMonths || [];
        setMonths(allowed.includes(1) ? 1 : (allowed[0] || 1));
      } catch (err) {
        if (!cancelled) {
          setError(err?.response?.data?.message || t('topup.loadFailed'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [t]);

  const allowedMonths = useMemo(() => {
    if (quote?.allowedMonths?.length) return quote.allowedMonths;
    return config?.allowedMonths || [];
  }, [quote, config]);

  const maxMonths = quote?.maxMonths ?? config?.maxMonths ?? 0;
  const structuralBlocked = maxMonths < 1
    || Boolean(config?.subscription?.isInGracePeriod);

  useEffect(() => {
    if (!allowedMonths.length) return;
    if (!allowedMonths.includes(months)) {
      setMonths(allowedMonths[0]);
    }
  }, [allowedMonths, months]);

  const runQuote = useCallback(async (nextQuantities, nextMonths) => {
    try {
      setQuoting(true);
      setError(null);
      const { data } = await quoteTopup({
        quantities: nextQuantities,
        months: nextMonths,
      });
      setQuote(data.result || data.data);
    } catch (err) {
      setQuote(null);
      setError(err?.response?.data?.message || t('topup.quoteFailed'));
    } finally {
      setQuoting(false);
    }
  }, [t]);

  const items = useMemo(() => config?.items || [], [config]);

  const quantityIssues = useMemo(() => {
    const issues = {};
    for (const item of items) {
      const raw = quantities[item.itemKey];
      if (raw === '' || raw === null || raw === undefined) {
        issues[item.itemKey] = t('topup.qtyRequired');
        continue;
      }
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        issues[item.itemKey] = t('topup.qtyRequired');
        continue;
      }
      if (n === 0) continue;

      if (STRUCTURAL_KEYS.has(item.itemKey) && structuralBlocked) {
        issues[item.itemKey] = t('topup.structuralDisabledGrace');
        continue;
      }

      const min = Number(item.minQty || 0);
      const max = item.maxQty == null ? Infinity : Number(item.maxQty);
      const step = Number(item.stepQty || 1);
      const noun = t(UNIT_LABEL_KEYS[item.itemKey] || 'topup.units.generic');

      if (n < min) {
        issues[item.itemKey] = t('topup.qtyBelowMin', {
          n: `${min.toLocaleString('vi-VN')} ${noun}`,
        });
      } else if (n > max) {
        issues[item.itemKey] = t('topup.qtyAboveMax', {
          n: `${max.toLocaleString('vi-VN')} ${noun}`,
        });
      } else if (step > 1 && (n - min) % step !== 0) {
        issues[item.itemKey] = t('topup.qtyStep', {
          n: `${step.toLocaleString('vi-VN')} ${noun}`,
        });
      }
    }
    return issues;
  }, [items, quantities, structuralBlocked, t]);

  const hasQuantityIssues = Object.keys(quantityIssues).length > 0;
  const hasStructuralInCart = useMemo(
    () => items.some((item) => STRUCTURAL_KEYS.has(item.itemKey) && Number(quantities[item.itemKey] || 0) > 0),
    [items, quantities]
  );

  useEffect(() => {
    if (loading || !Object.keys(quantities).length) return;
    if (hasQuantityIssues) {
      setQuote(null);
      setError(null);
      return;
    }
    const timer = setTimeout(() => runQuote(quantities, months), 350);
    return () => clearTimeout(timer);
  }, [loading, quantities, months, runQuote, hasQuantityIssues]);

  const zaloRemaining = quote?.zaloCapacity?.remaining
    ?? config?.zaloCapacity?.remaining
    ?? null;

  const adjustQty = (item, delta) => {
    if (STRUCTURAL_KEYS.has(item.itemKey) && structuralBlocked) return;
    const step = Number(item.stepQty || 1);
    const min = Number(item.minQty || 0);
    let max = item.maxQty == null ? Infinity : Number(item.maxQty);
    if (item.itemKey === 'zalo_messages' && zaloRemaining != null) {
      max = Math.min(max, Number(zaloRemaining));
    }
    setQuantities((prev) => {
      const raw = prev[item.itemKey];
      const parsed = Number(raw);
      const current = raw === '' || !Number.isFinite(parsed) ? 0 : parsed;
      let next;
      if (delta > 0 && current === 0) {
        next = min;
      } else if (delta < 0 && current <= min) {
        next = 0;
      } else {
        next = current + delta * step;
      }
      next = Math.min(max, Math.max(0, next));
      if (next > 0 && next < min) next = min;
      return { ...prev, [item.itemKey]: next };
    });
  };

  const setQty = (item, value) => {
    if (STRUCTURAL_KEYS.has(item.itemKey) && structuralBlocked) return;
    const digits = String(value).replace(/\D/g, '').replace(/^0+(\d)/, '$1');
    setQuantities((prev) => ({
      ...prev,
      [item.itemKey]: digits === '' ? '' : Number(digits),
    }));
  };

  const total = Number(quote?.total || 0);
  const invoiceVatUiEnabled = isInvoiceVatUiEnabled();
  const vatBreakdown = computeDisplayVat(
    total,
    invoiceVatUiEnabled && Boolean(invoiceInfo?.wantInvoice),
  );
  const payableAmount = vatBreakdown.gross;
  const meetsMinimum = Boolean(quote?.meetsMinimum);
  const shortfall = Number(quote?.shortfall || 0);
  const canPay = meetsMinimum && !paying && !quoting && !error && !hasQuantityIssues;

  const handlePay = async () => {
    if (!canPay) return;
    try {
      setPaying(true);
      const { data } = await createTopupPayment({
        quantities,
        months,
        invoiceInfo: invoiceVatUiEnabled ? invoiceInfo : { wantInvoice: false },
      });
      const result = data.result || data.data;
      if (result?.checkoutUrl) {
        window.location.href = result.checkoutUrl;
        return;
      }
      toast.error(t('topup.paymentFailed'));
    } catch (err) {
      toast.error(err?.response?.data?.message || t('topup.paymentFailed'));
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('topup.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('topup.subtitle')}</p>
      </div>

      {config?.subscription?.isExpired && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <HiOutlineExclamation className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p>{t('topup.subscriptionExpired')}</p>
            <Link to="/pricing" className="font-semibold underline">{t('topup.viewPricing')}</Link>
          </div>
        </div>
      )}

      {config?.subscription?.isInGracePeriod && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <HiOutlineExclamation className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p>{t('topup.graceNoStructural')}</p>
            <Link to="/pricing" className="font-semibold underline">{t('topup.viewPricing')}</Link>
          </div>
        </div>
      )}

      {!structuralBlocked && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <label className="block text-sm font-semibold text-slate-900" htmlFor="topup-months">
            {t('topup.monthsLabel')}
          </label>
          <p className="mt-1 text-xs text-slate-500">
            {t('topup.monthsPlanRemaining', { n: maxMonths })}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {allowedMonths.map((m) => (
              <button
                key={m}
                id={m === months ? 'topup-months' : undefined}
                type="button"
                onClick={() => setMonths(m)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  months === m
                    ? 'border-primary-600 bg-primary-50 text-primary-700'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {t('topup.monthsOption', { n: m })}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {items.map((item) => {
          const isStructural = STRUCTURAL_KEYS.has(item.itemKey);
          const disabled = isStructural && structuralBlocked;
          const qty = quantities[item.itemKey] === '' ? '' : Number(quantities[item.itemKey] || 0);
          const line = quote?.items?.find((i) => i.itemKey === item.itemKey);
          const numericQty = Number(qty) || 0;
          const lineMonths = isStructural && hasStructuralInCart ? months : 1;
          const subtotal = line
            ? Number(line.subtotal)
            : numericQty * Number(item.unitPrice || 0) * (isStructural ? lineMonths : 1);
          const issue = quantityIssues[item.itemKey];
          return (
            <div
              key={item.itemKey}
              className={`rounded-2xl border bg-white p-4 sm:p-5 ${
                disabled ? 'border-slate-100 opacity-60' : 'border-slate-200'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">
                    {t(ITEM_LABEL_KEYS[item.itemKey] || item.itemKey)}
                  </div>
                  <div className="text-xs text-slate-500">
                    {fmtVnd(item.unitPrice)} / {t(UNIT_LABEL_KEYS[item.itemKey] || 'topup.units.generic')}
                    {' · '}
                    {t('topup.stepHint', { step: item.stepQty })}
                    {isStructural && !disabled && months > 1 && (
                      <> · × {t('topup.monthsOption', { n: months })}</>
                    )}
                  </div>
                  {isStructural && (
                    <div className="mt-1 text-xs text-slate-500">
                      {disabled ? t('topup.structuralDisabledGrace') : t('topup.structuralHint')}
                    </div>
                  )}
                  {item.itemKey === 'zalo_messages' && zaloRemaining != null && (
                    <div className="mt-1 text-xs text-amber-700">
                      {t('topup.zaloRemaining', { n: Number(zaloRemaining).toLocaleString('vi-VN') })}
                    </div>
                  )}
                </div>
                <div className="text-sm font-medium text-slate-700">{fmtVnd(subtotal)}</div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => adjustQty(item, -1)}
                  className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="decrease"
                >
                  <HiMinus className="h-4 w-4" />
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  disabled={disabled}
                  aria-invalid={Boolean(issue)}
                  className={`w-28 rounded-lg border px-3 py-2 text-center text-sm disabled:bg-slate-50 ${
                    issue ? 'border-red-300 text-red-600' : 'border-slate-200'
                  }`}
                  value={formatQtyInput(qty)}
                  onChange={(e) => setQty(item, e.target.value)}
                />
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => adjustQty(item, 1)}
                  className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="increase"
                >
                  <HiPlus className="h-4 w-4" />
                </button>
                <span className="text-xs text-slate-400">
                  {t(UNIT_LABEL_KEYS[item.itemKey] || 'topup.units.generic')}
                </span>
              </div>
              {issue && (
                <p className="mt-1.5 text-[11px] font-medium text-red-600 leading-snug">{issue}</p>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5 space-y-3">
        {invoiceVatUiEnabled && (
          <InvoiceVatForm
            netAmount={total}
            disabled={paying || !meetsMinimum}
            defaultEmail={user?.email || ''}
            onChange={setInvoiceInfo}
          />
        )}
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>{t('topup.total')}</span>
          <span>
            {hasQuantityIssues
              ? t('topup.fixQtyToSeePrice')
              : quoting
                ? t('topup.updating')
                : fmtVnd(total)}
          </span>
        </div>
        {invoiceVatUiEnabled && Boolean(invoiceInfo?.wantInvoice) && vatBreakdown.vatAmount > 0 && (
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>{t('topup.vatLine', { rate: vatBreakdown.vatRate })}</span>
            <span>+{fmtVnd(vatBreakdown.vatAmount)}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-base font-bold text-slate-900">
          <span>{t('checkout.total')}</span>
          <span>
            {hasQuantityIssues
              ? t('topup.fixQtyToSeePrice')
              : quoting
                ? t('topup.updating')
                : fmtVnd(payableAmount)}
          </span>
        </div>
        {!hasQuantityIssues && !meetsMinimum && total > 0 && (
          <p className="text-sm text-amber-700">
            {t('topup.shortfall', {
              min: fmtVnd(quote?.minOrderAmount || 50000),
              shortfall: fmtVnd(shortfall),
            })}
          </p>
        )}
        <p className="text-xs text-slate-500">{t('topup.expiryNotice')}</p>
        <button
          type="button"
          disabled={!canPay}
          onClick={handlePay}
          className="w-full rounded-xl bg-primary-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {paying ? t('topup.paying') : t('topup.pay')}
        </button>
        <button
          type="button"
          onClick={() => navigate('/pricing')}
          className="w-full text-center text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          {t('topup.upgradePlanInstead')}
        </button>
      </div>
    </div>
  );
};

export default TopupPage;
