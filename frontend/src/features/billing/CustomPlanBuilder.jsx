import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiMinus, HiPlus, HiOutlineExclamation, HiOutlineLightBulb } from 'react-icons/hi';
import { toast } from 'react-hot-toast';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../stores/authStore';
import { getCustomPlanConfig, quoteCustomPlan } from '../../services/customPlan.service';

const fmtVnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')} đ`;

const ITEM_LABEL_KEYS = {
  base_fee: 'customPlan.items.baseFee',
  zalo_messages: 'customPlan.items.zaloMessages',
  emails: 'customPlan.items.emails',
  ai_credits: 'customPlan.items.aiCredits',
  zalo_accounts: 'customPlan.items.zaloAccounts',
  email_accounts: 'customPlan.items.emailAccounts',
  landing_pages: 'customPlan.items.landingPages',
  chatbots: 'customPlan.items.chatbots',
  employees: 'customPlan.items.employees',
  campaigns: 'customPlan.items.campaigns',
  zalo_campaigns: 'customPlan.items.zaloCampaigns',
  zalo_group_campaigns: 'customPlan.items.zaloGroupCampaigns',
  email_campaigns: 'customPlan.items.emailCampaigns',
  email_templates: 'customPlan.items.emailTemplates',
  zalo_templates: 'customPlan.items.zaloTemplates',
};

const UNIT_LABEL_KEYS = {
  zalo_messages: 'customPlan.units.zaloMessages',
  emails: 'customPlan.units.emails',
  ai_credits: 'customPlan.units.aiCredits',
  zalo_accounts: 'customPlan.units.zaloAccounts',
  email_accounts: 'customPlan.units.emailAccounts',
  landing_pages: 'customPlan.units.landingPages',
  chatbots: 'customPlan.units.chatbots',
  employees: 'customPlan.units.employees',
  campaigns: 'customPlan.units.campaigns',
  zalo_campaigns: 'customPlan.units.campaigns',
  zalo_group_campaigns: 'customPlan.units.campaigns',
  email_campaigns: 'customPlan.units.campaigns',
  email_templates: 'customPlan.units.templates',
  zalo_templates: 'customPlan.units.templates',
};

/** "1.000 tin" / "landing page" — always spells out the unit noun. */
function formatUnit(item, t) {
  const noun = t(UNIT_LABEL_KEYS[item.itemKey] || 'customPlan.units.generic');
  const size = Number(item.unitSize || 1);
  return size > 1 ? `${size.toLocaleString('vi-VN')} ${noun}` : noun;
}

/** Format a quantity with its unit noun, e.g. "500 tin", "1 landing page". */
function formatQtyWithUnit(itemKey, qty, t) {
  const n = Number(qty || 0);
  const noun = t(UNIT_LABEL_KEYS[itemKey] || 'customPlan.units.generic');
  return `${n.toLocaleString('vi-VN')} ${noun}`;
}

function defaultQuantities(items = []) {
  const q = {};
  for (const item of items) {
    if (item.itemKey === 'base_fee') {
      q.base_fee = 1;
      continue;
    }
    q[item.itemKey] = Number(item.minQty || 0);
  }
  return q;
}

