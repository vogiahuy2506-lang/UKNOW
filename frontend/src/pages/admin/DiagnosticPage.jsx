import { useCallback, useEffect, useRef, useState } from 'react';
import {
  HiOutlineBeaker,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineExclamationCircle,
  HiOutlineLightningBolt,
  HiOutlineRefresh,
  HiOutlineX,
  HiOutlineDownload,
} from 'react-icons/hi';
import diagnosticApiService from '../../features/admin/diagnostic/services/diagnosticApi.service';
import zaloSettingsApiService from '../../features/settings/services/zaloSettingsApi.service';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtTime  = (v) => (v ? new Date(v).toLocaleTimeString('vi-VN') : '—');
const fmtDelay = (ms) => (ms == null ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);

const STATUS_ICON = {
  sent:    <HiOutlineCheckCircle className="text-green-500 w-4 h-4" />,
  failed:  <HiOutlineExclamationCircle className="text-red-500 w-4 h-4" />,
  sending: <HiOutlineLightningBolt className="text-yellow-500 w-4 h-4 animate-pulse" />,
  pending: <HiOutlineClock className="text-gray-400 w-4 h-4" />,
};
const STATUS_LABEL   = { sent: 'Đã gửi', failed: 'Thất bại', sending: 'Đang gửi', pending: 'Chờ' };
const CHANNEL_LABELS = { zalo_personal: 'Zalo Cá nhân', zalo_group: 'Zalo Nhóm', email: 'Email' };
const POLL_INTERVAL_MS = 1500;

// ── RunStatusBadge ────────────────────────────────────────────────────────────
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

