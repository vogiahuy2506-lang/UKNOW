import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HiChevronDown,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineExclamationCircle,
  HiOutlineRefresh,
  HiOutlineServer,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
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
import PageHeader from '../../components/common/PageHeader';
import userDeliveryMonitorApiService from '../../features/campaign/services/userDeliveryMonitorApi.service';
import { useI18n } from '../../i18n';
import { getCampaignTypeMeta } from '../../utils/campaignTypeDisplay';
import {
  HOURLY_CHART_CHANNELS,
  buildHourlySlots,
  formatVnDayMonthTime,
  formatVnResumeTime,
  formatVnTime,
  getWaitReasonI18nKey,
} from '../../features/campaigns/utils/deliveryMonitor.helpers';

// PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-4b — trang trả lời MỘT câu: hôm nay gửi tới đâu rồi, có gì đang kẹt.
// Số theo khoảng thời gian dài thuộc trang Báo cáo; ở đây không có bộ chọn 7/30/90 ngày.

const fmt = (value) => Number(value || 0).toLocaleString('vi-VN');

// Tự làm mới mỗi phút và CHỈ khi tab đang hiển thị (mỗi lượt đọc tin của chủ lớn tốn hàng trăm ms).
const REFRESH_INTERVAL_MS = 60_000;
const isTabHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

const channelColor = {
  email: '#f97316',
  zalo_personal: '#2563eb',
  zalo_group: '#10b981',
  zalo_friend_request: '#8b5cf6',
  telegram: '#0ea5e9',
  whatsapp: '#22c55e',
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
        <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
        <div className="mt-1 space-y-1 text-xs text-gray-500">{children}</div>
      </div>
      <div className={`rounded-xl p-3 ${toneMap[tone] || toneMap.green}`}>
        <Icon className="h-6 w-6" />
      </div>
    </div>
  </div>
);

const HourlyTooltip = ({ active, payload, label, t }) => {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((item) => Number(item.value) > 0);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 text-sm shadow-lg">
      <p className="mb-1 font-semibold text-gray-700">{label}</p>
      {rows.length === 0 ? (
        <p className="text-gray-400">{t('userDeliveryMonitor.hourlyNone')}</p>
      ) : rows.map((item) => (
        <p key={item.dataKey} style={{ color: item.color }}>
          {t(`userDeliveryMonitor.channel.${item.dataKey}`)}: <strong>{fmt(item.value)}</strong>
        </p>
      ))}
    </div>
  );
};

const severityClass = {
  critical: 'border-red-100 bg-red-50 text-red-700',
  warning: 'border-amber-100 bg-amber-50 text-amber-700',
};

const SignalsBanner = ({ signals, t }) => {
  if (!signals?.length) return null;
  return (
    <div className="space-y-2">
      {signals.map((signal, index) => (
        <div key={`${signal.code}-${signal.accountId ?? index}`} className={`rounded-xl border px-4 py-3 text-sm ${severityClass[signal.level] || severityClass.warning}`}>
          <p className="font-semibold">{t(`userDeliveryMonitor.signal.${signal.code}`)}</p>
          {signal.accountName && (
            <p className="mt-0.5 text-xs opacity-80">{t('userDeliveryMonitor.signalAccount', { name: signal.accountName })}</p>
          )}
          {signal.silentDrops != null && signal.attempts != null && (
            <p className="mt-0.5 text-xs opacity-80">{t('userDeliveryMonitor.signalSilentDropDetail', { drops: fmt(signal.silentDrops), attempts: fmt(signal.attempts) })}</p>
          )}
          {signal.value !== null && signal.value !== undefined && (
            <p className="mt-0.5 text-xs opacity-80">{t('userDeliveryMonitor.signalRate', { value: fmt(signal.value) })}</p>
          )}
        </div>
      ))}
    </div>
  );
};