export default function CustomPlanBuilder({
  open,
  onClose,
  billingPeriod: initialBillingPeriod = 'monthly',
  glass = false,
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [quoting, setQuoting] = useState(false);
  const [items, setItems] = useState([]);
  const [config, setConfig] = useState({ yearlyDiscountPercent: 20, zaloMonthlyCapacityPerAccount: 16000 });
  const [quantities, setQuantities] = useState({});
  const [billingPeriod, setBillingPeriod] = useState(initialBillingPeriod);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setBillingPeriod(initialBillingPeriod);
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const { data } = await getCustomPlanConfig();
        if (cancelled) return;
        const nextItems = data?.data?.items || [];
        setItems(nextItems);
        setConfig(data?.data?.config || {});
        setQuantities(defaultQuantities(nextItems));
      } catch (err) {
        if (!cancelled) {
          toast.error(err?.response?.data?.message || t('customPlan.loadConfigFailed'));
          onClose?.();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, initialBillingPeriod, onClose, t]);

  const editableItems = useMemo(
    () => items.filter((item) => item.itemKey !== 'base_fee'),
    [items]
  );

  const includedSummary = useMemo(() => {
    return editableItems
      .filter((item) => Number(item.includedQty || 0) > 0)
      .map((item) => formatQtyWithUnit(item.itemKey, item.includedQty, t));
  }, [editableItems, t]);

  const runQuote = useCallback(async (nextQuantities, nextPeriod) => {
    try {
      setQuoting(true);
      setError(null);
      const { data } = await quoteCustomPlan({
        quantities: nextQuantities,
        billingPeriod: nextPeriod,
      });
      setQuote(data.data);
    } catch (err) {
      setQuote(null);
      setError(err?.response?.data?.message || t('customPlan.quoteFailed'));
    } finally {
      setQuoting(false);
    }
  }, [t]);

  useEffect(() => {
    if (!open || loading || !Object.keys(quantities).length) return;
    const timer = setTimeout(() => runQuote(quantities, billingPeriod), 400);
    return () => clearTimeout(timer);
  }, [open, loading, quantities, billingPeriod, runQuote]);

  const adjustQty = (item, delta) => {
    const step = Number(item.stepQty || 1);
    const min = Number(item.minQty || 0);
    const max = item.maxQty == null ? Infinity : Number(item.maxQty);
    setQuantities((prev) => {
      const current = Number(prev[item.itemKey] ?? min);
      const next = Math.min(max, Math.max(min, current + delta * step));
      return { ...prev, [item.itemKey]: next };
    });
  };

  const setQty = (item, value) => {
    const min = Number(item.minQty || 0);
    const max = item.maxQty == null ? Infinity : Number(item.maxQty);
    const step = Number(item.stepQty || 1);
    let n = Number(value);
    if (!Number.isFinite(n)) n = min;
    n = Math.min(max, Math.max(min, Math.round(n)));
    if (step > 1) {
      n = min + Math.round((n - min) / step) * step;
      n = Math.min(max, Math.max(min, n));
    }
    setQuantities((prev) => ({ ...prev, [item.itemKey]: n }));
  };

  const handleCheckout = () => {
    if (!quote) return;
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    navigate('/checkout', {
      state: {
        isCustomPlan: true,
        quantities: quote.quantities,
        billingPeriod,
        quote,
      },
    });
  };

  if (!open) return null;

  const cardClass = glass
    ? 'bg-white/90 backdrop-blur-md border border-white/80'
    : 'bg-white border border-slate-200';

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div className={`relative w-full max-w-4xl max-h-[92vh] overflow-hidden rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col ${cardClass}`}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-black text-slate-900">{t('customPlan.title')}</h3>
            <p className="text-sm text-slate-500 mt-1">{t('customPlan.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-sm font-semibold px-2 py-1"
          >
            {t('common.close')}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {loading ? (
            <div className="py-16 flex justify-center">
              <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="flex justify-center">
                <div className="inline-flex items-center rounded-full p-1 gap-1 bg-slate-100 border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setBillingPeriod('monthly')}
                    className={`px-4 py-1.5 rounded-full text-sm font-semibold ${
                      billingPeriod === 'monthly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    {t('pricing.billingMonthly')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingPeriod('yearly')}
                    className={`px-4 py-1.5 rounded-full text-sm font-semibold flex items-center gap-2 ${
                      billingPeriod === 'yearly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    {t('pricing.billingYearly')}
                    <span className="bg-emerald-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
                      -{config.yearlyDiscountPercent || 20}%
                    </span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {editableItems.map((item) => (
                  <div key={item.itemKey} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <p className="text-sm font-bold text-slate-800">
                          {t(ITEM_LABEL_KEYS[item.itemKey] || item.itemKey)}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {fmtVnd(item.unitPrice)} / {formatUnit(item, t)}
                        </p>
                        {Number(item.includedQty || 0) > 0 && (
                          <p className="text-[11px] text-emerald-700 mt-0.5">
                            {t('customPlan.includedInBase', {
                              n: formatQtyWithUnit(item.itemKey, item.includedQty, t),
                            })}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => adjustQty(item, -1)}
                        className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100"
                      >
                        <HiMinus className="w-4 h-4" />
                      </button>
                      <input
                        type="number"
                        className="flex-1 text-center font-bold text-slate-900 bg-white border border-slate-200 rounded-lg py-1.5"
                        value={quantities[item.itemKey] ?? item.minQty ?? 0}
                        min={item.minQty || 0}
                        max={item.maxQty ?? undefined}
                        step={item.stepQty || 1}
                        onChange={(e) => setQty(item, e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => adjustQty(item, 1)}
                        className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100"
                      >
                        <HiPlus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <HiOutlineExclamation className="w-5 h-5 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {quote?.priceFloorApplied && (
                <div className="flex items-start gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">
                  <HiOutlineExclamation className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">{t('customPlan.priceFloorTitle')}</p>
                    <p>
                      {(quote.warnings || []).find((w) => w.code === 'PRICE_FLOOR_APPLIED')?.message
                        || t('customPlan.priceFloorFallback')}
                    </p>
                  </div>
                </div>
              )}

              {quote?.suggestedPlan && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <HiOutlineLightBulb className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">{t('customPlan.suggestedPlanTitle')}</p>
                    <p>
                      {t('customPlan.suggestedPlanBody', {
                        name: quote.suggestedPlan.name,
                        price: fmtVnd(quote.suggestedPlan.price),
                        savings: fmtVnd(quote.suggestedPlan.savings),
                      })}
                    </p>
                    <button
                      type="button"
                      className="mt-1 text-orange-700 font-bold underline"
                      onClick={() => navigate('/pricing')}
                    >
                      {t('customPlan.viewPublicPlans')}
                    </button>
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-slate-800">{t('customPlan.priceBreakdown')}</h4>
                  {quoting && <span className="text-xs text-slate-500">{t('customPlan.updating')}</span>}
                </div>
                <div className="space-y-1.5 text-sm">
                  {(quote?.items || []).filter((i) => i.subtotal > 0 || i.itemKey === 'base_fee').map((line) => (
                    <div key={line.itemKey} className="flex justify-between gap-3 text-slate-600">
                      <span className={line.itemKey === 'base_fee' ? '' : 'truncate'}>
                        {t(ITEM_LABEL_KEYS[line.itemKey] || line.itemKey)}
                        {line.itemKey === 'base_fee' && includedSummary.length > 0 && (
                          <span className="block text-[11px] text-slate-400 font-normal mt-0.5">
                            {t('customPlan.baseFeeIncludes', {
                              list: includedSummary.join(', '),
                            })}
                          </span>
                        )}
                        {line.itemKey !== 'base_fee' && (
                          <span className="text-slate-400">
                            {' '}× {Number(line.qty).toLocaleString('vi-VN')}{' '}
                            {t(UNIT_LABEL_KEYS[line.itemKey] || 'customPlan.units.generic')}
                          </span>
                        )}
                      </span>
                      <span className="font-medium text-slate-800 shrink-0">{fmtVnd(line.subtotal)}</span>
                    </div>
                  ))}
                  <div className="border-t border-orange-200 pt-2 mt-2 flex justify-between">
                    <span className="font-black text-slate-900">
                      {billingPeriod === 'yearly' ? t('customPlan.yearlyTotal') : t('customPlan.monthlyTotal')}
                    </span>
                    <span className="font-black text-orange-600 text-lg">
                      {fmtVnd(quote?.total || 0)}
                    </span>
                  </div>
                  {billingPeriod === 'yearly' && quote?.monthlyTotal != null && (
                    <p className="text-xs text-emerald-700 text-right">
                      {t('customPlan.equivMonthly', { amount: fmtVnd(Math.round((quote.total || 0) / 12)) })}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between bg-white">
          <p className="text-xs text-slate-500">
            {t('customPlan.capacityHint', {
              n: Number(config.zaloMonthlyCapacityPerAccount || 16000).toLocaleString('vi-VN'),
            })}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={!quote || !!error || quoting}
              onClick={handleCheckout}
              className="btn btn-primary disabled:opacity-50"
            >
              {t('customPlan.checkout')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
