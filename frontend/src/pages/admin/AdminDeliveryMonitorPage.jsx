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
import adminDeliveryMonitorApiService from '../../features/admin/services/adminDeliveryMonitorApi.service';
import { useI18n } from '../../i18n';

const fmt = (value) => Number(value || 0).toLocaleString('vi-VN');
const fmtPct = (value) => `${Number(value || 0).toFixed(1)}%`;
const fmtDateTime = (value) => (value ? new Date(value).toLocaleString('vi-VN') : '-');
const fmtRate = (value) => `${Number(value || 0).toFixed(1)}/min`;
const fmtDrift = (value) => {
  const ms = Math.max(0, Number(value || 0));
  if (!ms) return '0s';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
};

const windowOptions = [7, 30, 90];

const channelColor = {
  email: '#f97316',
  zalo: '#2563eb',
  zalo_group: '#10b981',
};

const severityClass = {
  critical: 'border-red-100 bg-red-50 text-red-700',
  warning: 'border-amber-100 bg-amber-50 text-amber-700',
};

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

const runStatusBadgeClass = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'failed') return 'badge-error';
  if (normalized === 'running') return 'badge-warning';
  if (normalized === 'completed') return 'badge-success';
  if (normalized === 'stopped') return 'badge-gray';
  return 'badge-gray';
};

const runRowClass = (run) => {
  if (run.failedSends > 0) return run.failureRate >= 10 ? 'bg-red-50' : 'bg-orange-50';
  if (run.hasRunError && String(run.status || '').toLowerCase() === 'failed') return 'bg-orange-50';
  if (run.successfulSends > 0) return 'bg-emerald-50/40';
  return '';
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
          {t(`adminDeliveryMonitor.chart.${item.dataKey}`)}: <strong>{fmt(item.value)}</strong>
        </p>
      ))}
    </div>
  );
};

