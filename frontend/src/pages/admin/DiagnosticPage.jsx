import { useCallback, useEffect, useRef, useState } from 'react';
import {
  HiOutlineBeaker,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineExclamationCircle,
  HiOutlineLightningBolt,
  HiOutlineRefresh,
  HiOutlineX,
} from 'react-icons/hi';
import diagnosticApiService from '../../features/admin/diagnostic/services/diagnosticApi.service';
import zaloSettingsApiService from '../../features/settings/services/zaloSettingsApi.service';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtTime = (v) => (v ? new Date(v).toLocaleTimeString('vi-VN') : '—');
const fmtDelay = (ms) => (ms == null ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);

const STATUS_ICON = {
  sent:    <HiOutlineCheckCircle className="text-green-500 w-4 h-4" />,
  failed:  <HiOutlineExclamationCircle className="text-red-500 w-4 h-4" />,
  sending: <HiOutlineLightningBolt className="text-yellow-500 w-4 h-4 animate-pulse" />,
  pending: <HiOutlineClock className="text-gray-400 w-4 h-4" />,
};

const STATUS_LABEL = {
  sent: 'Đã gửi', failed: 'Thất bại', sending: 'Đang gửi', pending: 'Chờ',
};

const CHANNEL_LABELS = {
  zalo_personal: 'Zalo Cá nhân',
  zalo_group:    'Zalo Nhóm',
  email:         'Email',
};

const POLL_INTERVAL_MS = 1500;