const formatAuditExplanation = (audit, t) => {
  if (!audit) return null;
  const parts = [];
  if (audit.skippedNoRecipient > 0) {
    parts.push(t('userDeliveryMonitor.failures.auditSkippedNoRecipient', { count: audit.skippedNoRecipient }));
  }
  if (audit.skippedAlreadySent > 0) {
    parts.push(t('userDeliveryMonitor.failures.auditSkippedAlreadySent', { count: audit.skippedAlreadySent }));
  }
  if (audit.skippedNotDue > 0) {
    parts.push(t('userDeliveryMonitor.failures.auditSkippedNotDue', { count: audit.skippedNotDue }));
  }
  if (audit.skippedCompleted > 0) {
    parts.push(t('userDeliveryMonitor.failures.auditSkippedCompleted', { count: audit.skippedCompleted }));
  }
  const skippedDetail = parts.length > 0 ? `; ${parts.join(', ')}` : '';
  return t('userDeliveryMonitor.failures.auditSummary', {
    sourceRows: audit.sourceRows ?? 0,
    withRecipient: audit.withRecipient ?? 0,
    attempted: audit.attempted ?? 0,
    skippedDetail,
  });
};

const recipientLabel = (item) => (
  item.recipientDisplay && item.recipientDisplay !== item.recipient
    ? `${item.recipientDisplay} (${item.recipient})`
    : item.recipient
);

