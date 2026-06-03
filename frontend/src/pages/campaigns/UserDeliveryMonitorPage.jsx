import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineExclamationCircle,
  HiOutlineRefresh,
  HiOutlineTrendingUp,
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
import userDeliveryMonitorApiService from '../../features/campaign/services/userDeliveryMonitorApi.service';
import { useI18n } from '../../i18n';

const fmt = (value) => Number(value || 0).toLocaleString('vi-VN');
const fmtPct = (value) => `${Number(value || 0).toFixed(1)}%`;
const fmtDateTime = (value) => (value ? new Date(value).toLocaleString('vi-VN') : '-');
const fmtRate = (value) => `${Number(value || 0).toFixed(1)}/min`;
const fmtDuration = (seconds) => {
  if (!seconds || seconds < 1) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}g ${m}p`;
  if (m > 0) return `${m}p ${s}s`;
  return `${s}s`;
};

const windowOptions = [7, 30, 90];

const channelColor = { email: '#f97316', zalo: '#2563eb', zalo_group: '#10b981' };

const categoryClass = {
  rate_limit: 'badge-warning',
  provider_block: 'badge-error',
  network_timeout: 'badge-gray',
  account_session: 'badge-warning',
  recipient_invalid: 'badge-gray',
  email_provider: 'badge-warning',
  other: 'badge-gray',
  unknown: 'badge-gray',
};

const KpiCard = ({ icon: Icon, label, value, sub, tone = 'orange' }) => {
  const toneMap = {
    orange: 'bg-orange-50 text-orange-600',
    green: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    red: 'bg-red-50 text-red-600',
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

const CustomTooltip = ({ active, payload, label, t }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 text-sm shadow-lg">
      <p className="mb-1 font-semibold text-gray-700">{label}</p>
      {payload.map((item) => (
        <p key={item.dataKey} style={{ color: item.color }}>
          {t(`userDeliveryMonitor.chart.${item.dataKey}`)}: <strong>{fmt(item.value)}</strong>
        </p>
      ))}
    </div>
  );
};

const HealthPanel = ({ health, t }) => {
  if (!health) return null;
  const { hardBounceCount, zaloDisconnectedCount, pendingRetryCount, zaloSkipCount, zaloQuietHours } = health;
  const items = [
    {
      label: t('userDeliveryMonitor.health.hardBounce'),
      value: fmt(hardBounceCount),
      warn: hardBounceCount > 0,
      hint: t('userDeliveryMonitor.health.hardBounceHint'),
    },
    {
      label: t('userDeliveryMonitor.health.zaloDisconnected'),
      value: fmt(zaloDisconnectedCount),
      warn: zaloDisconnectedCount > 0,
      hint: t('userDeliveryMonitor.health.zaloDisconnectedHint'),
    },
    {
      label: t('userDeliveryMonitor.health.pendingRetry'),
      value: fmt(pendingRetryCount),
      warn: pendingRetryCount > 0,
      hint: t('userDeliveryMonitor.health.pendingRetryHint'),
    },
    {
      label: t('userDeliveryMonitor.health.zaloSkip'),
      value: fmt(zaloSkipCount),
      warn: zaloSkipCount > 0,
      hint: t('userDeliveryMonitor.health.zaloSkipHint'),
    },
  ];
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-700">{t('userDeliveryMonitor.healthTitle')}</h2>
        {zaloQuietHours?.inQuietHours && (
          <span className="badge badge-warning text-xs">{t('userDeliveryMonitor.health.quietHoursActive', { start: zaloQuietHours.start, end: zaloQuietHours.end })}</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className={`rounded-xl border px-4 py-3 text-center ${item.warn ? 'border-amber-100 bg-amber-50' : 'border-gray-100 bg-gray-50'}`}>
            <p className={`text-xl font-bold ${item.warn ? 'text-amber-700' : 'text-gray-900'}`}>{item.value}</p>
            <p className="mt-0.5 text-[11px] font-medium text-gray-600">{item.label}</p>
            <p className="mt-1 text-[10px] text-gray-400 leading-tight">{item.hint}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

const ChannelPanel = ({ channels, channelsRecent, windowDays, t }) => {
  const recentMap = Object.fromEntries((channelsRecent || []).map((c) => [c.channel, c]));
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-700">{t('userDeliveryMonitor.channels')}</h2>
        <span className="text-xs text-gray-400">{t('userDeliveryMonitor.channelWindowHint', { days: windowDays })}</span>
      </div>
      <div className="space-y-4">
        {channels.map((channel) => {
          const recent = recentMap[channel.channel];
          const recentDrop = recent && channel.sent > 0 && recent.sent === 0;
          const width = Math.min(100, Math.max(0, channel.successRate || 0));
          return (
            <div key={channel.channel} className={`rounded-xl border px-4 py-3 ${recentDrop ? 'border-amber-100 bg-amber-50' : 'border-gray-100 bg-gray-50'}`}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-gray-900">{t(`userDeliveryMonitor.channel.${channel.channel}`)}</p>
                  <p className="text-xs text-gray-500">
                    {t('userDeliveryMonitor.channelSub', { sent: fmt(channel.sent), failed: fmt(channel.failed), clicked: fmt(channel.clicked) })}
                  </p>
                  {recent && (
                    <p className={`mt-0.5 text-xs ${recentDrop ? 'font-medium text-amber-600' : 'text-gray-400'}`}>
                      {t('userDeliveryMonitor.channelRecent', { sent: fmt(recent.sent), failed: fmt(recent.failed) })}
                    </p>
                  )}
                </div>
                <span className={`badge shrink-0 text-xs ${recentDrop ? 'badge-warning' : channel.failed > 0 ? 'badge-warning' : 'badge-success'}`}>
                  {fmtPct(channel.successRate)}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: channelColor[channel.channel] || '#f97316' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const runRowClass = (run) => {
  const stuck = run.totalRecipients > 0 && run.successfulSends === 0 && run.status === 'running';
  if (stuck) return 'bg-red-50';
  if (run.status === 'failed') return 'bg-orange-50';
  if (run.successfulSends > 0) return 'bg-emerald-50/40';
  return '';
};

const TopRunsTable = ({ runs, t }) => (
  <div className="card overflow-hidden">
    <div className="border-b border-gray-100 px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">{t('userDeliveryMonitor.topRuns')}</h2>
          <p className="mt-0.5 text-xs text-gray-400">{t('userDeliveryMonitor.topRunsDesc')}</p>
        </div>
        <span className="text-xs text-gray-400">{t('userDeliveryMonitor.topRunsCount', { count: runs.length })}</span>
      </div>
    </div>
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-5 py-3">{t('userDeliveryMonitor.campaign')}</th>
            <th className="px-5 py-3">{t('userDeliveryMonitor.status')}</th>
            <th className="px-5 py-3">{t('userDeliveryMonitor.sentFailed')}</th>
            <th className="px-5 py-3">{t('userDeliveryMonitor.runDuration')}</th>
            <th className="px-5 py-3">{t('userDeliveryMonitor.speed')}</th>
            <th className="px-5 py-3">{t('userDeliveryMonitor.failRate')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {runs.length === 0 ? (
            <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">{t('userDeliveryMonitor.noData')}</td></tr>
          ) : runs.map((run) => (
            <tr key={run.id} className={runRowClass(run)}>
              <td className="px-5 py-3">
                <p className="font-semibold text-gray-900">{run.campaignName || run.runName || `#${run.id}`}</p>
                <p className="text-xs text-gray-400">{fmtDateTime(run.startedAt)}</p>
              </td>
              <td className="px-5 py-3">
                <span className={`badge text-xs ${run.status === 'failed' ? 'badge-error' : run.status === 'running' ? 'badge-warning' : 'badge-success'}`}>
                  {run.status}
                </span>
              </td>
              <td className="px-5 py-3">
                <span className={`font-medium ${run.successfulSends > 0 ? 'text-emerald-700' : 'text-gray-700'}`}>{fmt(run.successfulSends)}</span>
                <span className="text-gray-400"> / {fmt(run.totalRecipients)}</span>
              </td>
              <td className="px-5 py-3 text-gray-700">
                <span>{fmtDuration(run.durationSeconds)}</span>
                {run.completedAt && (
                  <p className="text-xs text-gray-400">{fmtDateTime(run.completedAt)}</p>
                )}
              </td>
              <td className="px-5 py-3 text-gray-700">{fmtRate(run.throughputPerMinute)}</td>
              <td className="px-5 py-3 text-gray-700">{fmtPct(run.failureRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const RecentErrorsPanel = ({ recentErrors, t }) => (
  <div className="card p-5">
    <h2 className="mb-4 text-sm font-semibold text-gray-700">{t('userDeliveryMonitor.recentErrors')}</h2>
    {recentErrors.length === 0 ? (
      <p className="text-sm text-gray-400">{t('userDeliveryMonitor.noRecentErrors')}</p>
    ) : (
      <div className="space-y-3">
        {recentErrors.map((item) => (
          <div key={item.id} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-gray-900">{item.campaignName || `Run #${item.runId}`}</p>
                <p className="text-xs text-gray-400">{item.nodeName || item.nodeSubtype || t(`userDeliveryMonitor.channel.${item.channel}`)}</p>
              </div>
              <span className={`badge shrink-0 text-xs ${categoryClass[item.category] || 'badge-gray'}`}>
                {t(`userDeliveryMonitor.failureCategory.${item.category}`)}
              </span>
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-gray-700">{item.errorMessage}</p>
            <p className="mt-1 text-xs text-gray-400">{fmtDateTime(item.updatedAt)}</p>
          </div>
        ))}
      </div>
    )}
  </div>
);

export default function UserDeliveryMonitorPage() {
  const { t } = useI18n();
  const [windowDays, setWindowDays] = useState(7);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const res = await userDeliveryMonitorApiService.getOverview(windowDays);
      setData(res.data.data);
    } catch (err) {
      setError(err?.response?.data?.message || t('userDeliveryMonitor.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t, windowDays]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 15000);
    return () => clearInterval(id);
  }, [fetchData]);

  const summary = data?.summary || {};
  const timeline = useMemo(() => data?.timeline || [], [data]);

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
          <h1 className="text-2xl font-bold text-gray-900">{t('userDeliveryMonitor.title')}</h1>
          <p className="mt-1 text-gray-500">{t('userDeliveryMonitor.description')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-gray-200 bg-white p-1">
            {windowOptions.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setWindowDays(days)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${windowDays === days ? 'bg-orange-50 text-orange-700' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                {t('userDeliveryMonitor.days', { days })}
              </button>
            ))}
          </div>
          <button type="button" onClick={fetchData} className="btn btn-secondary" disabled={loading}>
            <HiOutlineRefresh className="mr-2 h-4 w-4" />
            {t('userDeliveryMonitor.refresh')}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <KpiCard icon={HiOutlineCheckCircle} label={t('userDeliveryMonitor.kpi.sent')} value={fmt(summary.sent)} sub={t('userDeliveryMonitor.kpi.attempts', { attempts: fmt(summary.attempts) })} tone="green" />
        <KpiCard icon={HiOutlineExclamationCircle} label={t('userDeliveryMonitor.kpi.failed')} value={fmt(summary.failed)} sub={t('userDeliveryMonitor.kpi.successRate', { rate: fmtPct(summary.successRate) })} tone={summary.failed > 0 ? 'red' : 'green'} />
        <KpiCard icon={HiOutlineTrendingUp} label={t('userDeliveryMonitor.kpi.clicked')} value={fmt(summary.clicked)} sub={t('userDeliveryMonitor.kpi.opened', { opened: fmt(summary.opened) })} tone="blue" />
        <KpiCard icon={HiOutlineClock} label={t('userDeliveryMonitor.kpi.runningRuns')} value={fmt(summary.runningRuns)} sub={t('userDeliveryMonitor.kpi.totalRuns', { total: fmt(summary.totalRuns) })} tone="orange" />
      </div>

      <HealthPanel health={data?.health} t={t} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)]">
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-gray-700">{t('userDeliveryMonitor.throughput')}</h2>
            <span className="badge badge-gray text-xs">{t('userDeliveryMonitor.autoRefresh')}</span>
          </div>
          {timeline.length === 0 ? (
            <p className="py-16 text-center text-sm text-gray-400">{t('userDeliveryMonitor.noData')}</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={timeline} margin={{ top: 8, right: 18, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} minTickGap={24} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip t={t} />} />
                <Line type="monotone" dataKey="email" stroke={channelColor.email} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="zalo" stroke={channelColor.zalo} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="zaloGroup" stroke={channelColor.zalo_group} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <ChannelPanel channels={data?.channels || []} channelsRecent={data?.channelsRecent} windowDays={windowDays} t={t} />
      </div>

      <TopRunsTable runs={data?.topRuns || []} t={t} />
      <RecentErrorsPanel recentErrors={data?.recentErrors || []} t={t} />
    </div>
  );
}