// ── Sub-components ────────────────────────────────────────────────────────────
function StatCard({ label, value, color = 'gray' }) {
  const colors = {
    gray:  'bg-gray-50 text-gray-700',
    green: 'bg-green-50 text-green-700',
    red:   'bg-red-50 text-red-700',
    blue:  'bg-blue-50 text-blue-700',
  };
  return (
    <div className={`rounded-xl p-4 ${colors[color]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs mt-0.5 opacity-70">{label}</div>
    </div>
  );
}

function RunLog({ run, messages }) {
  const sent   = run.sent_count ?? 0;
  const failed = run.failed_count ?? 0;
  const total  = run.total_count ?? 0;
  const avgDelay = (() => {
    const delays = messages.filter((m) => m.delay_ms != null).map((m) => m.delay_ms);
    if (!delays.length) return null;
    return Math.round(delays.reduce((a, b) => a + b, 0) / delays.length);
  })();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Tổng"         value={total}           color="gray" />
        <StatCard label="Đã gửi"       value={sent}            color="green" />
        <StatCard label="Thất bại"     value={failed}          color={failed > 0 ? 'red' : 'gray'} />
        <StatCard label="Delay TB"     value={fmtDelay(avgDelay)} color="blue" />
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
              <th className="px-4 py-2 text-left w-10">#</th>
              <th className="px-4 py-2 text-left">Số điện thoại</th>
              <th className="px-4 py-2 text-left w-28">Trạng thái</th>
              <th className="px-4 py-2 text-left w-24">Thời gian</th>
              <th className="px-4 py-2 text-left w-24">Delay</th>
              <th className="px-4 py-2 text-left">Lỗi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {messages.map((m) => (
              <tr key={m.seq} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-2 text-gray-400">{m.seq}</td>
                <td className="px-4 py-2 font-mono font-medium">{m.recipient}</td>
                <td className="px-4 py-2">
                  <span className="flex items-center gap-1.5">
                    {STATUS_ICON[m.status] ?? STATUS_ICON.pending}
                    <span>{STATUS_LABEL[m.status] ?? m.status}</span>
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-500">{fmtTime(m.sent_at)}</td>
                <td className="px-4 py-2 text-gray-500">{fmtDelay(m.delay_ms)}</td>
                <td className="px-4 py-2 text-red-500 text-xs">
                  {m.error_message
                    ? <span title={m.error_message}>{m.error_code || 'ERR'}: {m.error_message.slice(0, 60)}{m.error_message.length > 60 ? '…' : ''}</span>
                    : null}
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
  const [zaloAccounts, setZaloAccounts]   = useState([]);
  const [channel, setChannel]             = useState('zalo_personal');
  const [accountId, setAccountId]         = useState('');
  const [messageText, setMessageText]     = useState('');
  const [recipientsRaw, setRecipientsRaw] = useState('');
  const [delaySeconds, setDelaySeconds]   = useState(10);
  const [submitting, setSubmitting]       = useState(false);
  const [formError, setFormError]         = useState('');

  const [recentRuns, setRecentRuns]       = useState([]);
  const [activeRunId, setActiveRunId]     = useState(null);
  const [activeRun, setActiveRun]         = useState(null);
  const [activeMessages, setActiveMessages] = useState([]);

  const pollRef = useRef(null);

  // Load Zalo accounts + recent runs on mount
  useEffect(() => {
    zaloSettingsApiService.listAccounts()
      .then((res) => {
        const accounts = res.data?.data ?? res.data?.accounts ?? [];
        setZaloAccounts(accounts);
        if (accounts.length > 0) setAccountId(String(accounts[0].id));
      })
      .catch(() => {});

    diagnosticApiService.listRuns()
      .then((res) => setRecentRuns(res.data?.data ?? []))
      .catch(() => {});
  }, []);

  // Polling while run is active
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
    const recipients = recipientsRaw
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    if (!messageText.trim()) return setFormError('Vui lòng nhập nội dung tin nhắn');
    if (recipients.length === 0) return setFormError('Vui lòng nhập ít nhất 1 số điện thoại');
    if (recipients.length > 20) return setFormError('Tối đa 20 số điện thoại mỗi lần test');

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

  const handleSelectRun = async (runId) => {
    clearInterval(pollRef.current);
    pollRef.current = null;
    setActiveRunId(runId);
  };

  const needsAccount = channel === 'zalo_personal' || channel === 'zalo_group';

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <HiOutlineBeaker className="w-6 h-6 text-orange-500" />
        <div>
          <h1 className="text-xl font-bold text-gray-800">Kiểm tra hiệu năng gửi tin</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gửi thực tế với số lượng nhỏ — quan sát timing, delay và lỗi từng tin</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Form */}
        <form onSubmit={handleSubmit} className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4 h-fit">
          <h2 className="font-semibold text-gray-700">Cấu hình test</h2>

          {/* Channel */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Kênh gửi</label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              <option value="zalo_personal">Zalo Cá nhân</option>
              <option value="zalo_group" disabled>Zalo Nhóm (sắp ra mắt)</option>
              <option value="email" disabled>Email (sắp ra mắt)</option>
            </select>
          </div>

          {/* Zalo account */}
          {needsAccount && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tài khoản Zalo</label>
              {zaloAccounts.length === 0 ? (
                <p className="text-xs text-red-500">Không tìm thấy tài khoản Zalo nào đang kết nối</p>
              ) : (
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                >
                  {zaloAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.display_name} {a.status !== 'connected' ? '(chưa kết nối)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Recipients */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Số điện thoại <span className="text-gray-400">(mỗi số 1 dòng, tối đa 20)</span>
            </label>
            <textarea
              value={recipientsRaw}
              onChange={(e) => setRecipientsRaw(e.target.value)}
              rows={5}
              placeholder={'0901234567\n0907654321\n0912345678'}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
            />
            <p className="text-xs text-gray-400 mt-0.5">
              {recipientsRaw.split('\n').filter((s) => s.trim()).length} số
            </p>
          </div>

          {/* Message */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nội dung tin nhắn</label>
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              rows={4}
              placeholder="Xin chào! Đây là tin nhắn test từ hệ thống..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
            />
          </div>

          {/* Delay */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Delay giữa tin: <span className="font-semibold text-orange-600">{delaySeconds}s</span>
              <span className="text-gray-400 ml-1">(production: 20–50s)</span>
            </label>
            <input
              type="range"
              min={1} max={60} step={1}
              value={delaySeconds}
              onChange={(e) => setDelaySeconds(Number(e.target.value))}
              className="w-full accent-orange-500"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-0.5">
              <span>1s (nhanh)</span>
              <span>60s</span>
            </div>
          </div>

          {formError && (
            <p className="text-sm text-red-500 flex items-center gap-1">
              <HiOutlineX className="w-4 h-4" /> {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-medium py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
          >
            {submitting
              ? <><HiOutlineRefresh className="w-4 h-4 animate-spin" /> Đang khởi tạo...</>
              : <><HiOutlineLightningBolt className="w-4 h-4" /> Chạy test</>}
          </button>
        </form>

        {/* Right panel */}
        <div className="lg:col-span-3 space-y-4">
          {/* Active run */}
          {activeRun && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-700">
                    Run #{activeRun.id} — {CHANNEL_LABELS[activeRun.channel] ?? activeRun.channel}
                  </span>
                  {activeRun.status === 'running' && (
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full animate-pulse">Đang chạy</span>
                  )}
                  {activeRun.status === 'completed' && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Hoàn tất</span>
                  )}
                  {activeRun.status === 'failed' && (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Thất bại</span>
                  )}
                </div>
                <span className="text-xs text-gray-400">{fmtTime(activeRun.created_at)}</span>
              </div>
              <RunLog run={activeRun} messages={activeMessages} />
            </div>
          )}

          {/* Recent runs */}
          {recentRuns.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="font-semibold text-gray-700 mb-3">Các lần test gần đây</h2>
              <div className="space-y-2">
                {recentRuns.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => handleSelectRun(r.id)}
                    className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
                      activeRunId === r.id
                        ? 'border-orange-200 bg-orange-50'
                        : 'border-gray-100 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-700">
                        #{r.id} — {CHANNEL_LABELS[r.channel] ?? r.channel}
                        {r.account_display_name && <span className="text-gray-400 font-normal ml-1">({r.account_display_name})</span>}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        r.status === 'completed' ? 'bg-green-100 text-green-700'
                        : r.status === 'failed'  ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
                      }`}>{r.status === 'completed' ? 'Hoàn tất' : r.status === 'failed' ? 'Thất bại' : 'Đang chạy'}</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1 flex gap-3">
                      <span>{r.sent_count}/{r.total_count} đã gửi</span>
                      {r.failed_count > 0 && <span className="text-red-400">{r.failed_count} thất bại</span>}
                      <span>delay {r.inter_message_delay_ms / 1000}s</span>
                      <span>{fmtTime(r.created_at)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
