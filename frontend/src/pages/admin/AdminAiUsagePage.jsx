import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  HiOutlineCash,
  HiOutlineChevronDown,
  HiOutlineExclamation,
  HiOutlineRefresh,
  HiOutlineSparkles,
  HiOutlineTrendingUp,
  HiOutlineUsers,
} from 'react-icons/hi';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import adminAiUsageApiService from '../../features/admin/services/adminAiUsageApi.service';
import { useI18n } from '../../i18n';

const fmt = (value) => Number(value || 0).toLocaleString('vi-VN');
const fmtVnd = (value) => (value === null || value === undefined ? '—' : `${fmt(value)}đ`);
const fmtUsd = (value) => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
const fmtPct = (value) => (value === null || value === undefined ? '-' : `${Number(value || 0).toFixed(1)}%`);
const fmtDecimal = (value) => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
/** 'YYYY-MM-DD' (ngày giờ VN do máy chủ trả) → 'DD/MM/YYYY'. */
const fmtDay = (day) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
};

const KpiCard = ({ icon: Icon, label, value, sub, tone = 'orange' }) => {
  const toneMap = {
    orange: 'bg-orange-50 text-orange-600',
    green: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-violet-50 text-violet-600',
  };
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
          {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
        </div>
        <div className={`rounded-xl p-3 ${toneMap[tone] || toneMap.orange}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
};

const ChartTooltip = ({ active, payload, label, t }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 text-sm shadow-lg">
      <p className="mb-1 font-semibold text-gray-700">{fmtDay(label) || label}</p>
      <p className="text-orange-600">{t('adminAiUsage.estimatedCost')}: <strong>{fmtVnd(row.estimatedCostVnd)}</strong></p>
    </div>
  );
};

const SectionHeader = ({ title, hint }) => (
  <div className="mb-4 flex items-start justify-between gap-3">
    <div>
      <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-gray-400">{hint}</p>}
    </div>
  </div>
);

const EmptyRow = ({ colSpan, text }) => (
  <tr>
    <td colSpan={colSpan} className="px-5 py-8 text-center text-sm text-gray-400">{text}</td>
  </tr>
);

export default function AdminAiUsagePage() {
  const { t } = useI18n();
  // "Tháng này" | "30 ngày qua". Mốc tính ở máy chủ theo giờ Việt Nam — trang chỉ gửi mã.
  const [range, setRange] = useState('30d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showTechnical, setShowTechnical] = useState(false);

  const fetchData = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const res = await adminAiUsageApiService.getOverview(range);
      setData(res.data.data);
    } catch (err) {
      setError(err?.response?.data?.message || t('adminAiUsage.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t, range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const summary = data?.summary || {};
  const timeline = useMemo(() => data?.timeline || [], [data]);
  const byPlan = data?.byPlan || [];
  const byFeature = data?.byFeature || [];
  const byModel = data?.byModel || [];
  const topUsers = data?.topUsers || [];
  const pricingWarning = data?.pricingWarning || null;
  const usdVndRate = data?.usdVndRate || 24000;
  const rangeOptions = [
    { value: 'month', label: t('adminAiUsage.range.month') },
    { value: '30d', label: t('adminAiUsage.range.last30') },
  ];

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-72 animate-pulse rounded-xl bg-gray-100" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-32 animate-pulse rounded-2xl bg-gray-100" />)}
        </div>
        <div className="h-80 animate-pulse rounded-2xl bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('adminAiUsage.title')}</h1>
          <p className="mt-1 text-gray-500">{t('adminAiUsage.description')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-gray-200 bg-white p-1">
            {rangeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRange(option.value)}
                aria-pressed={range === option.value}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${range === option.value ? 'bg-orange-50 text-orange-700' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={fetchData} className="btn btn-secondary" disabled={loading}>
            <HiOutlineRefresh className="mr-2 h-4 w-4" />
            {t('adminAiUsage.refresh')}
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {pricingWarning && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <HiOutlineExclamation className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <p>
            {t('adminAiUsage.unpricedBanner', {
              pct: fmtDecimal(pricingWarning.unpricedCostSharePct),
              models: (pricingWarning.models || [])
                .map((item) => (item.model === '_unknown' ? t('adminAiUsage.modelUnknown') : item.model))
                .join(', '),
            })}
          </p>
        </div>
      )}

      {data?.rangeStart && data?.rangeEnd && (
        <p className="text-xs text-gray-500">
          {t('adminAiUsage.rangeInfo', { from: fmtDay(data.rangeStart), to: fmtDay(data.rangeEnd) })}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <KpiCard
          icon={HiOutlineCash}
          label={t('adminAiUsage.kpi.cost')}
          value={fmtVnd(summary.estimatedCostVnd ?? 0)}
          sub={t('adminAiUsage.kpi.costSub', { usd: fmtUsd(summary.estimatedCostUsd), rate: fmt(usdVndRate) })}
          tone="green"
        />
        <KpiCard
          icon={HiOutlineSparkles}
          label={t('adminAiUsage.kpi.calls')}
          value={fmt(summary.calls)}
          sub={t('adminAiUsage.kpi.callsSub')}
          tone="orange"
        />
        <KpiCard
          icon={HiOutlineTrendingUp}
          label={t('adminAiUsage.kpi.costPerCall')}
          value={fmtVnd(summary.costPerCallVnd)}
          sub={t('adminAiUsage.kpi.costPerCallSub')}
          tone="purple"
        />
        <KpiCard
          icon={HiOutlineUsers}
          label={t('adminAiUsage.kpi.customers')}
          value={fmt(summary.customers)}
          sub={t('adminAiUsage.kpi.customersSub')}
          tone="blue"
        />
      </div>

      <div className="card p-5">
        <SectionHeader title={t('adminAiUsage.timeline')} hint={t('adminAiUsage.timelineHint')} />
        {timeline.length === 0 ? (
          <p className="py-16 text-center text-sm text-gray-400">{t('adminAiUsage.noData')}</p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={timeline} margin={{ top: 8, right: 18, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="bucket" tick={{ fontSize: 11 }} minTickGap={24} tickFormatter={(day) => fmtDay(day).slice(0, 5)} />
              <YAxis tick={{ fontSize: 11 }} width={84} tickFormatter={(value) => fmt(value)} />
              <Tooltip content={<ChartTooltip t={t} />} />
              <Line type="monotone" dataKey="estimatedCostVnd" stroke="#f97316" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="p-5">
          <SectionHeader title={t('adminAiUsage.byFeature')} hint={t('adminAiUsage.byFeatureHint')} />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3">{t('adminAiUsage.feature')}</th>
                <th className="px-5 py-3">{t('adminAiUsage.calls')}</th>
                <th className="px-5 py-3">{t('adminAiUsage.cost')}</th>
                <th className="px-5 py-3">{t('adminAiUsage.costPerCall')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {byFeature.length === 0 && <EmptyRow colSpan={4} text={t('adminAiUsage.noData')} />}
              {byFeature.map((feature) => (
                <tr key={feature.group} className="hover:bg-gray-50">
                  <td className="px-5 py-4 font-semibold text-gray-900">{t(`adminAiUsage.group.${feature.group}`)}</td>
                  <td className="px-5 py-4">{feature.countsAsCall === false ? '—' : fmt(feature.calls)}</td>
                  <td className="px-5 py-4">{fmtVnd(feature.estimatedCostVnd)}</td>
                  <td className="px-5 py-4">{feature.countsAsCall === false ? '—' : fmtVnd(feature.costPerCallVnd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="p-5">
          <SectionHeader title={t('adminAiUsage.byPlan')} hint={t('adminAiUsage.byPlanHint')} />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3">{t('adminAiUsage.plan')}</th>
                <th className="px-5 py-3">{t('adminAiUsage.quota')}</th>
                <th className="px-5 py-3">{t('adminAiUsage.planPrice')}</th>
                <th className="px-5 py-3">{t('adminAiUsage.fullQuota')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {byPlan.length === 0 && <EmptyRow colSpan={4} text={t('adminAiUsage.noData')} />}
              {byPlan.map((plan) => {
                const hasFullQuota = plan.fullQuotaCostVnd !== null && plan.fullQuotaCostVnd !== undefined;
                const hasVsPrice = plan.fullQuotaCostVsPricePct !== null && plan.fullQuotaCostVsPricePct !== undefined;
                // Dùng hết hạn mức mà chi phí AI vượt giá gói = gói lỗ.
                const loss = hasVsPrice && plan.fullQuotaCostVsPricePct > 100;
                return (
                  <tr key={plan.planId || plan.planCode} className="hover:bg-gray-50">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-gray-900">{plan.planName}</p>
                      <p className="text-xs text-gray-400">{plan.planCode} · {t('adminAiUsage.customersUsing', { count: fmt(plan.creditUserCount) })}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p>{plan.aiCreditsPerPeriod > 0 ? t('adminAiUsage.creditsPerPeriod', { count: fmt(plan.aiCreditsPerPeriod) }) : t('adminAiUsage.unlimited')}</p>
                      <p className="text-xs text-gray-400">{t('adminAiUsage.p90Credits', { count: fmt(plan.p90UserCredits), pct: fmtPct(plan.quotaUsagePctAtP90) })}</p>
                      {plan.aiCreditsPerPeriod > 0 && (
                        <p className="text-xs text-gray-400">{t('adminAiUsage.nearLimit', { count: fmt(plan.usersNearLimit) })}</p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {plan.planPriceVnd === 0 ? t('adminAiUsage.free') : fmtVnd(plan.planPriceVnd)}
                    </td>
                    <td className="px-5 py-4" data-testid={`full-quota-${plan.planCode}`}>
                      {!hasFullQuota ? (
                        <p className="text-gray-400">{plan.aiCreditsPerPeriod > 0 ? '—' : t('adminAiUsage.fullUnlimited')}</p>
                      ) : (
                        <>
                          <p className={`font-semibold ${loss ? 'text-red-600' : 'text-gray-900'}`}>≈ {fmtVnd(plan.fullQuotaCostVnd)}</p>
                          {hasVsPrice && (
                            <p className={`text-xs ${loss ? 'font-semibold text-red-600' : 'text-gray-400'}`}>
                              {t('adminAiUsage.fullVsPrice', { pct: fmtDecimal(plan.fullQuotaCostVsPricePct) })}
                              {loss ? ` · ${t('adminAiUsage.fullLoss')}` : ''}
                            </p>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card overflow-hidden">
        <button
          type="button"
          onClick={() => setShowTechnical((open) => !open)}
          aria-expanded={showTechnical}
          className="flex w-full items-center justify-between gap-3 p-5 text-left"
        >
          <span>
            <span className="block text-sm font-semibold text-gray-700">{t('adminAiUsage.technical')}</span>
            <span className="mt-0.5 block text-xs text-gray-400">{t('adminAiUsage.technicalHint')}</span>
          </span>
          <HiOutlineChevronDown className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${showTechnical ? 'rotate-180' : ''}`} />
        </button>

        {showTechnical && (
          <div className="space-y-6 border-t border-gray-100 p-5">
            <div>
              <SectionHeader title={t('adminAiUsage.tokens')} hint={t('adminAiUsage.tokensHint')} />
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-xl bg-gray-50 px-4 py-3">
                  <p className="text-xs text-gray-500">{t('adminAiUsage.totalTokens')}</p>
                  <p className="mt-1 text-lg font-bold text-gray-900">{fmt(summary.totalTokens)}</p>
                </div>
                <div className="rounded-xl bg-gray-50 px-4 py-3">
                  <p className="text-xs text-gray-500">{t('adminAiUsage.promptTokens')}</p>
                  <p className="mt-1 text-lg font-bold text-gray-900">{fmt(summary.promptTokens)}</p>
                </div>
                <div className="rounded-xl bg-gray-50 px-4 py-3">
                  <p className="text-xs text-gray-500">{t('adminAiUsage.outputTokens')}</p>
                  <p className="mt-1 text-lg font-bold text-gray-900">{fmt(summary.outputTokens)}</p>
                </div>
                <div className="rounded-xl bg-gray-50 px-4 py-3">
                  <p className="text-xs text-gray-500">{t('adminAiUsage.thoughtsTokens')}</p>
                  <p className="mt-1 text-lg font-bold text-gray-900">{fmt(summary.thoughtsTokens)}</p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <SectionHeader title={t('adminAiUsage.byModel')} hint={t('adminAiUsage.byModelHint')} />
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-5 py-3">{t('adminAiUsage.model')}</th>
                    <th className="px-5 py-3">{t('adminAiUsage.calls')}</th>
                    <th className="px-5 py-3">{t('adminAiUsage.totalTokens')}</th>
                    <th className="px-5 py-3">{t('adminAiUsage.promptOutputThoughts')}</th>
                    <th className="px-5 py-3">{t('adminAiUsage.cost')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {byModel.length === 0 && <EmptyRow colSpan={5} text={t('adminAiUsage.noData')} />}
                  {byModel.map((row) => (
                    <tr key={row.model} className="hover:bg-gray-50">
                      <td className="px-5 py-4 font-semibold text-gray-900">{row.model === '_unknown' ? t('adminAiUsage.modelUnknown') : row.model}</td>
                      <td className="px-5 py-4">{fmt(row.calls)}</td>
                      <td className="px-5 py-4 font-semibold text-gray-900">{fmt(row.totalTokens)}</td>
                      <td className="px-5 py-4 text-gray-500">{fmt(row.promptTokens)} / {fmt(row.outputTokens)} / {fmt(row.thoughtsTokens)}</td>
                      <td className="px-5 py-4">
                        {fmtVnd(row.estimatedCostVnd)}
                        {!row.priceConfigured && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                            {t('adminAiUsage.priceEstimated')}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto">
              <SectionHeader title={t('adminAiUsage.planTokens')} hint={t('adminAiUsage.planTokensHint')} />
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-5 py-3">{t('adminAiUsage.plan')}</th>
                    <th className="px-5 py-3">{t('adminAiUsage.totalTokens')}</th>
                    <th className="px-5 py-3">{t('adminAiUsage.cost')}</th>
                    <th className="px-5 py-3">{t('adminAiUsage.p90User')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {byPlan.length === 0 && <EmptyRow colSpan={4} text={t('adminAiUsage.noData')} />}
                  {byPlan.map((plan) => (
                    <tr key={plan.planId || plan.planCode} className="hover:bg-gray-50">
                      <td className="px-5 py-4 font-semibold text-gray-900">{plan.planName}</td>
                      <td className="px-5 py-4">{fmt(plan.totalTokens)}</td>
                      <td className="px-5 py-4">{fmtVnd(plan.estimatedCostVnd)}</td>
                      <td className="px-5 py-4">{fmt(plan.p90UserTokens)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto">
              <SectionHeader title={t('adminAiUsage.topUsers')} hint={t('adminAiUsage.topUsersHint')} />
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-5 py-3">{t('adminAiUsage.user')}</th>
                    <th className="px-5 py-3">{t('adminAiUsage.plan')}</th>
                    <th className="px-5 py-3">{t('adminAiUsage.totalTokens')}</th>
                    <th className="px-5 py-3">{t('adminAiUsage.promptOutput')}</th>
                    <th className="px-5 py-3">{t('adminAiUsage.cost')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {topUsers.length === 0 && <EmptyRow colSpan={5} text={t('adminAiUsage.noData')} />}
                  {topUsers.map((user) => (
                    <tr key={user.userId} className="hover:bg-gray-50">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-gray-900">{user.email}</p>
                        <p className="text-xs text-gray-400">ID {user.userId}</p>
                      </td>
                      <td className="px-5 py-4">{user.planCode}</td>
                      <td className="px-5 py-4 font-semibold text-gray-900">{fmt(user.totalTokens)}</td>
                      <td className="px-5 py-4 text-gray-500">{fmt(user.promptTokens)} / {fmt(user.outputTokens)}</td>
                      <td className="px-5 py-4">{fmtVnd(user.estimatedCostVnd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