const ChannelPanel = ({ channels, t }) => (
  <div className="card p-5">
    <h2 className="mb-4 text-sm font-semibold text-gray-700">{t('adminDeliveryMonitor.channels')}</h2>
    <div className="space-y-4">
      {channels.map((channel) => {
        const width = Math.min(100, Math.max(0, channel.successRate || 0));
        return (
          <div key={channel.channel} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-gray-900">{t(`adminDeliveryMonitor.channel.${channel.channel}`)}</p>
                <p className="text-xs text-gray-500">
                  {t('adminDeliveryMonitor.channelSub', {
                    sent: fmt(channel.sent),
                    failed: fmt(channel.failed),
                    clicked: fmt(channel.clicked),
                  })}
                </p>
              </div>
              <span className={`badge text-xs ${channel.failed > 0 ? 'badge-warning' : 'badge-success'}`}>
                {fmtPct(channel.successRate)}
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full"
                style={{ width: `${width}%`, backgroundColor: channelColor[channel.channel] || '#f97316' }}
              />
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

const QueuePanel = ({ queue, redis, t }) => {
  const stats = queue?.available === false ? null : queue;
  const items = ['waiting', 'active', 'delayed', 'failed', 'completed'];
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">{t('adminDeliveryMonitor.queue')}</h2>
        <span className={`badge text-xs ${stats ? 'badge-success' : 'badge-gray'}`}>
          {stats ? t('adminDeliveryMonitor.queueConnected') : t('adminDeliveryMonitor.queueUnavailable')}
        </span>
      </div>
      {stats ? (
        <div className="grid grid-cols-5 gap-2">
          {items.map((key) => (
            <div key={key} className="rounded-xl bg-gray-50 px-3 py-2 text-center">
              <p className="text-lg font-bold text-gray-900">{fmt(stats[key])}</p>
              <p className="text-[10px] font-medium text-gray-500">{t(`adminDeliveryMonitor.queueMetric.${key}`)}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">{t('adminDeliveryMonitor.queueHint')}</p>
      )}
      <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-500">
        {redis?.available
          ? t('adminDeliveryMonitor.redisOk', { policy: redis.evictionPolicy || '-' })
          : t('adminDeliveryMonitor.redisUnavailable')}
      </div>
    </div>
  );
};

const AdminHealthPanel = ({ health, t }) => {
  if (!health) return null;
  const { hardBounceCount, zaloDisconnectedCount, pendingRetryCount, zaloSkipCount, zaloQuietHours } = health;
  const items = [
    { label: t('adminDeliveryMonitor.health.hardBounce'), value: fmt(hardBounceCount), warn: hardBounceCount > 0, hint: t('adminDeliveryMonitor.health.hardBounceHint') },
    { label: t('adminDeliveryMonitor.health.zaloDisconnected'), value: fmt(zaloDisconnectedCount), warn: zaloDisconnectedCount > 0, hint: t('adminDeliveryMonitor.health.zaloDisconnectedHint') },
    { label: t('adminDeliveryMonitor.health.pendingRetry'), value: fmt(pendingRetryCount), warn: pendingRetryCount > 0, hint: t('adminDeliveryMonitor.health.pendingRetryHint') },
    { label: t('adminDeliveryMonitor.health.zaloSkip'), value: fmt(zaloSkipCount), warn: zaloSkipCount > 0, hint: t('adminDeliveryMonitor.health.zaloSkipHint') },
  ];
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-700">{t('adminDeliveryMonitor.healthTitle')}</h2>
        {zaloQuietHours?.inQuietHours && (
          <span className="badge badge-warning text-xs">{t('adminDeliveryMonitor.health.quietHoursActive', { start: zaloQuietHours.start, end: zaloQuietHours.end })}</span>
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

const SignalsPanel = ({ signals, t }) => (
  <div className="card p-5">
    <h2 className="mb-4 text-sm font-semibold text-gray-700">{t('adminDeliveryMonitor.signals')}</h2>
    {!signals?.length ? (
      <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
        {t('adminDeliveryMonitor.noSignals')}
      </p>
    ) : (
      <div className="space-y-2">
        {signals.map((signal, index) => (
          <div key={`${signal.code}-${index}`} className={`rounded-xl border px-4 py-3 text-sm ${severityClass[signal.level] || severityClass.warning}`}>
            <p className="font-semibold">{t(`adminDeliveryMonitor.signal.${signal.code}`)}</p>
            {signal.value !== null && signal.value !== undefined && (
              <p className="mt-0.5 text-xs opacity-80">{t('adminDeliveryMonitor.signalValue', { value: fmt(signal.value) })}</p>
            )}
          </div>
        ))}
      </div>
    )}
  </div>
);

const TopRunsTable = ({ runs, t }) => (
  <div className="card overflow-hidden">
    <div className="border-b border-gray-100 px-5 py-4">
      <h2 className="text-sm font-semibold text-gray-700">{t('adminDeliveryMonitor.recentRuns')}</h2>
      <p className="mt-0.5 text-xs text-gray-400">{t('adminDeliveryMonitor.recentRunsDesc')}</p>
    </div>
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-5 py-3">{t('adminDeliveryMonitor.campaign')}</th>
            <th className="px-5 py-3">{t('adminDeliveryMonitor.status')}</th>
            <th className="px-5 py-3">{t('adminDeliveryMonitor.sentFailed')}</th>
            <th className="px-5 py-3">{t('adminDeliveryMonitor.speed')}</th>
            <th className="px-5 py-3">{t('adminDeliveryMonitor.scheduleDrift')}</th>
            <th className="px-5 py-3">{t('adminDeliveryMonitor.failRate')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {runs.length === 0 ? (
            <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">{t('adminDeliveryMonitor.noData')}</td></tr>
          ) : runs.map((run) => (
            <tr key={run.id} className={runRowClass(run)}>
              <td className="px-5 py-3">
                <p className="font-semibold text-gray-900">{run.campaignName || run.runName || `#${run.id}`}</p>
                <p className="text-xs text-gray-400">{fmtDateTime(run.startedAt)}</p>
                {run.hasRunError && run.errorMessage && (
                  <p className="mt-1 line-clamp-1 text-xs text-orange-600" title={run.errorMessage}>{run.errorMessage}</p>
                )}
              </td>
              <td className="px-5 py-3">
                <span className={`badge text-xs ${runStatusBadgeClass(run.status)}`}>
                  {run.status}
                </span>
              </td>
              <td className="px-5 py-3 text-gray-700">
                {(() => {
                  const notAttempted = run.totalRecipients > 0
                    ? Math.max(0, run.totalRecipients - run.successfulSends - run.failedSends - run.skippedSends)
                    : 0;
                  const hasActivity = run.successfulSends > 0 || run.totalRecipients > 0;
                  return (
                    <>
                      {hasActivity ? (
                        <p>
                          <span className={run.successfulSends > 0 ? 'text-emerald-700 font-medium' : 'text-gray-500'}>
                            {fmt(run.successfulSends)}
                          </span>
                          {run.totalRecipients > 0
                            ? <span className="text-gray-400"> / {fmt(run.totalRecipients)}</span>
                            : <span className="text-gray-300 text-xs"> / ?</span>
                          }
                        </p>
                      ) : (
                        <p className="text-gray-400">—</p>
                      )}
                      {(run.failedSends > 0 || run.skippedSends > 0 || notAttempted > 0) && (
                        <p className="mt-0.5 text-xs space-x-1">
                          {run.failedSends > 0 && <span className="text-red-500">· {fmt(run.failedSends)} lỗi</span>}
                          {run.skippedSends > 0 && <span className="text-amber-500">· {fmt(run.skippedSends)} bỏ qua</span>}
                          {notAttempted > 0 && <span className="text-gray-400">· {fmt(notAttempted)} chưa gửi</span>}
                        </p>
                      )}
                    </>
                  );
                })()}
              </td>
              <td className="px-5 py-3 text-gray-700">{fmtRate(run.throughputPerMinute)}</td>
              <td className="px-5 py-3 text-gray-700">
                {run.lastResumeDriftMs !== null && run.lastResumeDriftMs !== undefined ? (
                  <div className="space-y-1">
                    <span className={`badge text-xs ${run.lastResumeDriftMs >= 60000 ? 'badge-warning' : 'badge-success'}`}>
                      +{fmtDrift(run.lastResumeDriftMs)}
                    </span>
                    <p className="text-xs text-gray-400">
                      {run.lastResumeResumedBy || '-'}
                      {run.lastResumeReason ? ` · ${run.lastResumeReason}` : ''}
                    </p>
                    {run.lastResumeExpectedAt && (
                      <p className="text-[11px] text-gray-400">{t('adminDeliveryMonitor.expectedAt', { time: fmtDateTime(run.lastResumeExpectedAt) })}</p>
                    )}
                  </div>
                ) : run.deferredUntil ? (
                  <div className="space-y-1">
                    <span className="badge badge-gray text-xs">{t('adminDeliveryMonitor.deferred')}</span>
                    <p className="text-xs text-gray-400">{fmtDateTime(run.deferredUntil)}</p>
                    {run.deferredReason && <p className="text-[11px] text-gray-400">{run.deferredReason}</p>}
                  </div>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className="px-5 py-3 text-gray-700">
                <span className={run.failureRate >= 10 ? 'font-semibold text-red-600' : ''}>{fmtPct(run.failureRate)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const FailurePanel = ({ failureGroups, recentErrors, t }) => (
  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
    <div className="card p-5">
      <h2 className="mb-4 text-sm font-semibold text-gray-700">{t('adminDeliveryMonitor.failureGroups')}</h2>
      {failureGroups.length === 0 ? (
        <p className="text-sm text-gray-400">{t('adminDeliveryMonitor.noFailures')}</p>
      ) : (
        <div className="space-y-3">
          {failureGroups.map((item, index) => (
            <div key={`${item.message}-${index}`} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className={`badge text-xs ${categoryClass[item.category] || 'badge-gray'}`}>
                  {t(`adminDeliveryMonitor.failureCategory.${item.category}`)}
                </span>
                <span className="text-sm font-bold text-gray-900">{fmt(item.count)}</span>
              </div>
              <p className="line-clamp-2 text-sm text-gray-700">{item.message}</p>
              <p className="mt-1 text-xs text-gray-400">{t(`adminDeliveryMonitor.channel.${item.channel}`)} · {fmtDateTime(item.lastSeenAt)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
    <div className="card p-5">
      <h2 className="mb-4 text-sm font-semibold text-gray-700">{t('adminDeliveryMonitor.recentErrors')}</h2>
      {recentErrors.length === 0 ? (
        <p className="text-sm text-gray-400">{t('adminDeliveryMonitor.noRecentErrors')}</p>
      ) : (
        <div className="space-y-3">
          {recentErrors.map((item) => (
            <div key={item.id} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-900">{item.campaignName || `Run #${item.runId}`}</p>
                  <p className="text-xs text-gray-400">{item.nodeName || item.nodeSubtype || t(`adminDeliveryMonitor.channel.${item.channel}`)}</p>
                </div>
                <span className={`badge shrink-0 text-xs ${categoryClass[item.category] || 'badge-gray'}`}>
                  {t(`adminDeliveryMonitor.failureCategory.${item.category}`)}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-gray-700">{item.errorMessage}</p>
              <p className="mt-1 text-xs text-gray-400">{fmtDateTime(item.updatedAt)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);

export default function AdminDeliveryMonitorPage() {
  const { t } = useI18n();
  const [windowDays, setWindowDays] = useState(7);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const res = await adminDeliveryMonitorApiService.getOverview(windowDays);
      setData(res.data.data);
    } catch (err) {
      setError(err?.response?.data?.message || t('adminDeliveryMonitor.loadFailed'));
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
          <h1 className="text-2xl font-bold text-gray-900">{t('adminDeliveryMonitor.title')}</h1>
          <p className="mt-1 text-gray-500">{t('adminDeliveryMonitor.description')}</p>
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
                {t('adminDeliveryMonitor.days', { days })}
              </button>
            ))}
          </div>
          <button type="button" onClick={fetchData} className="btn btn-secondary" disabled={loading}>
            <HiOutlineRefresh className="mr-2 h-4 w-4" />
            {t('adminDeliveryMonitor.refresh')}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <KpiCard
          icon={HiOutlineCheckCircle}
          label={t('adminDeliveryMonitor.kpi.sent')}
          value={fmt(summary.sent)}
          sub={summary.totalIntended > 0
            ? t('adminDeliveryMonitor.kpi.reachRate', { rate: fmtPct(summary.reachRate), total: fmt(summary.totalIntended) })
            : t('adminDeliveryMonitor.kpi.attempts', { attempts: fmt(summary.attempts) })}
          tone={summary.reachRate !== null && summary.reachRate < 70 ? 'red' : 'green'}
        />
        <KpiCard
          icon={HiOutlineExclamationCircle}
          label={t('adminDeliveryMonitor.kpi.failed')}
          value={fmt(summary.failed)}
          sub={t('adminDeliveryMonitor.kpi.successRate', { rate: fmtPct(summary.successRate) })}
          tone={summary.failed > 0 ? 'red' : 'green'}
        />
        <KpiCard icon={HiOutlineTrendingUp} label={t('adminDeliveryMonitor.kpi.clicked')} value={fmt(summary.clicked)} sub={t('adminDeliveryMonitor.kpi.opened', { opened: fmt(summary.opened) })} tone="blue" />
        <KpiCard
          icon={HiOutlineClock}
          label={t('adminDeliveryMonitor.kpi.runningRuns')}
          value={fmt(summary.runningRuns)}
          sub={t('adminDeliveryMonitor.kpi.runBreakdown', {
            total: fmt(summary.totalRuns),
            failed: fmt(summary.failedRuns),
            completed: fmt(summary.completedRuns),
          })}
          tone={summary.failedRuns > 0 ? 'red' : 'orange'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)]">
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-gray-700">{t('adminDeliveryMonitor.throughput')}</h2>
            <span className="badge badge-gray text-xs">{t('adminDeliveryMonitor.autoRefresh')}</span>
          </div>
          {timeline.length === 0 ? (
            <p className="py-16 text-center text-sm text-gray-400">{t('adminDeliveryMonitor.noData')}</p>
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
        <ChannelPanel channels={data?.channels || []} t={t} />
      </div>

      <AdminHealthPanel health={data?.health} t={t} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <QueuePanel queue={data?.queue} redis={data?.redis} t={t} />
        <SignalsPanel signals={data?.signals || []} t={t} />
      </div>

      <TopRunsTable runs={data?.topRuns || []} t={t} />
      <FailurePanel failureGroups={data?.failureGroups || []} recentErrors={data?.recentErrors || []} t={t} />
    </div>
  );
}
