import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HiOutlineBeaker,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineExclamationCircle,
  HiOutlineLightningBolt,
  HiOutlineRefresh,
  HiOutlineX,
  HiOutlineDownload,
  HiOutlineShieldCheck,
} from 'react-icons/hi';
import diagnosticApiService from '../../features/admin/diagnostic/services/diagnosticApi.service';
import zaloSettingsApiService from '../../features/settings/services/zaloSettingsApi.service';

const fmtTime = (v) => (v ? new Date(v).toLocaleTimeString('vi-VN') : '—');
const fmtDelay = (ms) => {
  if (ms == null || ms === '') return '—';
  const n = Number(ms);
  if (!Number.isFinite(n)) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`;
  return `${n}ms`;
};

const STATUS_ICON = {
  sent: <HiOutlineCheckCircle className="text-green-500 w-4 h-4" />,
  failed: <HiOutlineExclamationCircle className="text-red-500 w-4 h-4" />,
  skipped: <HiOutlineClock className="text-gray-400 w-4 h-4" />,
  sending: <HiOutlineLightningBolt className="text-yellow-500 w-4 h-4 animate-pulse" />,
  pending: <HiOutlineClock className="text-gray-400 w-4 h-4" />,
};
const STATUS_LABEL = {
  sent: 'Đã gửi',
  failed: 'Thất bại',
  skipped: 'Bỏ qua',
  sending: 'Đang gửi',
  pending: 'Chờ',
};
const CHANNEL_LABELS = {
  zalo_personal: 'Zalo Cá nhân',
  zalo_group: 'Zalo Nhóm',
  email: 'Email',
};
const WAIT_REASON_LABELS = {
  inter_message_delay: 'Chờ delay',
  rate_limited: 'Giới hạn/giờ',
  quiet_hours: 'Giờ im lặng',
  phone_lookup_cooldown: 'Cooldown tra số',
};
const ERROR_CATEGORY_LABELS = {
  PHONE_LOOKUP_RATE_LIMIT: 'Tra số quá nhiều — Zalo tạm khóa tra cứu (~3h)',
  RECIPIENT_NOT_FOUND: 'Số chưa dùng Zalo hoặc sai số',
  TIMEOUT: 'Mạng/Zalo phản hồi chậm',
  ACCOUNT_DISCONNECTED: 'Tài khoản Zalo mất kết nối / hết phiên',
  NOT_FRIEND_OR_BLOCKED: 'Người nhận chặn / chưa là bạn / hạn chế',
  QUIET_HOURS: 'Đang trong khung giờ im lặng Zalo',
  RATE_LIMITED: 'Đã đạt giới hạn gửi theo giờ',
};
const POLL_INTERVAL_MS = 1500;

function avg(values) {
  if (!values.length) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function formatPolicySummary(policy, quietHours) {
  if (!policy) return null;
  const minSec = Math.round((policy.minDelayMs || 0) / 1000);
  const maxSec = Math.round((policy.maxDelayMs || 0) / 1000);
  const limit = policy.limitPerWindow || 100;
  const qh = quietHours
    ? ` · im lặng ${quietHours.start}h–${quietHours.end}h`
    : '';
  return `delay ${minSec}–${maxSec}s random · ${limit} tin/giờ${qh}`;
}

function buildAnalysis(messages) {
  const waitVals = messages.map((m) => m.wait_ms).filter((v) => v != null && v > 0);
  const lookupVals = messages.map((m) => m.lookup_ms).filter((v) => v != null && v >= 0);
  const sendVals = messages.map((m) => m.send_ms).filter((v) => v != null && v >= 0);

  const errorCounts = {};
  messages.forEach((m) => {
    if (!m.error_category) return;
    errorCounts[m.error_category] = (errorCounts[m.error_category] || 0) + 1;
  });

  const avgLookup = avg(lookupVals);
  const avgSend = avg(sendVals);
  const avgWait = avg(waitVals);
  const p95Lookup = percentile(lookupVals, 95);

  let conclusion = 'Chưa đủ dữ liệu timing để kết luận.';
  const parts = [];
  if (avgLookup != null) parts.push(`Tra số TB ${fmtDelay(avgLookup)}`);
  if (avgSend != null) parts.push(`Gửi TB ${fmtDelay(avgSend)}`);
  if (avgWait != null) parts.push(`Chờ TB ${fmtDelay(avgWait)}`);

  if (parts.length) {
    const slowest = [
      { label: 'Tra số', value: avgLookup || 0 },
      { label: 'Gửi', value: avgSend || 0 },
      { label: 'Chờ', value: avgWait || 0 },
    ].sort((a, b) => b.value - a.value)[0];
    conclusion = `${parts.join(' · ')} — chặng chậm nhất: ${slowest.label}.`;
  }

  const errorEntries = Object.entries(errorCounts);
  if (errorEntries.length) {
    const top = errorEntries.sort((a, b) => b[1] - a[1])[0];
    const label = ERROR_CATEGORY_LABELS[top[0]] || top[0];
    conclusion += ` ${top[1]} tin lỗi "${label}".`;
  }

  return {
    avgLookup,
    avgSend,
    avgWait,
    p95Lookup,
    errorCounts,
    conclusion,
  };
}

function TimingStackedBar({ waitMs, lookupMs, sendMs }) {
  const wait = Math.max(0, Number(waitMs) || 0);
  const lookup = Math.max(0, Number(lookupMs) || 0);
  const send = Math.max(0, Number(sendMs) || 0);
  const total = wait + lookup + send;
  if (total <= 0) return <span className="text-gray-300 text-xs">—</span>;

  const pct = (v) => `${Math.max(2, (v / total) * 100)}%`;
  return (
    <div className="space-y-1 min-w-[120px]">
      <div className="flex h-2 rounded-full overflow-hidden bg-gray-100">
        {wait > 0 && <div className="bg-amber-400" style={{ width: pct(wait) }} title={`Chờ ${fmtDelay(wait)}`} />}
        {lookup > 0 && <div className="bg-sky-500" style={{ width: pct(lookup) }} title={`Tra số ${fmtDelay(lookup)}`} />}
        {send > 0 && <div className="bg-emerald-500" style={{ width: pct(send) }} title={`Gửi ${fmtDelay(send)}`} />}
      </div>
      <div className="text-[10px] text-gray-400 tabular-nums">
        {fmtDelay(total)} tổng
      </div>
    </div>
  );
}

function RunStatusBadge({ status }) {
  if (status === 'running') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        Đang chạy
      </span>
    );
  }
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <HiOutlineCheckCircle className="w-3.5 h-3.5" />
        Hoàn tất
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
        <HiOutlineX className="w-3.5 h-3.5" />
        Thất bại
      </span>
    );
  }
  return null;
}

function AnalysisPanel({ messages }) {
  const analysis = useMemo(() => buildAnalysis(messages), [messages]);
  const errorEntries = Object.entries(analysis.errorCounts);

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-800">Phân tích</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>
          <div className="text-xs text-gray-500">Tra số TB / p95</div>
          <div className="font-medium tabular-nums">{fmtDelay(analysis.avgLookup)} / {fmtDelay(analysis.p95Lookup)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Gửi TB</div>
          <div className="font-medium tabular-nums">{fmtDelay(analysis.avgSend)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Chờ TB</div>
          <div className="font-medium tabular-nums">{fmtDelay(analysis.avgWait)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Lỗi theo nhóm</div>
          <div className="font-medium">{errorEntries.length ? `${errorEntries.length} nhóm` : '—'}</div>
        </div>
      </div>
      {errorEntries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {errorEntries.map(([cat, count]) => (
            <span key={cat} className="badge badge-gray text-xs">
              {ERROR_CATEGORY_LABELS[cat] || cat}: {count}
            </span>
          ))}
        </div>
      )}
      <p className="text-sm text-gray-700 leading-relaxed">{analysis.conclusion}</p>
    </div>
  );
}

function RunLog({ run, messages }) {
  const sent = run.sent_count ?? 0;
  const failed = run.failed_count ?? 0;
  const skipped = run.skipped_count ?? 0;
  const total = run.total_count ?? 0;
  const done = sent + failed + skipped;
  const isProduction = run.mode === 'production';

  return (
    <div className="space-y-5">
      {run.status === 'running' && total > 0 && (
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span>Tiến độ</span>
            <span className="tabular-nums">{done} / {total}</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 rounded-full transition-all duration-500"
              style={{ width: `${(done / total) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`badge ${isProduction ? 'badge-warning' : 'badge-gray'}`}>
          {isProduction ? 'Production policy' : 'Fast mode'}
        </span>
        {!isProduction && run.inter_message_delay_ms != null && (
          <span className="text-gray-500">Delay cấu hình: {fmtDelay(run.inter_message_delay_ms)}</span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-gray-800">{total}</div>
          <div className="text-xs text-gray-500 mt-0.5">Tổng</div>
        </div>
        <div className="bg-green-50 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-green-700">{sent}</div>
          <div className="text-xs text-green-600 mt-0.5">Đã gửi</div>
        </div>
        <div className={`${failed > 0 ? 'bg-red-50' : 'bg-gray-50'} rounded-xl p-3 text-center`}>
          <div className={`text-xl font-bold ${failed > 0 ? 'text-red-700' : 'text-gray-800'}`}>{failed}</div>
          <div className={`text-xs mt-0.5 ${failed > 0 ? 'text-red-600' : 'text-gray-500'}`}>Thất bại</div>
        </div>
        <div className={`${skipped > 0 ? 'bg-amber-50' : 'bg-gray-50'} rounded-xl p-3 text-center`}>
          <div className={`text-xl font-bold ${skipped > 0 ? 'text-amber-700' : 'text-gray-800'}`}>{skipped}</div>
          <div className={`text-xs mt-0.5 ${skipped > 0 ? 'text-amber-600' : 'text-gray-500'}`}>Bỏ qua</div>
        </div>
        <div className="bg-blue-50 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-blue-700">{fmtDelay(avg(messages.map((m) => m.delay_ms).filter((v) => v != null)))}</div>
          <div className="text-xs text-blue-600 mt-0.5">Khoảng cách TB</div>
        </div>
      </div>

      <AnalysisPanel messages={messages} />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="pb-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide w-8">#</th>
              <th className="pb-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Số điện thoại</th>
              <th className="pb-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Trạng thái</th>
              <th className="pb-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Chờ</th>
              <th className="pb-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Tra số</th>
              <th className="pb-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Gửi</th>
              <th className="pb-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Tổng</th>
              <th className="pb-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Lỗi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {messages.map((m) => {
              const errorLabel = m.error_category
                ? (ERROR_CATEGORY_LABELS[m.error_category] || m.error_category)
                : null;
              return (
                <tr key={m.seq} className="hover:bg-gray-50/60 transition-colors align-top">
                  <td className="py-2.5 pr-3 text-gray-300 text-xs tabular-nums">{m.seq}</td>
                  <td className="py-2.5 pr-3">
                    <div className="font-mono font-medium text-gray-900">{m.recipient}</div>
                    {m.zalo_name && <div className="text-xs text-gray-400 mt-0.5">{m.zalo_name}</div>}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="flex items-center gap-1.5">
                      {STATUS_ICON[m.status] ?? STATUS_ICON.pending}
                      <span className="text-gray-700">{STATUS_LABEL[m.status] ?? m.status}</span>
                    </span>
                    <div className="text-[11px] text-gray-400 mt-0.5">{fmtTime(m.sent_at)}</div>
                  </td>
                  <td className="py-2.5 pr-3 text-xs">
                    {m.wait_ms != null ? (
                      <div className="space-y-1">
                        <span className="font-mono text-gray-700">{fmtDelay(m.wait_ms)}</span>
                        {m.wait_reason && (
                          <span className="badge badge-gray text-[10px]">{WAIT_REASON_LABELS[m.wait_reason] || m.wait_reason}</span>
                        )}
                      </div>
                    ) : '—'}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs text-gray-600">{fmtDelay(m.lookup_ms)}</td>
                  <td className="py-2.5 pr-3 font-mono text-xs text-gray-600">{fmtDelay(m.send_ms)}</td>
                  <td className="py-2.5 pr-3">
                    <TimingStackedBar waitMs={m.wait_ms} lookupMs={m.lookup_ms} sendMs={m.send_ms} />
                  </td>
                  <td className="py-2.5 text-xs max-w-[200px]">
                    {errorLabel ? (
                      <div className="space-y-1">
                        <span className="text-red-600 font-medium" title={m.error_message || ''}>{errorLabel}</span>
                        {m.attempts > 0 && <div className="text-gray-400">Thử lại: {m.attempts}</div>}
                      </div>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DiagnosticPage() {
  const [zaloAccounts, setZaloAccounts] = useState([]);
  const [channel, setChannel] = useState('zalo_personal');
  const [accountId, setAccountId] = useState('');
  const [runMode, setRunMode] = useState('fast');
  const [messageText, setMessageText] = useState('');
  const [recipientsRaw, setRecipientsRaw] = useState('');
  const [delaySeconds, setDelaySeconds] = useState(10);
  const [maxRecipients, setMaxRecipients] = useState(20);
  const [policySummary, setPolicySummary] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [recentRuns, setRecentRuns] = useState([]);
  const [activeRunId, setActiveRunId] = useState(null);
  const [activeRun, setActiveRun] = useState(null);
  const [activeMessages, setActiveMessages] = useState([]);

  const pollRef = useRef(null);

  const loadPolicy = useCallback(async () => {
    if (runMode !== 'production') {
      setPolicySummary('');
      return;
    }
    try {
      const res = await diagnosticApiService.getPolicy({
        channel,
        accountId: accountId ? Number(accountId) : null,
      });
      const { policy, quietHours } = res.data?.data ?? {};
      setPolicySummary(formatPolicySummary(policy, quietHours) || '');
    } catch {
      setPolicySummary('');
    }
  }, [runMode, channel, accountId]);

  useEffect(() => {
    zaloSettingsApiService.listAccounts()
      .then((res) => {
        const accounts = res.data?.data?.items ?? [];
        setZaloAccounts(accounts);
        if (accounts.length > 0) setAccountId(String(accounts[0].id));
      })
      .catch(() => {});

    diagnosticApiService.getConfig()
      .then((res) => {
        const max = res.data?.data?.maxRecipients;
        if (Number.isFinite(max) && max > 0) setMaxRecipients(max);
      })
      .catch(() => {});

    diagnosticApiService.listRuns()
      .then((res) => setRecentRuns(res.data?.data ?? []))
      .catch(() => {});

    diagnosticApiService.listCampaigns()
      .then((res) => setCampaigns(res.data?.data ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadPolicy();
  }, [loadPolicy]);

  const fetchActiveRun = useCallback(async (runId) => {
    try {
      const res = await diagnosticApiService.getRun(runId);
      const { run, messages } = res.data?.data ?? {};
      if (!run) return;
      setActiveRun(run);
      setActiveMessages(messages ?? []);
      if (run.status !== 'running') {
        clearInterval(pollRef.current);
        pollRef.current = null;
        diagnosticApiService.listRuns()
          .then((r) => setRecentRuns(r.data?.data ?? []))
          .catch(() => {});
      }
    } catch {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!activeRunId) return;
    fetchActiveRun(activeRunId);
    pollRef.current = setInterval(() => fetchActiveRun(activeRunId), POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [activeRunId, fetchActiveRun]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    const recipients = recipientsRaw.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!messageText.trim()) return setFormError('Vui lòng nhập nội dung tin nhắn');
    if (recipients.length === 0) return setFormError('Vui lòng nhập ít nhất 1 số điện thoại');
    if (recipients.length > maxRecipients) {
      return setFormError(`Tối đa ${maxRecipients} số điện thoại mỗi lần test`);
    }
    try {
      setSubmitting(true);
      const res = await diagnosticApiService.createRun({
        channel,
        accountId: accountId ? Number(accountId) : null,
        messageText: messageText.trim(),
        interMessageDelayMs: delaySeconds * 1000,
        recipients,
        mode: runMode,
      });
      const runId = res.data?.data?.runId;
      setActiveRunId(runId);
      setActiveRun(null);
      setActiveMessages([]);
    } catch (err) {
      setFormError(err.response?.data?.message ?? 'Lỗi khi tạo diagnostic run');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrefill = async (campaignId) => {
    if (!campaignId) return;
    setMessageText('');
    setRecipientsRaw('');
    setPrefillLoading(true);
    try {
      const res = await diagnosticApiService.getCampaignPrefill(campaignId);
      const { accountId: prefillAccountId, messageText: prefillMessage, phones } = res.data?.data ?? {};
      if (prefillAccountId) setAccountId(String(prefillAccountId));
      if (prefillMessage) setMessageText(prefillMessage);
      if (phones?.length > 0) setRecipientsRaw(phones.join('\n'));
    } catch {
      // silently ignore
    } finally {
      setPrefillLoading(false);
    }
  };

  const handleSelectRun = (runId) => {
    clearInterval(pollRef.current);
    pollRef.current = null;
    setActiveRunId(runId);
  };

  const needsAccount = channel === 'zalo_personal' || channel === 'zalo_group';
  const inputCls = 'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white';
  const phoneCount = recipientsRaw.split('\n').filter((s) => s.trim()).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-orange-100 shrink-0">
          <HiOutlineBeaker className="w-5 h-5 text-orange-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kiểm tra hiệu năng gửi tin</h1>
          <p className="text-sm text-gray-400">Gửi thực tế với số lượng nhỏ — quan sát timing từng chặng và lỗi dễ hiểu</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card overflow-hidden divide-y divide-gray-100">
        <div className="px-5 py-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-800">Cấu hình test</h2>
          <div className="inline-flex rounded-xl border border-gray-200 p-0.5 bg-gray-50 text-xs">
            <button
              type="button"
              onClick={() => setRunMode('fast')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${runMode === 'fast' ? 'bg-white shadow-sm text-gray-900 font-medium' : 'text-gray-500'}`}
            >
              Fast
            </button>
            <button
              type="button"
              onClick={() => setRunMode('production')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${runMode === 'production' ? 'bg-white shadow-sm text-gray-900 font-medium' : 'text-gray-500'}`}
            >
              Production
            </button>
          </div>
        </div>

        {campaigns.length > 0 && (
          <div className="px-5 py-3 bg-orange-50/40">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-orange-700 flex items-center gap-1.5 shrink-0">
                {prefillLoading
                  ? <HiOutlineRefresh className="w-3.5 h-3.5 animate-spin" />
                  : <HiOutlineDownload className="w-3.5 h-3.5" />}
                Load từ chiến dịch
              </span>
              <select
                value={selectedCampaignId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedCampaignId(id);
                  handlePrefill(id);
                }}
                className="flex-1 border border-orange-200 rounded-xl px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white"
              >
                <option value="">— Chọn chiến dịch để tự động điền —</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.campaign_name} ({c.owner_name || c.owner_email})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="px-5 py-5 space-y-4">
          {runMode === 'production' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex gap-2">
              <HiOutlineShieldCheck className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Chế độ Production — áp policy gửi thật</p>
                {policySummary
                  ? <p className="text-xs mt-1 text-amber-800">{policySummary}</p>
                  : <p className="text-xs mt-1 text-amber-700">Đang tải policy...</p>}
                <p className="text-xs mt-1 text-amber-700/80">
                  Chế độ này mô phỏng policy gửi production (quiet-hours, rate-limit, delay random).
                  Dùng tài khoản Zalo rảnh — không chạy song song với campaign thật trên cùng account.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Kênh gửi</label>
              <select value={channel} onChange={(e) => setChannel(e.target.value)} className={inputCls}>
                <option value="zalo_personal">Zalo Cá nhân</option>
                <option value="zalo_group" disabled>Zalo Nhóm (sắp ra mắt)</option>
                <option value="email" disabled>Email (sắp ra mắt)</option>
              </select>
            </div>

            <div>
              {needsAccount && (
                <>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Tài khoản Zalo</label>
                  {zaloAccounts.length === 0 ? (
                    <p className="text-xs text-red-500 mt-2">Không tìm thấy tài khoản Zalo nào đang kết nối</p>
                  ) : (
                    <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputCls}>
                      {zaloAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.displayName}{a.status !== 'connected' ? ' (chưa kết nối)' : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </>
              )}
            </div>

            <div>
              {runMode === 'fast' ? (
                <>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <label className="text-xs font-medium text-gray-600">Delay giữa tin</label>
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm font-semibold text-primary-600">{delaySeconds}s</span>
                      <span className="text-xs text-gray-400">(production: 20–50s)</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={60}
                    step={1}
                    value={delaySeconds}
                    onChange={(e) => setDelaySeconds(Number(e.target.value))}
                    className="w-full accent-primary-500 mt-1"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>1s</span>
                    <span>60s</span>
                  </div>
                </>
              ) : (
                <div className="h-full flex flex-col justify-center rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-500">
                  Delay do policy production quyết định (không chỉnh tay).
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-600">Số điện thoại</label>
                <span className={`text-xs tabular-nums ${phoneCount > 0 ? 'text-primary-600 font-medium' : 'text-gray-400'}`}>
                  {phoneCount} / {maxRecipients} · mỗi số một dòng
                </span>
              </div>
              <textarea
                value={recipientsRaw}
                onChange={(e) => setRecipientsRaw(e.target.value)}
                rows={5}
                placeholder={'0901234567\n0907654321\n0912345678'}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-mono focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Nội dung tin nhắn</label>
              <textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                rows={5}
                placeholder="Xin chào! Đây là tin nhắn test từ hệ thống..."
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none bg-white"
              />
            </div>
          </div>
        </div>

        <div className="px-5 py-4 bg-gray-50/60 flex items-center justify-between gap-4">
          <div>
            {formError && (
              <p className="text-sm text-red-500 flex items-center gap-1.5">
                <HiOutlineX className="w-4 h-4 shrink-0" /> {formError}
              </p>
            )}
          </div>
          <button type="submit" disabled={submitting} className="btn btn-primary shrink-0">
            {submitting
              ? <><HiOutlineRefresh className="mr-2 w-4 h-4 animate-spin" /> Đang khởi tạo...</>
              : <><HiOutlineLightningBolt className="mr-2 w-4 h-4" /> Chạy test</>}
          </button>
        </div>
      </form>

      <div className="space-y-4">
        {activeRun && (
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="font-semibold text-gray-900 shrink-0">Run #{activeRun.id}</span>
                <span className="text-gray-200">|</span>
                <span className="text-sm text-gray-500 truncate">{CHANNEL_LABELS[activeRun.channel] ?? activeRun.channel}</span>
                <RunStatusBadge status={activeRun.status} />
              </div>
              <span className="text-xs text-gray-400 shrink-0">{fmtTime(activeRun.created_at)}</span>
            </div>
            <div className="p-5">
              <RunLog run={activeRun} messages={activeMessages} />
            </div>
          </div>
        )}

        {!activeRun && recentRuns.length === 0 && (
          <div className="card flex flex-col items-center justify-center text-center gap-4 py-14">
            <div className="p-4 rounded-2xl bg-gray-50">
              <HiOutlineBeaker className="w-8 h-8 text-gray-300" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Kết quả test sẽ hiển thị ở đây</p>
              <p className="text-xs text-gray-400 mt-1">Nhập số điện thoại, tin nhắn rồi bấm &quot;Chạy test&quot;</p>
            </div>
          </div>
        )}

        {recentRuns.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">Các lần test gần đây</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {recentRuns.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handleSelectRun(r.id)}
                  className={`w-full text-left px-5 py-3.5 transition-colors ${
                    activeRunId === r.id ? 'bg-primary-50' : 'hover:bg-gray-50/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="text-gray-400 text-xs tabular-nums">#{r.id}</span>
                        <span className="font-medium text-gray-900">
                          {CHANNEL_LABELS[r.channel] ?? r.channel}
                        </span>
                        {r.mode === 'production' && (
                          <span className="badge badge-warning text-[10px]">Production</span>
                        )}
                        {r.account_display_name && (
                          <span className="text-gray-400 font-normal">· {r.account_display_name}</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2.5 flex-wrap">
                        <span className="tabular-nums">{r.sent_count}/{r.total_count} đã gửi</span>
                        {r.failed_count > 0 && (
                          <span className="text-red-400">{r.failed_count} thất bại</span>
                        )}
                        {r.skipped_count > 0 && (
                          <span className="text-amber-600">{r.skipped_count} bỏ qua</span>
                        )}
                        {r.mode !== 'production' && r.inter_message_delay_ms != null && (
                          <span>delay {r.inter_message_delay_ms / 1000}s</span>
                        )}
                        <span>{fmtTime(r.created_at)}</span>
                      </div>
                    </div>
                    <RunStatusBadge status={r.status} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
