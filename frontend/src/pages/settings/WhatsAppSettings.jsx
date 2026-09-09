import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineQrcode,
  HiOutlineTrash,
  HiOutlinePencilAlt,
  HiOutlineCheckCircle,
  HiOutlineRefresh,
  HiOutlineClock,
  HiOutlineX,
  HiOutlineExclamation,
  HiOutlineInformationCircle,
  HiOutlineDeviceMobile,
  HiOutlineIdentification,
  HiOutlineKey,
  HiOutlineUserCircle,
} from 'react-icons/hi';
import { FaWhatsapp } from 'react-icons/fa';
import whatsappSettingsApiService from '../../features/settings/services/whatsappSettingsApi.service';

/**
 * WhatsAppSettings — Đồng bộ cam + trắng chủ đạo của hệ thống.
 * Layout đơn giản 1 cột: header → danh sách các card account chi tiết → footer tip.
 * Mỗi session hiển thị như "Quản lý Workspace Zalo": avatar + tên + status pill
 * + grid thông tin (phone, name, jid, session key, người tạo) + actions bên phải.
 * Vẫn chỉ 1 cách kết nối: quét QR bằng WhatsApp cá nhân.
 */

const STATUS_META = {
  open: { label: 'Đã kết nối', cls: 'bg-green-50 text-green-700 border-green-200' },
  connecting: { label: 'Đang kết nối', cls: 'bg-primary-50 text-primary-700 border-primary-200' },
  closed: { label: 'Chưa kết nối', cls: 'bg-slate-50 text-slate-600 border-slate-200' },
  offline: { label: 'Ngoại tuyến', cls: 'bg-slate-50 text-slate-600 border-slate-200' },
};

