import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineQrcode,
  HiOutlineTrash,
  HiOutlineCheckCircle,
  HiOutlineExclamation,
  HiOutlineInformationCircle,
  HiOutlineDeviceMobile,
  HiOutlineIdentification,
  HiOutlineUserCircle,
  HiOutlineLogout,
} from 'react-icons/hi';
import { FaTelegramPlane } from 'react-icons/fa';
import chatbotApi from '../../features/chatbot/services/chatbotApi.service';

/**
 * TelegramSettings — Trang quản lý tài khoản Telegram cá nhân trong
 * Channel Settings. Kết nối duy nhất bằng QR login (Telethon ở Python
 * gateway). Cùng pattern hiển thị với WhatsAppSettings: header → list
 * cards → footer tip.
 */

const STATUS_META = {
  loaded: { label: 'Đã kết nối', cls: 'bg-green-50 text-green-700 border-green-200', dot: 'bg-green-500' },
  active: { label: 'Đang hoạt động', cls: 'bg-green-50 text-green-700 border-green-200', dot: 'bg-green-500' },
  connecting: { label: 'Đang kết nối', cls: 'bg-primary-50 text-primary-700 border-primary-200', dot: 'bg-primary-500 animate-pulse' },
  inactive: { label: 'Ngắt kết nối', cls: 'bg-slate-50 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
};

function StatusPill({ loaded, active }) {
  const key = loaded && active ? 'loaded' : active ? 'active' : 'inactive';
  const meta = STATUS_META[key];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function TelegramAvatar({ name, username }) {
  const letter = (name || username || 'T').trim().charAt(0).toUpperCase();
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-sky-600 text-white font-semibold shadow-sm text-lg">
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

export default function TelegramSettings() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // QR login flow state
  const [qrPayload, setQrPayload] = useState(null); // { sessionId, qrImageBase64, expiresAt }
  const [qrStatus, setQrStatus] = useState('idle'); // idle | awaiting_scan | success | expired | error
  const [qrError, setQrError] = useState(null);
  const pollRef = useRef(null);

  // Row actions
  const [deleting, setDeleting] = useState(null);
  const [loggingOut, setLoggingOut] = useState(null);

  const fetchAccounts = useCallback(async () => {
    try {
      const resp = await chatbotApi.listTelegramAccounts();
      setAccounts(resp?.data || []);
    } catch (err) {
      console.error('[TelegramSettings] fetchAccounts:', err);
      toast.error(err?.message || 'Không thể tải danh sách tài khoản Telegram');
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      await fetchAccounts();
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [fetchAccounts]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAccounts();
    setRefreshing(false);
  }, [fetchAccounts]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback((sessionId) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const resp = await chatbotApi.checkTelegramLoginStatus(sessionId);
        const status = resp?.data?.status;
        if (status === 'awaiting_scan' || status === 'migrating') {
          setQrStatus('awaiting_scan');
          return;
        }
        if (status === 'success') {
          stopPolling();
          setQrStatus('success');
          toast.success('Đã liên kết tài khoản Telegram thành công');
          setQrPayload(null);
          await fetchAccounts();
          return;
        }
        if (status === 'expired' || status === 'error') {
          stopPolling();
          setQrStatus(status);
          setQrError(resp?.data?.error || 'Mã QR đã hết hạn. Vui lòng thử lại.');
          return;
        }
        if (status === 'not_found') {
          stopPolling();
          setQrStatus('expired');
          setQrError('Phiên đăng nhập đã hết hạn trên máy chủ.');
        }
      } catch (err) {
        console.error('[TelegramSettings] poll error:', err);
        stopPolling();
        setQrStatus('error');
        setQrError(err?.message || 'Mất kết nối với máy chủ');
      }
    }, 3000);
  }, [stopPolling, fetchAccounts]);

  const handleStartQrLogin = useCallback(async () => {
    setQrError(null);
    setQrStatus('connecting');
    try {
      const resp = await chatbotApi.initTelegramLogin();
      const data = resp?.data;
      if (!data?.sessionId || !data?.qrImageBase64) {
        throw new Error('Máy chủ không trả về mã QR hợp lệ');
      }
      setQrPayload({
        sessionId: data.sessionId,
        qrImageBase64: data.qrImageBase64,
        expiresAt: data.expiresAt,
      });
      setQrStatus('awaiting_scan');
      startPolling(data.sessionId);
    } catch (err) {
      console.error('[TelegramSettings] initTelegramLogin:', err);
      setQrStatus('error');
      setQrError(err?.message || 'Không thể bắt đầu QR login');
    }
  }, [startPolling]);

  const handleCancelQr = useCallback(async () => {
    stopPolling();
    if (qrPayload?.sessionId) {
      try {
        await chatbotApi.cancelTelegramLogin(qrPayload.sessionId);
      } catch (err) {
        console.warn('[TelegramSettings] cancelTelegramLogin:', err?.message);
      }
    }
    setQrPayload(null);
    setQrStatus('idle');
    setQrError(null);
  }, [qrPayload, stopPolling]);

  const handleDelete = useCallback(async (id) => {
    if (!window.confirm('Xóa vĩnh viễn tài khoản Telegram này? Tất cả cuộc trò chuyện liên quan sẽ bị mất.')) {
      return;
    }
    setDeleting(id);
    try {
      await chatbotApi.deleteTelegramAccount(id);
      toast.success('Đã xóa tài khoản Telegram');
      await fetchAccounts();
    } catch (err) {
      toast.error(err?.message || 'Không thể xóa tài khoản Telegram');
    } finally {
      setDeleting(null);
    }
  }, [fetchAccounts]);

  const handleLogout = useCallback(async (id) => {
    setLoggingOut(id);
    try {
      await chatbotApi.logoutTelegramAccount(id);
      toast.success('Đã ngắt kết nối Telegram');
      await fetchAccounts();
    } catch (err) {
      toast.error(err?.message || 'Không thể ngắt kết nối');
    } finally {
      setLoggingOut(null);
    }
  }, [fetchAccounts]);

  const totalActive = accounts.filter((a) => a.is_active && a.is_loaded).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FaTelegramPlane className="h-6 w-6 text-sky-500" />
            <h2 className="text-lg font-semibold text-slate-900">Telegram cá nhân</h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Liên kết tài khoản Telegram cá nhân qua QR code. Sau khi quét,
            chatbot sẽ tự động trả lời các tin nhắn nhận được trên tài khoản
            này — không cần tạo Telegram Bot.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <HiOutlineQrcode className="h-4 w-4" />
            {refreshing ? 'Đang tải…' : 'Làm mới'}
          </button>
          {!qrPayload && (
            <button
              type="button"
              onClick={handleStartQrLogin}
              className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700"
            >
              <HiOutlineQrcode className="h-4 w-4" />
              Kết nối tài khoản Telegram
            </button>
          )}
        </div>
      </div>

      {/* QR login card */}
      {qrPayload && (
        <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-5 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row">
            <div className="flex flex-col items-center">
              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <img
                  src={`data:image/png;base64,${qrPayload.qrImageBase64}`}
                  alt="QR Telegram"
                  className="h-56 w-56"
                />
              </div>
              {qrPayload.expiresAt && (
                <span className="mt-2 text-[11px] text-slate-500">
                  QR hết hạn: {new Date(qrPayload.expiresAt * 1000).toLocaleTimeString('vi-VN')}
                </span>
              )}
            </div>
            <div className="flex-1 space-y-3">
              <h3 className="text-base font-semibold text-slate-900">
                Quét QR bằng Telegram
              </h3>
              <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
                <li>Mở Telegram trên điện thoại.</li>
                <li>Vào <strong>Cài đặt → Thiết bị → Liên kết thiết bị bằng QR</strong>.</li>
                <li>Hướng camera vào mã QR bên trái.</li>
                <li>Sau khi xác nhận, tài khoản sẽ xuất hiện trong danh sách bên dưới.</li>
              </ol>
              <div className="flex items-center gap-2 rounded-md border border-sky-200 bg-white px-3 py-2 text-xs text-sky-700">
                {qrStatus === 'awaiting_scan' ? (
                  <>
                    <span className="h-2 w-2 animate-pulse rounded-full bg-sky-500" />
                    Đang chờ bạn quét QR…
                  </>
                ) : qrStatus === 'success' ? (
                  <>
                    <HiOutlineCheckCircle className="h-4 w-4 text-green-600" />
                    Liên kết thành công.
                  </>
                ) : qrStatus === 'expired' || qrStatus === 'error' ? (
                  <>
                    <HiOutlineExclamation className="h-4 w-4 text-amber-600" />
                    {qrError || 'Mã QR đã hết hạn.'}
                  </>
                ) : (
                  <>
                    <span className="h-2 w-2 animate-pulse rounded-full bg-sky-500" />
                    Đang kết nối tới Telegram gateway…
                  </>
                )}
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleStartQrLogin}
                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Tạo QR mới
                </button>
                <button
                  type="button"
                  onClick={handleCancelQr}
                  className="rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                >
                  Hủy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Account list */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Tài khoản đã liên kết
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              {totalActive}/{accounts.length} đang hoạt động
            </span>
          </h3>
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-500">
            Đang tải…
          </div>
        ) : accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-5 py-12 text-center">
            <FaTelegramPlane className="h-10 w-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">Chưa có tài khoản Telegram nào</p>
            <p className="text-xs text-slate-500">
              Bấm <strong>Kết nối tài khoản Telegram</strong> ở trên để bắt đầu.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-200">
            {accounts.map((acc) => {
              const fullName = [acc.first_name, acc.last_name].filter(Boolean).join(' ');
              const displayName = fullName || acc.username || acc.phone || 'Telegram User';
              return (
                <li key={acc.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <TelegramAvatar name={displayName} username={acc.username} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
                      <StatusPill loaded={acc.is_loaded} active={acc.is_active} />
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {acc.username && (
                        <InfoRow icon={HiOutlineUserCircle} label="Username" value={`@${acc.username}`} />
                      )}
                      {acc.phone && (
                        <InfoRow icon={HiOutlineDeviceMobile} label="Số điện thoại" value={acc.phone} mono />
                      )}
                      <InfoRow
                        icon={HiOutlineIdentification}
                        label="Telegram ID"
                        value={String(acc.telegram_user_id)}
                        mono
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:items-end">
                    {acc.is_active && (
                      <button
                        type="button"
                        onClick={() => handleLogout(acc.id)}
                        disabled={loggingOut === acc.id}
                        className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                      >
                        <HiOutlineLogout className="h-3.5 w-3.5" />
                        {loggingOut === acc.id ? 'Đang ngắt…' : 'Ngắt kết nối'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(acc.id)}
                      disabled={deleting === acc.id}
                      className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    >
                      <HiOutlineTrash className="h-3.5 w-3.5" />
                      {deleting === acc.id ? 'Đang xóa…' : 'Xóa vĩnh viễn'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer tip */}
      <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        <HiOutlineInformationCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <p>
          Mỗi tài khoản Telegram chỉ giữ <strong>một session MTProto</strong> trên Telegram gateway.
          Sau khi liên kết, bạn vào <strong>Chatbot Studio → Deploy</strong> để chọn chatbot
          cho từng tài khoản. Nếu gateway ngưng hoạt động, tài khoản sẽ tự động chuyển sang
          trạng thái "Ngắt kết nối" — bấm "Ngắt kết nối" rồi "Kết nối tài khoản Telegram"
          lại để kết nối lại.
        </p>
      </div>
    </div>
  );
}