/** Danh sách người chưa gửi được của một lượt: mỗi người/bước một dòng, đã trừ lần gửi lại thành công. */
const FailuresDetail = ({ state, failedCount, t }) => {
  if (state?.loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-4 text-xs text-gray-500" data-testid="failures-loading">
        <HiOutlineRefresh className="h-4 w-4 animate-spin text-gray-400" />
        <span>{t('userDeliveryMonitor.failures.loading')}</span>
      </div>
    );
  }
  if (!state?.data) {
    return <p className="py-2 text-xs text-red-500">{state?.error || t('userDeliveryMonitor.failures.loadError')}</p>;
  }

  const items = state.data.failures || [];
  const auditText = state.data.recipientAudit ? formatAuditExplanation(state.data.recipientAudit, t) : null;

  return (
    <div className="space-y-3">
      {auditText && (
        <div
          className="flex items-center gap-2 rounded-lg border border-amber-200/60 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900"
          data-testid="recipient-audit-explanation"
        >
          <HiOutlineExclamationCircle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>{auditText}</span>
        </div>
      )}

      {items.length === 0 ? (
        <p className="py-2 text-xs text-gray-500">{t('userDeliveryMonitor.failures.noFailures')}</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200/80 bg-white shadow-xs">
            <table className="min-w-full text-xs">
              <thead className="border-b border-gray-100 bg-gray-50 text-left font-medium text-gray-500">
                <tr>
                  <th className="px-4 py-2">{t('userDeliveryMonitor.failures.recipient')}</th>
                  <th className="px-4 py-2">{t('userDeliveryMonitor.failures.reason')}</th>
                  <th className="px-4 py-2">{t('userDeliveryMonitor.failures.count')}</th>
                  <th className="px-4 py-2">{t('userDeliveryMonitor.failures.lastAt')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700" data-testid="failures-table-body">
                {items.map((item, idx) => {
                  const reasonText = item.reason || t('userDeliveryMonitor.failures.reasonUnknown');
                  return (
                    <tr key={`${item.channel}-${item.recipient}-${idx}`} className="hover:bg-gray-50/60" data-testid="failure-item-row">
                      <td className="px-4 py-2 font-mono font-medium text-gray-900">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="inline-block h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: channelColor[item.channel] || channelColor.zalo_personal }}
                          />
                          {recipientLabel(item)}
                          {item.channel !== 'email' && (
                            <span
                              data-testid="failure-channel-label"
                              className="rounded bg-gray-100 px-1.5 py-0.5 font-sans text-[10px] font-medium text-gray-600"
                            >
                              {t(`userDeliveryMonitor.channel.${item.channel}`)}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span
                          title={reasonText}
                          className="inline-flex max-w-[28rem] items-center rounded-md border border-red-200/60 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700"
                        >
                          <span className="truncate">{reasonText}</span>
                        </span>
                      </td>
                      <td className="px-4 py-2 font-medium text-gray-800">
                        {t('userDeliveryMonitor.failures.countText', { count: item.attempts || 1 })}
                      </td>
                      <td className="px-4 py-2 text-gray-500">{formatVnDayMonthTime(item.lastAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {failedCount > items.length && (
            <p className="text-xs text-gray-400">{t('userDeliveryMonitor.failures.truncated', { shown: fmt(items.length), total: fmt(failedCount) })}</p>
          )}
        </>
      )}
    </div>
  );
};

const RunsTable = ({ runs, now, t }) => {
  const [expandedRunId, setExpandedRunId] = useState(null);
  const [failuresMap, setFailuresMap] = useState({});

  const toggleRunFailures = useCallback(async (runId) => {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
      return;
    }
    setExpandedRunId(runId);
    if (!failuresMap[runId] || failuresMap[runId].error) {
      setFailuresMap((prev) => ({ ...prev, [runId]: { loading: true, data: null, error: null } }));
      try {
        const res = await userDeliveryMonitorApiService.getRunFailures(runId);
        setFailuresMap((prev) => ({ ...prev, [runId]: { loading: false, data: res.data?.data || null, error: null } }));
      } catch (err) {
        const errMsg = err?.response?.data?.message || t('userDeliveryMonitor.failures.loadError');
        toast.error(errMsg);
        setFailuresMap((prev) => ({ ...prev, [runId]: { loading: false, data: null, error: errMsg } }));
      }
    }
  }, [expandedRunId, failuresMap, t]);

  const statusLabel = (run) => {
    if (run.waitingUntil) {
      return t('userDeliveryMonitor.runStatus.waiting', {
        reason: t(getWaitReasonI18nKey(run.waitingReason)),
        time: formatVnResumeTime(run.waitingUntil, now),
      });
    }
    const status = String(run.status || '').toLowerCase();
    // Trạng thái lạ (dữ liệu cũ) in nguyên chuỗi gốc — in khoá dịch thô còn tệ hơn.
    return KNOWN_RUN_STATUSES.includes(status) ? t(`userDeliveryMonitor.runStatus.${status}`) : (run.status || '-');
  };

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-gray-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-gray-700">{t('userDeliveryMonitor.runsTitle')}</h2>
        <p className="mt-0.5 text-xs text-gray-400">{t('userDeliveryMonitor.runsDesc')}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-3">{t('userDeliveryMonitor.col.campaign')}</th>
              <th className="px-5 py-3">{t('userDeliveryMonitor.col.startedAt')}</th>
              <th className="px-5 py-3">{t('userDeliveryMonitor.col.status')}</th>
              <th className="px-5 py-3">{t('userDeliveryMonitor.col.sent')}</th>
              <th className="px-5 py-3">{t('userDeliveryMonitor.col.failed')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {runs.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">{t('userDeliveryMonitor.runsEmpty')}</td></tr>
            ) : runs.map((run) => {
              const isExpanded = expandedRunId === run.runId;
              const typeMeta = getCampaignTypeMeta(run.campaignType);
              return (
                <Fragment key={run.runId}>
                  <tr data-testid={`run-row-${run.runId}`}>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-gray-900">{run.campaignName || `#${run.runId}`}</p>
                      <span className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${typeMeta.className}`}>
                        {typeMeta.label}
                      </span>
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
                    <td className="px-5 py-3">
                      {run.failed > 0 ? (
                        <button
                          type="button"
                          onClick={() => toggleRunFailures(run.runId)}
                          className="inline-flex cursor-pointer items-center gap-1 font-medium text-red-600 hover:text-red-800 hover:underline focus:outline-none"
                          title={isExpanded ? t('userDeliveryMonitor.failures.hideDetails') : t('userDeliveryMonitor.failures.viewDetails')}
                          aria-label={isExpanded
                            ? t('userDeliveryMonitor.failures.hideLabel', { count: fmt(run.failed) })
                            : t('userDeliveryMonitor.failures.openLabel', { count: fmt(run.failed) })}
                          aria-expanded={isExpanded}
                        >
                          {fmt(run.failed)}
                          <HiChevronDown className={`inline-block h-3.5 w-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-b border-gray-100 bg-slate-50/75" data-testid={`run-failures-row-${run.runId}`}>
                      <td colSpan={5} className="px-5 py-4">
                        <FailuresDetail state={failuresMap[run.runId]} failedCount={run.failed} t={t} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default function UserDeliveryMonitorPage() {
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const lastFetchAtRef = useRef(0);

  const fetchData = useCallback(async () => {
    lastFetchAtRef.current = Date.now();
    setError('');
    setLoading(true);
    try {
      const res = await userDeliveryMonitorApiService.getOverview();
      setData(res.data.data);
    } catch (err) {
      setError(err?.response?.data?.message || t('userDeliveryMonitor.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

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

  const today = data?.today;
  const waiting = data?.waiting;
  const now = useMemo(() => (data?.generatedAt ? new Date(data.generatedAt) : new Date()), [data?.generatedAt]);
  const hourlySlots = useMemo(() => buildHourlySlots(data?.hourly, data?.generatedAt), [data?.hourly, data?.generatedAt]);
  const hasHourlyData = hourlySlots.some((slot) => slot.total > 0);
  const sentChannels = (today?.byChannel || []).filter((row) => row.sent > 0);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-72 animate-pulse rounded-xl bg-gray-100" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[0, 1, 2].map((item) => <div key={item} className="h-32 animate-pulse rounded-2xl bg-gray-100" />)}
        </div>
        <div className="h-80 animate-pulse rounded-2xl bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={HiOutlineServer}
        title={t('userDeliveryMonitor.title')}
        subtitle={t('userDeliveryMonitor.description')}
        actions={(
          <>
            {data?.generatedAt && (
              <span className="text-xs text-gray-400" data-testid="updated-at">
                {t('userDeliveryMonitor.updatedAt', { time: formatVnTime(data.generatedAt) })}
              </span>
            )}
            <button type="button" onClick={fetchData} className="btn btn-secondary" disabled={loading}>
              <HiOutlineRefresh className="mr-2 h-4 w-4" />
              {t('userDeliveryMonitor.refresh')}
            </button>
          </>
        )}
      />

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {data && (
        <>
          <SignalsBanner signals={data.signals || []} t={t} />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <SummaryCard
              testId="card-sent"
              icon={HiOutlineCheckCircle}
              label={t('userDeliveryMonitor.cards.sent')}
              value={fmt(today?.sent)}
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
                      {t(`userDeliveryMonitor.channel.${row.channel}`)} {fmt(row.sent)}
                    </span>
                  ))}
                </div>
              )}
              {today?.friendRequests?.sent > 0 && (
                <p data-testid="friend-requests-sent">{t('userDeliveryMonitor.cards.friendRequests', { count: fmt(today.friendRequests.sent) })}</p>
              )}
            </SummaryCard>

            <SummaryCard
              testId="card-failed"
              icon={HiOutlineExclamationCircle}
              label={t('userDeliveryMonitor.cards.failed')}
              value={fmt(today?.failed)}
              tone={today?.failed > 0 ? 'red' : 'green'}
            >
              <p>{t('userDeliveryMonitor.cards.failedHint')}</p>
              {today?.friendRequests?.failed > 0 && (
                <p data-testid="friend-requests-failed">{t('userDeliveryMonitor.cards.friendRequestsFailed', { count: fmt(today.friendRequests.failed) })}</p>
              )}
            </SummaryCard>

            <SummaryCard
              testId="card-waiting"
              icon={HiOutlineClock}
              label={t('userDeliveryMonitor.cards.waiting')}
              value={fmt(waiting?.count)}
              tone="neutral"
            >
              {waiting?.count > 0 && waiting.first ? (
                <p data-testid="waiting-detail">
                  {t('userDeliveryMonitor.cards.waitingDetail', {
                    count: fmt(waiting.count),
                    reason: t(getWaitReasonI18nKey(waiting.first.waitingReason)),
                    time: formatVnResumeTime(waiting.first.waitingUntil, now),
                  })}
                </p>
              ) : (
                <p>{t('userDeliveryMonitor.cards.waitingNone')}</p>
              )}
              {data.running > 0 && (
                <p data-testid="running-count">{t('userDeliveryMonitor.cards.running', { count: fmt(data.running) })}</p>
              )}
            </SummaryCard>
          </div>

          <div className="card p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">{t('userDeliveryMonitor.hourlyTitle')}</h2>
            {hasHourlyData ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={hourlySlots} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={2} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip content={<HourlyTooltip t={t} />} />
                  <Legend />
                  {HOURLY_CHART_CHANNELS.map((channel) => (
                    <Bar
                      key={channel}
                      dataKey={channel}
                      name={t(`userDeliveryMonitor.channel.${channel}`)}
                      stackId="sent"
                      fill={channelColor[channel]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-16 text-center text-sm text-gray-400">{t('userDeliveryMonitor.hourlyEmpty')}</p>
            )}
          </div>

          <RunsTable runs={data.runs || []} now={now} t={t} />
        </>
      )}
    </div>
  );
}