// ── RunLog ────────────────────────────────────────────────────────────────────
function RunLog({ run, messages }) {
  const sent   = run.sent_count   ?? 0;
  const failed = run.failed_count ?? 0;
  const total  = run.total_count  ?? 0;
  const done   = sent + failed;
  const avgDelay = (() => {
    const delays = messages.filter((m) => m.delay_ms != null).map((m) => m.delay_ms);
    if (!delays.length) return null;
    return Math.round(delays.reduce((a, b) => a + b, 0) / delays.length);
  })();

  return (
    <div className="space-y-5">
      {/* Progress bar */}
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

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
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
        <div className="bg-blue-50 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-blue-700">{fmtDelay(avgDelay)}</div>
          <div className="text-xs text-blue-600 mt-0.5">Delay TB</div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="pb-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide w-8">#</th>
              <th className="pb-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Số điện thoại</th>
              <th className="pb-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Trạng thái</th>
              <th className="pb-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Thời gian</th>
              <th className="pb-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Delay</th>
              <th className="pb-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Lỗi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {messages.map((m) => (
              <tr key={m.seq} className="hover:bg-gray-50/60 transition-colors">
                <td className="py-2.5 pr-3 text-gray-300 text-xs tabular-nums">{m.seq}</td>
                <td className="py-2.5 pr-3 font-mono font-medium text-gray-900">{m.recipient}</td>
                <td className="py-2.5 pr-3">
                  <span className="flex items-center gap-1.5">
                    {STATUS_ICON[m.status] ?? STATUS_ICON.pending}
                    <span className="text-gray-700">{STATUS_LABEL[m.status] ?? m.status}</span>
                  </span>
                </td>
                <td className="py-2.5 pr-3 text-gray-400 text-xs">{fmtTime(m.sent_at)}</td>
                <td className="py-2.5 pr-3 text-gray-500 font-mono text-xs">{fmtDelay(m.delay_ms)}</td>
                <td className="py-2.5 text-red-400 text-xs max-w-[160px] truncate">
                  {m.error_message && `${m.error_code || 'ERR'}: ${m.error_message}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DiagnosticPage() {
  const [zaloAccounts, setZaloAccounts]               = useState([]);
  const [channel, setChannel]                         = useState('zalo_personal');
  const [accountId, setAccountId]                     = useState('');
  const [messageText, setMessageText]                 = useState('');
  const [recipientsRaw, setRecipientsRaw]             = useState('');
  const [delaySeconds, setDelaySeconds]               = useState(10);
  const [submitting, setSubmitting]                   = useState(false);
  const [formError, setFormError]                     = useState('');
  const [campaigns, setCampaigns]                     = useState([]);
  const [selectedCampaignId, setSelectedCampaignId]   = useState('');
  const [prefillLoading, setPrefillLoading]           = useState(false);
  const [recentRuns, setRecentRuns]                   = useState([]);
  const [activeRunId, setActiveRunId]                 = useState(null);
  const [activeRun, setActiveRun]                     = useState(null);
  const [activeMessages, setActiveMessages]           = useState([]);

  const pollRef = useRef(null);

  useEffect(() => {
    zaloSettingsApiService.listAccounts()
      .then((res) => {
        const accounts = res.data?.data?.items ?? [];
        setZaloAccounts(accounts);
        if (accounts.length > 0) setAccountId(String(accounts[0].id));
      })
      .catch(() => {});

    diagnosticApiService.listRuns()
      .then((res) => setRecentRuns(res.data?.data ?? []))
      .catch(() => {});

    diagnosticApiService.listCampaigns()
      .then((res) => setCampaigns(res.data?.data ?? []))
      .catch(() => {});
  }, []);

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
    if (!messageText.trim())       return setFormError('Vui lòng nhập nội dung tin nhắn');
    if (recipients.length === 0)   return setFormError('Vui lòng nhập ít nhất 1 số điện thoại');
    if (recipients.length > 20)    return setFormError('Tối đa 20 số điện thoại mỗi lần test');
    try {
      setSubmitting(true);
      const res = await diagnosticApiService.createRun({
        channel,
        accountId: accountId ? Number(accountId) : null,
        messageText: messageText.trim(),
        interMessageDelayMs: delaySeconds * 1000,
        recipients,
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
      if (prefillAccountId)   setAccountId(String(prefillAccountId));
      if (prefillMessage)     setMessageText(prefillMessage);
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
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-orange-100 shrink-0">
          <HiOutlineBeaker className="w-5 h-5 text-orange-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kiểm tra hiệu năng gửi tin</h1>
          <p className="text-sm text-gray-400">Gửi thực tế với số lượng nhỏ — quan sát timing, delay và lỗi từng tin</p>
        </div>
      </div>

      {/* ── Config Form — full width ── */}
      <form onSubmit={handleSubmit} className="card overflow-hidden divide-y divide-gray-100">
        {/* Title row */}
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-800">Cấu hình test</h2>
        </div>

        {/* Campaign prefill */}
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

        {/* Fields grid */}
        <div className="px-5 py-5 space-y-4">
          {/* Row 1: Kênh + Tài khoản + Delay */}
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
              <div className="flex items-baseline justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-600">Delay giữa tin</label>
                <div className="flex items-baseline gap-1">
                  <span className="text-sm font-semibold text-primary-600">{delaySeconds}s</span>
                  <span className="text-xs text-gray-400">(production: 20–50s)</span>
                </div>
              </div>
              <input
                type="range" min={1} max={60} step={1}
                value={delaySeconds}
                onChange={(e) => setDelaySeconds(Number(e.target.value))}
                className="w-full accent-primary-500 mt-1"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>1s</span>
                <span>60s</span>
              </div>
            </div>
          </div>

          {/* Row 2: SĐT + Nội dung */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-600">Số điện thoại</label>
                <span className={`text-xs tabular-nums ${phoneCount > 0 ? 'text-primary-600 font-medium' : 'text-gray-400'}`}>
                  {phoneCount} / 20 · mỗi số một dòng
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

        {/* Submit footer */}
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

      {/* ── Results Panel ── */}
      <div className="space-y-4">
        {/* Active run */}
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

        {/* Empty state */}
        {!activeRun && recentRuns.length === 0 && (
          <div className="card flex flex-col items-center justify-center text-center gap-4 py-14">
            <div className="p-4 rounded-2xl bg-gray-50">
              <HiOutlineBeaker className="w-8 h-8 text-gray-300" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Kết quả test sẽ hiển thị ở đây</p>
              <p className="text-xs text-gray-400 mt-1">Nhập số điện thoại, tin nhắn rồi bấm "Chạy test"</p>
            </div>
          </div>
        )}

        {/* Recent runs */}
        {recentRuns.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">Các lần test gần đây</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {recentRuns.map((r) => (
                <button
                  key={r.id}
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
                        {r.account_display_name && (
                          <span className="text-gray-400 font-normal">· {r.account_display_name}</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2.5">
                        <span className="tabular-nums">{r.sent_count}/{r.total_count} đã gửi</span>
                        {r.failed_count > 0 && (
                          <span className="text-red-400">{r.failed_count} thất bại</span>
                        )}
                        <span>delay {r.inter_message_delay_ms / 1000}s</span>
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
