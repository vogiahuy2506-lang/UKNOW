import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineExclamationCircle,
  HiOutlineRefresh,
  HiOutlineServer,
} from 'react-icons/hi';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import adminDeliveryMonitorApiService from '../../features/admin/services/adminDeliveryMonitorApi.service';
import {
  DELIVERY_WINDOWS,
  buildDailySlots,
  countHoursToday,
  formatIsoDayMonth,
  pickTopWaitReason,
} from '../../features/admin/utils/adminDeliveryMonitor.helpers';
import {
  HOURLY_CHART_CHANNELS,
  buildHourlySlots,
  formatVnDayMonthTime,
  formatVnResumeTime,
  formatVnTime,
  getWaitReasonI18nKey,
} from '../../features/campaigns/utils/deliveryMonitor.helpers';
import { useI18n } from '../../i18n';
import { getCampaignTypeMeta } from '../../utils/campaignTypeDisplay';

// PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-6 — cùng khuôn với trang Giám sát của người dùng, phạm vi toàn hệ thống:
// 4 thẻ, biểu đồ, bảng nguyên nhân chưa gửi được, bảng khách gửi nhiều nhất, bảng lượt chạy. Mọi số đến từ MỘT nguồn (bảng
// tin) ở BE; trang này chỉ hiển thị.

const fmt = (value) => Number(value || 0).toLocaleString('vi-VN');

// Khoá cửa sổ 'today' | '7d' | '30d'. Giữ tên biến `windowOptions` / `windowDays` của trang cũ để khối tiêu đề bên dưới
// không phải đổi (một phiên khác đang sửa khối đó).
const windowOptions = DELIVERY_WINDOWS;

// Tự làm mới mỗi phút và CHỈ khi tab đang hiển thị: mỗi lượt là một truy vấn đọc bảng tin toàn hệ thống.
const REFRESH_INTERVAL_MS = 60_000;
const isTabHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

const channelColor = {
  email: '#f97316',
  zalo_personal: '#2563eb',
  zalo_group: '#10b981',
  telegram: '#0ea5e9',
  whatsapp: '#22c55e',
};

const categoryClass = {
  rate_limit: 'badge-warning',
  provider_block: 'badge-error',
  network_timeout: 'badge-gray',
  account_session: 'badge-warning',
  recipient_invalid: 'badge-gray',
  email_provider: 'badge-warning',
  zalo_silent_drop: 'badge-warning',
  other: 'badge-gray',
  unknown: 'badge-gray',
};

const severityClass = {
  critical: 'border-red-100 bg-red-50 text-red-700',
  warning: 'border-amber-100 bg-amber-50 text-amber-700',
};

const KNOWN_RUN_STATUSES = ['running', 'completed', 'stopped', 'failed'];

// Đang chờ KHÔNG đỏ / vàng: chờ hạn mức, giờ yên lặng, SMTP nhả... là vận hành bình thường, không phải sự cố.
const runStatusBadgeClass = (run) => {
  if (run.waitingUntil) return 'badge-gray';
  const status = String(run.status || '').toLowerCase();
  if (status === 'failed') return 'badge-error';
  if (status === 'running') return 'badge-info';
  if (status === 'completed') return 'badge-success';
  return 'badge-gray';
};

const toneMap = {
  green: 'bg-emerald-50 text-emerald-600',
  red: 'bg-red-50 text-red-600',
  neutral: 'bg-gray-100 text-gray-600',
};

const SummaryCard = ({ testId, icon: Icon, label, value, tone = 'green', children }) => (
  <div className="card p-5" data-testid={testId}>
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="truncate text-sm text-gray-500">{label}</p>
        <p className="mt-1 text-2xl font-bold text-gray-900" data-testid={`${testId}-value`}>{value}</p>
        <div className="mt-1 space-y-1 text-xs text-gray-500">{children}</div>
      </div>
      <div className={`rounded-xl p-3 ${toneMap[tone] || toneMap.green}`}>
        <Icon className="h-6 w-6" />
      </div>
    </div>
  </div>
);