function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.offline;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${
        status === 'open' ? 'bg-green-500' :
        status === 'connecting' ? 'bg-primary-500 animate-pulse' : 'bg-slate-400'
      }`} />
      {meta.label}
    </span>
  );
}

function PhoneAvatar({ name, phone }) {
  const letter = (name || phone || '?').trim().charAt(0).toUpperCase();
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-400 to-primary-600 text-white font-semibold shadow-sm text-lg">
      {letter}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, mono = false }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span className="text-slate-500 shrink-0">{label}:</span>
      <span className={`truncate text-slate-700 ${mono ? 'font-mono' : 'font-medium'}`} title={value}>
        {value}
      </span>
    </div>
  );
}

export default function WhatsAppSettings() {
  const [sessions, setSessions] = useState([]); // { sessionKey, phone, name, status }
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [qrSessionKey, setQrSessionKey] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [editingNickname, setEditingNickname] = useState(null); // sessionKey đang edit
  const [nicknameInput, setNicknameInput] = useState('');
  const [savingNickname, setSavingNickname] = useState(false);

  // ── fetch active Baileys sessions (dùng AbortController tránh cancel) ──
  const fetchSessions = useCallback(async (signal) => {
    try {
      const res = await whatsappSettingsApiService.listBaileysSessions({ signal });
      const data = Array.isArray(res?.data?.data) ? res.data.data : [];
      setSessions(data);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      console.warn('[WhatsAppSettings] listBaileysSessions:', err.message);
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchSessions(controller.signal).finally(() => setLoading(false));
    return () => controller.abort();
  }, [fetchSessions]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchSessions();
    setRefreshing(false);
  };

  // ── open QR session ────────────────────────────────────────────────────
  // Quy tắc: nếu slot "default" còn trống thì dùng; nếu đã có session (open
  // hoặc connecting) thì tạo slot mới để hỗ trợ nhiều số WhatsApp song song.
  const pickAvailableSlot = useCallback(() => {
    const used = new Set(
      sessions
        .map((s) => s.shortKey || s.sessionKey?.split('-').pop())
        .filter(Boolean)
    );
    if (!used.has('default')) return 'default';
    // Tìm slot dạng default2, default3,... còn trống
    let i = 2;
    while (used.has(`default${i}`) && i < 50) i += 1;
    return i < 50 ? `default${i}` : `default-${Date.now()}`;
  }, [sessions]);

  const handleOpenQr = async () => {
    setConnecting(true);
    const sessionKey = pickAvailableSlot();
    try {
      const res = await whatsappSettingsApiService.openBaileysSession(sessionKey);
      const d = res?.data?.data;
      if (d?.status === 'open') {
        toast.success('Số WhatsApp của bạn đã kết nối.');
        setQrSessionKey(null);
        fetchSessions();
        return;
      }
      setQrSessionKey(sessionKey);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Không thể mở phiên WhatsApp.');
    } finally {
      setConnecting(false);
    }
  };

  // ── delete session ────────────────────────────────────────────────────
  // Lưu ý: s.sessionKey đã được backend prefix sẵn (vd "1-default"); ta chỉ
  // truyền shortKey (vd "default") để backend wrap đúng 1 lần.
  const handleDelete = async (sessionKey) => {
    if (!window.confirm('Ngắt kết nối số WhatsApp này?')) return;
    setDeleting(sessionKey);
    try {
      const shortKey = sessionKey.split('-').slice(1).join('-') || 'default';
      await whatsappSettingsApiService.deleteBaileysSession(shortKey);
      toast.success('Đã ngắt kết nối.');
      fetchSessions();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Không thể ngắt kết nối.');
    } finally {
      setDeleting(null);
    }
  };

  const handleSaveNickname = async (sessionKey) => {
    const shortKey = sessionKey.split('-').slice(1).join('-') || 'default';
    setSavingNickname(true);
    try {
      await whatsappSettingsApiService.updateBaileysSession(shortKey, nicknameInput.trim());
      toast.success('Đã lưu tên hiển thị.');
      setEditingNickname(null);
      fetchSessions();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Không thể lưu tên.');
    } finally {
      setSavingNickname(false);
    }
  };

  const handleStartEditNickname = (s) => {
    setEditingNickname(s.sessionKey);
    setNicknameInput(s.name || '');
  };

  const handleCancelEditNickname = () => {
    setEditingNickname(null);
    setNicknameInput('');
  };

  // ── reconnect existing session (mở lại QR cho slot đã có) ──────────────
  const handleReconnect = async (session) => {
    const shortKey = session.shortKey || session.sessionKey?.split('-').slice(1).join('-') || 'default';
    setConnecting(true);
    setQrSessionKey(shortKey);
    try {
      await whatsappSettingsApiService.openBaileysSession(shortKey);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Không thể mở lại phiên.');
      setQrSessionKey(null);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">WhatsApp</h1>
          <p className="mt-1 text-sm text-slate-500">
            Kết nối số WhatsApp cá nhân bằng mã QR.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:border-primary-200 hover:text-primary-700 disabled:opacity-70"
          >
            <HiOutlineRefresh className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
          <button
            type="button"
            onClick={handleOpenQr}
            disabled={connecting}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <HiOutlineQrcode className="h-4 w-4" />
            {connecting ? 'Đang mở…' : 'Quét QR'}
          </button>
        </div>
      </div>

      {/* ── Accounts list (mỗi session = 1 card riêng, giống Zalo) ──── */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 flex items-center justify-center">
          <span className="h-6 w-6 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-100 text-primary-600">
              <FaWhatsapp className="h-7 w-7" />
            </div>
            <p className="text-sm font-semibold text-slate-900">Chưa có số WhatsApp nào được kết nối</p>
            <p className="mt-1 max-w-xs text-sm text-slate-500">
              Bấm <strong className="text-primary-700">Quét QR</strong> ở trên để liên kết số WhatsApp cá nhân của bạn.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <div
              key={s.sessionKey}
              className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-primary-200"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                {/* Left: avatar + info */}
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <PhoneAvatar name={s.name} phone={s.phone} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-900 truncate">
                        {s.name || s.phone || `WhatsApp #${s.shortKey || '?'}`}
                      </h3>
                      <StatusPill status={s.status} />
                    </div>

                    {/* Detail grid */}
                    <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
                      <InfoRow
                        icon={HiOutlineDeviceMobile}
                        label="Số điện thoại"
                        value={s.phone || '—'}
                      />
                      {/* Tên hiển thị — có nút edit */}
                      <div className="flex items-start gap-1.5">
                        <HiOutlineUserCircle className="mt-px h-4 w-4 shrink-0 text-slate-400" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] text-slate-400 leading-tight">Tên hiển thị</p>
                          {editingNickname === s.sessionKey ? (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <input
                                type="text"
                                maxLength={255}
                                value={nicknameInput}
                                onChange={(e) => setNicknameInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNickname(s.sessionKey); if (e.key === 'Escape') handleCancelEditNickname(); }}
                                className="flex-1 rounded-md border border-slate-300 px-2 py-0.5 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                                placeholder="VD: WhatsApp cá nhân"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveNickname(s.sessionKey)}
                                disabled={savingNickname}
                                className="rounded-md bg-primary-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-60"
                              >
                                Lưu
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelEditNickname}
                                className="rounded-md border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                              >
                                Hủy
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <p className="text-sm text-slate-900 truncate">
                                {s.name || '—'}
                              </p>
                              <button
                                type="button"
                                onClick={() => handleStartEditNickname(s)}
                                className="shrink-0 rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                                title="Đổi tên hiển thị"
                              >
                                <HiOutlinePencilAlt className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      <InfoRow
                        icon={HiOutlineIdentification}
                        label="WhatsApp JID"
                        value={s.phone ? `${s.phone}@s.whatsapp.net` : '—'}
                        mono
                      />
                      <InfoRow
                        icon={HiOutlineKey}
                        label="Session key"
                        value={s.shortKey || s.sessionKey?.split('-').pop() || '—'}
                        mono
                      />
                    </div>
                  </div>
                </div>

                {/* Right: actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {s.status !== 'open' && (
                    <button
                      type="button"
                      onClick={() => handleReconnect(s)}
                      disabled={connecting}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 transition hover:bg-primary-100 disabled:opacity-50"
                    >
                      <HiOutlineQrcode className="h-3.5 w-3.5" />
                      Quét lại
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(s.sessionKey)}
                    disabled={deleting === s.sessionKey}
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    title="Ngắt kết nối & xóa phiên"
                  >
                    {deleting === s.sessionKey ? (
                      <span className="inline-block h-4 w-4 rounded-full border-2 border-red-300 border-t-transparent animate-spin" />
                    ) : (
                      <HiOutlineTrash className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer tip */}
      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        <HiOutlineClock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <p>
          Dùng được với <strong>WhatsApp cá nhân</strong>. Phiên được lưu trên máy chủ — không cần quét lại sau khi khởi động lại.
        </p>
      </div>

      {/* QR Modal (chứa luôn hướng dẫn 4 bước) */}
      {qrSessionKey && (
        <QrModal
          sessionKey={qrSessionKey}
          onClose={() => setQrSessionKey(null)}
          onConnected={() => {
            setQrSessionKey(null);
            fetchSessions();
          }}
        />
      )}
    </div>
  );
}