const ChartTooltip = ({ active, payload, label, t }) => {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((item) => Number(item.value) > 0);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 text-sm shadow-lg">
      <p className="mb-1 font-semibold text-gray-700">{label}</p>
      {rows.length === 0 ? (
        <p className="text-gray-400">{t('adminDeliveryMonitor.chart.none')}</p>
      ) : rows.map((item) => (
        <p key={item.dataKey} style={{ color: item.color }}>
          {t(`adminDeliveryMonitor.channel.${item.dataKey}`)}: <strong>{fmt(item.value)}</strong>
        </p>
      ))}
    </div>
  );
};

const SignalsBanner = ({ signals, t }) => {
  if (!signals?.length) return null;
  return (
    <div className="space-y-2" data-testid="signals">
      {signals.map((signal, index) => (
        <div key={`${signal.code}-${signal.accountId ?? index}`} className={`rounded-xl border px-4 py-3 text-sm ${severityClass[signal.level] || severityClass.warning}`}>
          <p className="font-semibold">{t(`adminDeliveryMonitor.signal.${signal.code}`)}</p>
          {signal.accountName && (
            <p className="mt-0.5 text-xs opacity-80">{t('adminDeliveryMonitor.signalAccount', { name: signal.accountName })}</p>
          )}
          {signal.silentDrops != null && signal.attempts != null && (
            <p className="mt-0.5 text-xs opacity-80">{t('adminDeliveryMonitor.signalSilentDropDetail', { drops: fmt(signal.silentDrops), attempts: fmt(signal.attempts) })}</p>
          )}
          {signal.value !== null && signal.value !== undefined && (
            <p className="mt-0.5 text-xs opacity-80">
              {signal.code === 'zalo_silent_drop_high'
                ? t('adminDeliveryMonitor.signalRate', { value: fmt(signal.value) })
                : t('adminDeliveryMonitor.signalValue', { value: fmt(signal.value) })}
            </p>
          )}
        </div>
      ))}
    </div>
  );
};

const ReasonsTable = ({ reasons, t }) => (
  <div className="card overflow-hidden" data-testid="reasons-table">
    <div className="border-b border-gray-100 px-5 py-4">
      <h2 className="text-sm font-semibold text-gray-700">{t('adminDeliveryMonitor.reasons.title')}</h2>
      <p className="mt-0.5 text-xs text-gray-400">{t('adminDeliveryMonitor.reasons.desc')}</p>
    </div>
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-5 py-3">{t('adminDeliveryMonitor.reasons.col.reason')}</th>
            <th className="px-5 py-3">{t('adminDeliveryMonitor.reasons.col.channel')}</th>
            <th className="px-5 py-3">{t('adminDeliveryMonitor.reasons.col.count')}</th>
            <th className="px-5 py-3">{t('adminDeliveryMonitor.reasons.col.lastAt')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {reasons.length === 0 ? (
            <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400">{t('adminDeliveryMonitor.reasons.empty')}</td></tr>
          ) : reasons.map((item, index) => (
            <tr key={`${item.channel}-${item.reason ?? 'none'}-${index}`} data-testid="reason-row">
              <td className="px-5 py-3">
                <span className={`badge mr-2 text-xs ${categoryClass[item.category] || 'badge-gray'}`}>
                  {t(`adminDeliveryMonitor.failureCategory.${item.category}`)}
                </span>
                <span className="text-gray-700" title={item.reason || ''}>
                  {item.reason || t('adminDeliveryMonitor.reasons.unknown')}
                </span>
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-gray-700">{t(`adminDeliveryMonitor.channel.${item.channel}`)}</td>
              <td className="whitespace-nowrap px-5 py-3 font-medium text-red-600" data-testid="reason-count">{fmt(item.count)}</td>
              <td className="whitespace-nowrap px-5 py-3 text-gray-500">{formatVnDayMonthTime(item.lastAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const OwnersTable = ({ owners, onSelectOwner, t }) => (
  <div className="card overflow-hidden" data-testid="owners-table">
    <div className="border-b border-gray-100 px-5 py-4">
      <h2 className="text-sm font-semibold text-gray-700">{t('adminDeliveryMonitor.owners.title')}</h2>
      <p className="mt-0.5 text-xs text-gray-400">{t('adminDeliveryMonitor.owners.desc')}</p>
    </div>
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-5 py-3">{t('adminDeliveryMonitor.owners.col.owner')}</th>
            <th className="px-5 py-3">{t('adminDeliveryMonitor.owners.col.sent')}</th>
            <th className="px-5 py-3">{t('adminDeliveryMonitor.owners.col.failed')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {owners.length === 0 ? (
            <tr><td colSpan={3} className="px-5 py-8 text-center text-gray-400">{t('adminDeliveryMonitor.owners.empty')}</td></tr>
          ) : owners.map((owner) => (
            <tr key={owner.ownerId} data-testid={`owner-row-${owner.ownerId}`}>
              <td className="px-5 py-3">
                <button
                  type="button"
                  onClick={() => onSelectOwner(owner)}
                  title={t('adminDeliveryMonitor.owners.filterTitle')}
                  className="text-left hover:underline focus:outline-none"
                >
                  <span className="font-semibold text-gray-900">{owner.name || `#${owner.ownerId}`}</span>
                  {owner.username && owner.username !== owner.name && (
                    <span className="ml-1.5 text-xs text-gray-400">@{owner.username}</span>
                  )}
                </button>
              </td>
              <td className="whitespace-nowrap px-5 py-3 font-medium text-gray-900" data-testid="owner-sent">{fmt(owner.sent)}</td>
              <td className={`whitespace-nowrap px-5 py-3 ${owner.failed > 0 ? 'font-medium text-red-600' : 'text-gray-400'}`} data-testid="owner-failed">
                {fmt(owner.failed)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const RunsTable = ({ runs, now, t }) => {
  const statusLabel = (run) => {
    if (run.waitingUntil) {
      return t('adminDeliveryMonitor.runs.status.waiting', {
        reason: t(getWaitReasonI18nKey(run.waitingReason)),
        time: formatVnResumeTime(run.waitingUntil, now),
      });
    }
    const status = String(run.status || '').toLowerCase();
    // Trạng thái lạ (dữ liệu cũ) in nguyên chuỗi gốc — in khoá dịch thô còn tệ hơn.
    return KNOWN_RUN_STATUSES.includes(status) ? t(`adminDeliveryMonitor.runs.status.${status}`) : (run.status || '-');
  };

  return (
    <div className="card overflow-hidden" data-testid="runs-table">
      <div className="border-b border-gray-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-gray-700">{t('adminDeliveryMonitor.runs.title')}</h2>
        <p className="mt-0.5 text-xs text-gray-400">{t('adminDeliveryMonitor.runs.desc')}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-3">{t('adminDeliveryMonitor.runs.col.campaign')}</th>
              <th className="px-5 py-3">{t('adminDeliveryMonitor.runs.col.owner')}</th>
              <th className="px-5 py-3">{t('adminDeliveryMonitor.runs.col.startedAt')}</th>
              <th className="px-5 py-3">{t('adminDeliveryMonitor.runs.col.status')}</th>
              <th className="px-5 py-3">{t('adminDeliveryMonitor.runs.col.sent')}</th>
              <th className="px-5 py-3">{t('adminDeliveryMonitor.runs.col.failed')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {runs.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">{t('adminDeliveryMonitor.runs.empty')}</td></tr>
            ) : runs.map((run) => {
              const typeMeta = getCampaignTypeMeta(run.campaignType);
              return (
                <tr key={run.runId} data-testid={`run-row-${run.runId}`}>
                  <td className="px-5 py-3">
                    <p className="font-semibold text-gray-900">{run.campaignName || `#${run.runId}`}</p>
                    <span className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${typeMeta.className}`}>
                      {typeMeta.label}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-700" data-testid="run-owner">
                    <p>{run.ownerName || `#${run.ownerId}`}</p>
                    {run.ownerUsername && run.ownerUsername !== run.ownerName && (
                      <p className="text-xs text-gray-400">@{run.ownerUsername}</p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-gray-700">{formatVnDayMonthTime(run.startedAt)}</td>
                  <td className="px-5 py-3">
                    <span className={`badge text-xs ${runStatusBadgeClass(run)}`} data-testid="run-status">
                      {statusLabel(run)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <span className="font-medium text-gray-900" data-testid="run-sent">
                      {run.planned != null ? `${fmt(run.sent)} / ${fmt(run.planned)}` : fmt(run.sent)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3" data-testid="run-failed">
                    {run.failed > 0 ? <span className="font-medium text-red-600">{fmt(run.failed)}</span> : <span className="text-gray-400">0</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default function AdminDeliveryMonitorPage() {
  const { t } = useI18n();
  const [windowDays, setWindowDays] = useState('today');
  const [includeInternal, setIncludeInternal] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const lastFetchAtRef = useRef(0);
  // Chỉ lượt gọi MỚI NHẤT được ghi vào state: đổi cửa sổ / bộ lọc lúc lượt trước còn chạy thì kết quả cũ phải bị bỏ.
  const requestSeqRef = useRef(0);

  const ownerFilterId = ownerFilter?.id ?? null;

  const fetchData = useCallback(async () => {
    lastFetchAtRef.current = Date.now();
    requestSeqRef.current += 1;
    const seq = requestSeqRef.current;
    setError('');
    setLoading(true);
    try {
      const res = await adminDeliveryMonitorApiService.getOverview({
        window: windowDays,
        includeInternal,
        ownerId: ownerFilterId,
      });
      if (seq !== requestSeqRef.current) return;
      setData(res.data.data);
      setLoading(false);
    } catch (err) {
      if (seq !== requestSeqRef.current) return;
      setError(err?.response?.data?.message || t('adminDeliveryMonitor.loadFailed'));
      setLoading(false);
    }
  }, [t, windowDays, includeInternal, ownerFilterId]);

  useEffect(() => {
    fetchData();
    // Chỉ làm mới khi tab đang hiển thị; quay lại tab sau khi dữ liệu đã cũ hơn một chu kỳ thì làm mới ngay.
    const timerId = setInterval(() => {
      if (!isTabHidden()) fetchData();
    }, REFRESH_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (!isTabHidden() && Date.now() - lastFetchAtRef.current >= REFRESH_INTERVAL_MS) fetchData();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(timerId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [fetchData]);

  const now = useMemo(() => (data?.generatedAt ? new Date(data.generatedAt) : new Date()), [data?.generatedAt]);
  const totals = data?.totals;
  const runs = data?.runs;
  const queue = data?.queue;
  const sentChannels = (totals?.byChannel || []).filter((row) => row.sent > 0);
  const topWaitReason = pickTopWaitReason(runs?.waiting?.reasons);

  const chartSlots = useMemo(() => {
    if (!data) return [];
    if (data.series?.unit === 'hour') {
      return buildHourlySlots(data.series.rows, data.generatedAt, countHoursToday(data.generatedAt));
    }
    return buildDailySlots(data.series?.rows, data.window?.fromDate, data.window?.toDate);
  }, [data]);
  const hasChartData = chartSlots.some((slot) => slot.total > 0);
  const chartTitle = data?.series?.unit === 'hour'
    ? t('adminDeliveryMonitor.chart.hourlyTitle')
    : t('adminDeliveryMonitor.chart.dailyTitle', { days: chartSlots.length });

  const rangeInfo = data?.window
    ? (data.window.fromDate === data.window.toDate
      ? t('adminDeliveryMonitor.rangeToday', { date: formatIsoDayMonth(data.window.toDate) })
      : t('adminDeliveryMonitor.rangeSpan', {
        from: formatIsoDayMonth(data.window.fromDate),
        to: formatIsoDayMonth(data.window.toDate),
      }))
    : '';

  const selectOwner = useCallback((owner) => {
    setOwnerFilter({ id: owner.ownerId, name: owner.name || owner.username || `#${owner.ownerId}` });
  }, []);

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
                {t(`adminDeliveryMonitor.window.${days}`)}
              </button>
            ))}
          </div>
          <button type="button" onClick={fetchData} className="btn btn-secondary" disabled={loading}>
            <HiOutlineRefresh className="mr-2 h-4 w-4" />
            {t('adminDeliveryMonitor.refresh')}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" data-testid="toolbar">
        <label className={`inline-flex items-center gap-2 text-gray-700 ${ownerFilter ? 'opacity-50' : 'cursor-pointer'}`}>
          <input
            type="checkbox"
            data-testid="include-internal"
            className="h-4 w-4 rounded border-gray-300"
            checked={includeInternal}
            disabled={Boolean(ownerFilter)}
            onChange={(event) => setIncludeInternal(event.target.checked)}
          />
          {t('adminDeliveryMonitor.includeInternal')}
        </label>
        {data && !ownerFilter && (
          <span className="text-xs text-gray-500" data-testid="internal-hint">
            {data.filter?.excludedOwnerIds?.length > 0
              ? t('adminDeliveryMonitor.internalExcluded', { ids: data.filter.excludedOwnerIds.join(', ') })
              : t('adminDeliveryMonitor.internalIncluded')}
          </span>
        )}
        {ownerFilter && (
          <span className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700" data-testid="owner-filter">
            {t('adminDeliveryMonitor.ownerFilter', { name: ownerFilter.name })}
            <button
              type="button"
              data-testid="owner-filter-clear"
              onClick={() => setOwnerFilter(null)}
              className="rounded-full px-1.5 text-orange-700 hover:bg-orange-100 focus:outline-none"
              aria-label={t('adminDeliveryMonitor.ownerFilterClear')}
              title={t('adminDeliveryMonitor.ownerFilterClear')}
            >
              ✕
            </button>
          </span>
        )}
        <span className="ml-auto flex flex-wrap items-center gap-x-3 text-xs text-gray-400">
          {rangeInfo && <span data-testid="range-info">{rangeInfo}</span>}
          {data?.generatedAt && (
            <span data-testid="updated-at">{t('adminDeliveryMonitor.updatedAt', { time: formatVnTime(data.generatedAt) })}</span>
          )}
        </span>
      </div>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {data && (
        <>
          <SignalsBanner signals={data.signals || []} t={t} />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              testId="card-sent"
              icon={HiOutlineCheckCircle}
              label={t('adminDeliveryMonitor.cards.sent')}
              value={fmt(totals?.sent)}
              tone="green"
            >
              {sentChannels.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {sentChannels.map((row) => (
                    <span
                      key={row.channel}
                      data-testid="sent-channel-chip"
                      className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600"
                    >
                      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: channelColor[row.channel] }} />
                      {t(`adminDeliveryMonitor.channel.${row.channel}`)} {fmt(row.sent)}
                    </span>
                  ))}
                </div>
              )}
              {totals?.friendRequests?.sent > 0 && (
                <p data-testid="friend-requests-sent">{t('adminDeliveryMonitor.cards.friendRequests', { count: fmt(totals.friendRequests.sent) })}</p>
              )}
            </SummaryCard>

            <SummaryCard
              testId="card-failed"
              icon={HiOutlineExclamationCircle}
              label={t('adminDeliveryMonitor.cards.failed')}
              value={fmt(totals?.failed)}
              tone={totals?.failed > 0 ? 'red' : 'green'}
            >
              {totals?.failedPercent != null && (
                <p data-testid="failed-percent">{t('adminDeliveryMonitor.cards.failedPercent', { percent: totals.failedPercent.toLocaleString('vi-VN') })}</p>
              )}
              <p>{t('adminDeliveryMonitor.cards.failedHint')}</p>
              {totals?.friendRequests?.failed > 0 && (
                <p data-testid="friend-requests-failed">{t('adminDeliveryMonitor.cards.friendRequestsFailed', { count: fmt(totals.friendRequests.failed) })}</p>
              )}
            </SummaryCard>

            <SummaryCard
              testId="card-runs"
              icon={HiOutlineClock}
              label={t('adminDeliveryMonitor.cards.sending')}
              value={fmt(runs?.sending)}
              tone="neutral"
            >
              {runs?.waiting?.count > 0 ? (
                <>
                  <p data-testid="runs-waiting">{t('adminDeliveryMonitor.cards.waiting', { count: fmt(runs.waiting.count) })}</p>
                  {topWaitReason && (
                    <p data-testid="runs-waiting-reason">
                      {t('adminDeliveryMonitor.cards.waitingReason', { reason: t(topWaitReason.i18nKey), count: fmt(topWaitReason.count) })}
                    </p>
                  )}
                </>
              ) : (
                <p data-testid="runs-waiting">{t('adminDeliveryMonitor.cards.waitingNone')}</p>
              )}
              {runs?.failed > 0 ? (
                <p className="font-medium text-red-600" data-testid="runs-failed">{t('adminDeliveryMonitor.cards.runsFailed', { count: fmt(runs.failed) })}</p>
              ) : (
                <p data-testid="runs-failed">{t('adminDeliveryMonitor.cards.runsFailedNone')}</p>
              )}
            </SummaryCard>

            <SummaryCard
              testId="card-system"
              icon={HiOutlineServer}
              label={t('adminDeliveryMonitor.cards.system')}
              value={queue?.available ? fmt((queue.waiting || 0) + (queue.active || 0)) : '—'}
              tone="neutral"
            >
              {queue?.available ? (
                <>
                  <p data-testid="queue-processing">{t('adminDeliveryMonitor.cards.queueProcessing', { count: fmt((queue.waiting || 0) + (queue.active || 0)) })}</p>
                  {queue.delayed > 0 && (
                    <p data-testid="queue-delayed">{t('adminDeliveryMonitor.cards.queueDelayed', { count: fmt(queue.delayed) })}</p>
                  )}
                </>
              ) : (
                <p data-testid="queue-processing">{t('adminDeliveryMonitor.cards.queueUnavailable')}</p>
              )}
              {data.alerts?.open > 0 ? (
                <p data-testid="alerts-open">
                  <Link to="/admin/alerts" className="font-medium text-amber-700 hover:underline">
                    {t('adminDeliveryMonitor.cards.alertsOpen', { count: fmt(data.alerts.open) })}
                  </Link>
                </p>
              ) : (
                <p data-testid="alerts-open">{t('adminDeliveryMonitor.cards.alertsNone')}</p>
              )}
            </SummaryCard>
          </div>

          <div className="card p-5" data-testid="chart-card">
            <h2 className="mb-4 text-sm font-semibold text-gray-700" data-testid="chart-title">{chartTitle}</h2>
            {hasChartData ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartSlots} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={16} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip content={<ChartTooltip t={t} />} />
                  <Legend />
                  {HOURLY_CHART_CHANNELS.map((channel) => (
                    <Bar
                      key={channel}
                      dataKey={channel}
                      name={t(`adminDeliveryMonitor.channel.${channel}`)}
                      stackId="sent"
                      fill={channelColor[channel]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-16 text-center text-sm text-gray-400" data-testid="chart-empty">{t('adminDeliveryMonitor.chart.empty')}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
            <ReasonsTable reasons={data.failureReasons || []} t={t} />
            <OwnersTable owners={data.topOwners || []} onSelectOwner={selectOwner} t={t} />
          </div>

          <RunsTable runs={data.recentRuns || []} now={now} t={t} />
        </>
      )}
    </div>
  );
}