/* ── QR Modal (compact, primary theme, có hướng dẫn 4 bước bên trong) ── */
function QrModal({ sessionKey, onClose, onConnected }) {
  const [qr, setQr] = useState(null);
  const [status, setStatus] = useState('connecting');
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const poll = async () => {
      try {
        const res = await whatsappSettingsApiService.getBaileysSession(sessionKey);
        const d = res?.data?.data || {};
        if (cancelled) return;
        setStatus(d.status || 'connecting');
        setQr(d.qr || null);
        if (d.status === 'open') {
          setConnected(true);
          toast.success('Đã kết nối WhatsApp!');
          onConnected && onConnected();
          return;
        }
        if (d.status === 'closed') {
          await whatsappSettingsApiService.openBaileysSession(sessionKey);
        }
      } catch (err) {
        if (cancelled) return;
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
        setError(err?.response?.data?.message || err.message);
      }
      if (!cancelled) timer = setTimeout(poll, 2000);
    };

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionKey, onConnected]);

  // Cleanup khi user đóng modal mà CHƯA quét QR — huỷ phiên để khỏi lưu rác.
  // Nếu đã connected thì giữ lại.
  const handleClose = useCallback(async () => {
    if (!connected && status !== 'open') {
      try {
        await whatsappSettingsApiService.disconnectBaileysSession(sessionKey);
      } catch (_) { /* noop - cleanup best effort */ }
    }
    onClose();
  }, [connected, status, sessionKey, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden">
        {/* Modal header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500 text-white">
            <FaWhatsapp className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-slate-900">Quét mã QR để kết nối</h3>
            <p className="text-xs text-slate-500">
              Mở WhatsApp trên điện thoại → Cài đặt → Thiết bị đã liên kết → Liên kết thiết bị
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            title="Đóng"
          >
            <HiOutlineX className="h-4 w-4" />
          </button>
        </div>

        {/* Modal body: QR trái + steps phải */}
        <div className="flex flex-col sm:flex-row gap-6 p-5">
          {/* QR */}
          <div className="rounded-xl border border-slate-200 bg-white w-full sm:w-64 h-64 flex items-center justify-center shrink-0">
            {qr ? (
              <img src={qr} alt="WhatsApp QR" className="w-full h-full p-2" />
            ) : status === 'open' ? (
              <div className="text-center text-green-600">
                <HiOutlineCheckCircle className="w-12 h-12 mx-auto" />
                <p className="mt-2 text-sm font-medium">Đã kết nối!</p>
              </div>
            ) : (
              <div className="text-slate-400 text-sm text-center">
                <HiOutlineRefresh className="w-8 h-8 mx-auto mb-2 animate-spin text-primary-500" />
                Đang tạo mã…
              </div>
            )}
          </div>

          {/* Steps */}
          <div className="space-y-3 text-sm text-slate-700 flex-1">
            <Step n={1} text="Mở app WhatsApp trên điện thoại" />
            <Step n={2} text='Nhấn ⋮ → "Thiết bị đã liên kết"' />
            <Step n={3} text='Chọn "Liên kết thiết bị"' />
            <Step n={4} text="Hướng camera vào mã QR bên trái" />

            {/* Quick tip */}
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 mt-3">
              <HiOutlineInformationCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Nếu đóng cửa sổ mà chưa quét, phiên sẽ được huỷ tự động.
              </span>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                <HiOutlineExclamation className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>

        {/* Modal footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-slate-100 bg-slate-50">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            {connected ? 'Đóng' : 'Huỷ'}
          </button>
          <button
            type="button"
            onClick={() => status !== 'open' && whatsappSettingsApiService.openBaileysSession(sessionKey).catch(() => {})}
            disabled={status === 'open'}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <HiOutlineRefresh className="h-4 w-4" />
            Tạo lại QR
          </button>
        </div>
      </div>
    </div>
  );
}

function Step({ n, text }) {
  return (
    <div className="flex items-start gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-500 text-xs font-semibold text-white">
        {n}
      </span>
      <span>{text}</span>
    </div>
  );
}
