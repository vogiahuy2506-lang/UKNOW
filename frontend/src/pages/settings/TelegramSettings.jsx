import axios from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  HiOutlineRefresh,
  HiOutlineX,
} from 'react-icons/hi';
import { FaTelegramPlane } from 'react-icons/fa';
import chatbotApi from '../../features/chatbot/services/chatbotApi.service';
import { useI18n } from '../../i18n';

/**
 * TelegramSettings — Trang quản lý tài khoản Telegram cá nhân trong
 * Channel Settings. Kết nối bằng QR login (MTProto gateway).
 *
 * Redesign (14/09/2026): đồng bộ với hệ thống 2 màu cam (#ee7518) và trắng.
 * QR login được tách thành Modal giống Zalo/WhatsApp: gradient header cam,
 * step guide, countdown timer, smooth animations.
 */

// ── QR Login Modal ─────────────────────────────────────────────────────────────

function QrModal({ open, onClose, qrPayload, qrStatus, qrError, onCancel, onNewQr }) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [countdown, setCountdown] = useState('');

  const guideSteps = [
    {
      title: t('telegramSettings.step1Title'),
      desc: t('telegramSettings.step1Desc'),
    },
    {
      title: t('telegramSettings.step2Title'),
      desc: t('telegramSettings.step2Desc'),
    },
    {
      title: t('telegramSettings.step3Title'),
      desc: t('telegramSettings.step3Desc'),
    },
  ];

  useEffect(() => setMounted(true), []);

  // Countdown: expiresAt là milliseconds Unix timestamp, tính remaining seconds
  useEffect(() => {
    if (!qrPayload?.expiresAt) { setCountdown(''); return; }
    const tick = () => {
      const remaining = Math.max(0, Math.floor((qrPayload.expiresAt - Date.now()) / 1000));
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      setCountdown(mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${secs}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [qrPayload?.expiresAt]);

  const isWaiting = qrStatus === 'awaiting_scan';
  const isSuccess = qrStatus === 'success';
  const isError = qrStatus === 'expired' || qrStatus === 'error';

  if (!open || !mounted) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 px-4"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md mx-auto overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header trắng — đồng bộ với WhatsApp */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500 text-white shrink-0">
            <FaTelegramPlane className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-slate-900">
              {isSuccess ? t('telegramSettings.modalTitleSuccess') : t('telegramSettings.modalTitleScan')}
            </h3>
            <p className="text-xs text-slate-500">
              {isSuccess
                ? t('telegramSettings.modalSubtitleSuccess')
                : t('telegramSettings.modalSubtitleScan')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('telegramSettings.close')}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <HiOutlineX className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col items-center px-5 py-5 gap-4">
          {isSuccess ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
                <HiOutlineCheckCircle className="w-9 h-9 text-green-500" />
              </div>
              <div>
                <p className="text-base font-semibold text-slate-900">{t('telegramSettings.modalTitleSuccess')}</p>
                <p className="text-sm text-slate-500 mt-1">
                  {t('telegramSettings.modalSubtitleSuccess')}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 px-6 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
              >
                {t('telegramSettings.close')}
              </button>
            </div>
          ) : (
            <>
              {/* QR Code */}
              <div className="relative">
                <div className="w-56 h-56 rounded-2xl border-4 border-orange-100 bg-white p-2 shadow-lg overflow-hidden">
                  {qrPayload?.qrImageBase64 ? (
                    <img
                      src={`data:image/png;base64,${qrPayload.qrImageBase64}`}
                      alt="QR Telegram"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="w-8 h-8 border-3 border-orange-400 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                {isWaiting && (
                  <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-orange-500 border-2 border-white flex items-center justify-center">
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  </span>
                )}
              </div>

              {/* Status bar */}
              <div className={`w-full rounded-xl px-4 py-3 text-sm text-center font-medium ${
                isError
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : isWaiting
                  ? 'bg-orange-50 text-orange-700 border border-orange-200'
                  : 'bg-slate-50 text-slate-600 border border-slate-200'
              }`}>
                {isError ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <HiOutlineExclamation className="w-4 h-4 shrink-0" />
                    {qrError || t('telegramSettings.qrExpired')}
                  </span>
                ) : isWaiting ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse shrink-0" />
                    {t('telegramSettings.waitingScan')}
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-slate-400 animate-pulse shrink-0" />
                    {t('telegramSettings.connectingGateway')}
                  </span>
                )}
              </div>

              {/* Countdown */}
              {countdown && !isSuccess && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span>{t('telegramSettings.expiresIn')}</span>
                  <span className="font-mono font-semibold text-orange-600">{countdown}</span>
                </div>
              )}

              {/* Guide steps */}
              <div className="w-full space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('telegramSettings.guideHeading')}</p>
                {guideSteps.map((step, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-orange-100 text-orange-600 text-xs font-bold shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{step.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 w-full">
                <button
                  type="button"
                  onClick={onNewQr}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <HiOutlineRefresh className="w-4 h-4" />
                  {t('telegramSettings.newQr')}
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-5 py-2.5 rounded-xl border border-rose-200 bg-white text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  {t('telegramSettings.cancel')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// ── Account Card ───────────────────────────────────────────────────────────────

function StatusPill({ loaded, active, t }) {
  const key = loaded && active ? 'loaded' : active ? 'active' : 'inactive';
  const metaMap = {
    loaded: {
      label: t('telegramSettings.statusConnected'),
      cls: 'bg-green-50 text-green-700 border-green-200',
      dot: 'bg-green-500',
    },
    active: {
      label: t('telegramSettings.statusActive'),
      cls: 'bg-green-50 text-green-700 border-green-200',
      dot: 'bg-green-500',
    },
    connecting: {
      label: t('telegramSettings.statusConnecting'),
      cls: 'bg-primary-50 text-primary-700 border-primary-200',
      dot: 'bg-primary-500 animate-pulse',
    },
    inactive: {
      label: t('telegramSettings.statusInactive'),
      cls: 'bg-slate-50 text-slate-500 border-slate-200',
      dot: 'bg-slate-400',
    },
  };
  const meta = metaMap[key];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${meta.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function AccountCard({ account, onLogout, onDelete, loggingOut, deleting, t }) {
  const fullName = [account.first_name, account.last_name].filter(Boolean).join(' ');
  const displayName = fullName || account.username || account.phone || 'Telegram User';
  const avatarChar = (displayName || 'T').trim().charAt(0).toUpperCase();

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 hover:border-slate-300 hover:shadow-sm transition-all duration-200">
      <div className="flex items-start gap-3 sm:gap-4">
        {/* Avatar */}
        <div className="w-12 h-12 shrink-0 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-white font-bold text-lg shadow-sm shadow-orange-200">
          {avatarChar}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-slate-900 truncate">{displayName}</p>
            <StatusPill loaded={account.is_loaded} active={account.is_active} t={t} />
          </div>

          <div className="mt-2.5 space-y-1.5">
            {account.username && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <HiOutlineUserCircle className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                <span className="font-medium text-slate-600">@{account.username}</span>
              </div>
            )}
            {account.phone && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <HiOutlineDeviceMobile className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                <span className="font-mono font-medium text-slate-600">{account.phone}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <HiOutlineIdentification className="w-3.5 h-3.5 shrink-0 text-slate-400" />
              <span className="font-mono text-slate-600">ID {account.telegram_user_id}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1.5 shrink-0 sm:items-end">
          {account.is_active && (
            <button
              type="button"
              onClick={() => onLogout(account.id)}
              disabled={loggingOut === account.id}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <HiOutlineLogout className="w-3.5 h-3.5" />
              {loggingOut === account.id ? t('telegramSettings.loggingOut') : t('telegramSettings.logout')}
            </button>
          )}
          <button
            type="button"
            onClick={() => onDelete(account.id)}
            disabled={deleting === account.id}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50"
          >
            <HiOutlineTrash className="w-3.5 h-3.5" />
            {deleting === account.id ? t('telegramSettings.deleting') : t('telegramSettings.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TelegramSettings() {
  const { t } = useI18n();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const safeAccounts = Array.isArray(accounts) ? accounts : [];

  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrPayload, setQrPayload] = useState(null);
  const [qrStatus, setQrStatus] = useState('idle');
  const [qrError, setQrError] = useState(null);
  const pollRef = useRef(null);
  const lastStartErrorRef = useRef(null);
  const [gatewayStatus, setGatewayStatus] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const connectAbortRef = useRef(null);

  const [deleting, setDeleting] = useState(null);
  const [loggingOut, setLoggingOut] = useState(null);

  const fetchAccounts = useCallback(async (signal) => {
    try {
      const resp = await chatbotApi.listTelegramAccounts({ signal });
      const payload = resp?.data?.data ?? resp?.data;
      setAccounts(Array.isArray(payload) ? payload : []);
    } catch (err) {
      if (axios.isCancel(err) || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
      console.error('[TelegramSettings] fetchAccounts:', err);
      toast.error(err?.message || t('telegramSettings.loadFailed'));
      setAccounts([]);
    }
  }, [t]);

  const fetchGatewayStatus = useCallback(async (signal) => {
    try {
      let status = null;
      try {
        const unified = await chatbotApi.getPersonalAccountsHealth({ signal });
        status = unified?.data?.data?.channels?.telegram ?? null;
      } catch (unifiedErr) {
        if (axios.isCancel(unifiedErr) || unifiedErr?.name === 'CanceledError' || unifiedErr?.code === 'ERR_CANCELED') return;
        const resp = await chatbotApi.getTelegramAccountStatus({ signal });
        status = resp?.data?.data ?? null;
      }
      setGatewayStatus(status);
    } catch (err) {
      if (axios.isCancel(err) || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
      console.warn('[TelegramSettings] fetchGatewayStatus:', err?.message || err);
      setGatewayStatus(null);
    }
  }, []);

  const initialLoadAbortRef = useRef(null);
  useEffect(() => {
    initialLoadAbortRef.current = new AbortController();
    let mounted = true;
    if (lastStartErrorRef.current) setQrError(lastStartErrorRef.current);
    const controller = initialLoadAbortRef.current;
    (async () => {
      setLoading(true);
      try {
        await Promise.all([
          fetchAccounts(controller.signal),
          fetchGatewayStatus(controller.signal),
        ]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
      controller.abort();
      initialLoadAbortRef.current = null;
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      if (connectAbortRef.current) { connectAbortRef.current.abort(); connectAbortRef.current = null; }
    };
  }, [fetchAccounts, fetchGatewayStatus]);

  const statusPollRef = useRef(null);
  useEffect(() => {
    if (!gatewayStatus || gatewayStatus.canStartLogin) {
      if (statusPollRef.current) { clearInterval(statusPollRef.current); statusPollRef.current = null; }
      return undefined;
    }
    statusPollRef.current = setInterval(() => { fetchGatewayStatus(); }, 30000);
    return () => { if (statusPollRef.current) { clearInterval(statusPollRef.current); statusPollRef.current = null; } };
  }, [gatewayStatus, fetchGatewayStatus]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const startPolling = useCallback((sessionId) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const resp = await chatbotApi.checkTelegramLoginStatus(sessionId);
        const data = resp?.data?.data ?? resp?.data;
        const status = data?.status;
        if (status === 'awaiting_scan' || status === 'migrating') { setQrStatus('awaiting_scan'); return; }
        if (status === 'success') {
          stopPolling();
          setQrStatus('success');
          toast.success(t('telegramSettings.successLinked'));
          setQrPayload(null);
          await fetchAccounts();
          return;
        }
        if (status === 'expired' || status === 'error') {
          stopPolling();
          setQrStatus(status);
          setQrError(data?.error || t('telegramSettings.qrExpired'));
          return;
        }
        if (status === 'not_found') {
          stopPolling();
          setQrStatus('expired');
          setQrError(t('telegramSettings.sessionExpiredServer'));
        }
      } catch (err) {
        console.error('[TelegramSettings] poll error:', err);
        stopPolling();
        setQrStatus('error');
        setQrError(err?.message || t('telegramSettings.connectionLost'));
      }
    }, 3000);
  }, [stopPolling, fetchAccounts, t]);

  const handleStartQrLogin = useCallback(async () => {
    setQrError(null);
    setQrStatus('connecting');
    setConnecting(true);
    setQrModalOpen(true);
    // Huỷ lượt init trước nếu nó còn đang bay. Nút "Tạo QR mới" trong modal KHÔNG khoá theo
    // `connecting` (hai nút ngoài thì có, qua `canOpenQr`), mà init có thể mất 20–40s ở cold path —
    // thừa thời gian để bấm lại. Trước PR-3, bộ khử trùng của api.js âm thầm huỷ hộ lượt cũ; từ khi
    // api.js tôn trọng signal của người gọi thì không còn ai huỷ, nên mỗi lần bấm lại mở thêm một
    // phiên Telegram ở server trong khi UI chỉ giữ `sessionId` về sau cùng.
    connectAbortRef.current?.abort();
    const controller = new AbortController();
    connectAbortRef.current = controller;
    try {
      const resp = await chatbotApi.initTelegramLogin({ signal: controller.signal });
      const data = resp?.data?.data ?? resp?.data;
      if (!data?.sessionId || !data?.qrImageBase64) {
        throw new Error(t('telegramSettings.invalidQrServer'));
      }
      setQrPayload({ sessionId: data.sessionId, qrImageBase64: data.qrImageBase64, expiresAt: data.expiresAt });
      setQrStatus('awaiting_scan');
      startPolling(data.sessionId);
    } catch (err) {
      const isCanceled = axios.isCancel(err) || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED';
      let msg;
      if (!isCanceled) {
        console.error('[TelegramSettings] initTelegramLogin:', err?.response?.data?.message || err?.message || 'unknown');
      }
      const code = err?.response?.data?.code;
      if (code === 'TELEGRAM_STUB_TRANSPORT') {
        msg = t('telegramSettings.errStubTransport');
      } else if (code === 'TELEGRAM_NOT_CONFIGURED') {
        msg = t('telegramSettings.errNotConfigured');
      } else if (code === 'TELEGRAM_CONNECT_TIMEOUT') {
        msg = t('telegramSettings.errConnectTimeout');
      } else if (!isCanceled) {
        msg = err?.message || t('telegramSettings.cannotStartLogin');
      }
      lastStartErrorRef.current = msg;
      setQrError(msg);
      if (!isCanceled) setQrStatus('error');
      fetchGatewayStatus();
    } finally {
      if (connectAbortRef.current) { connectAbortRef.current.abort(); connectAbortRef.current = null; }
      setConnecting(false);
    }
  }, [startPolling, fetchGatewayStatus, t]);

  const handleCancelQr = useCallback(async () => {
    stopPolling();
    if (qrPayload?.sessionId) {
      try { await chatbotApi.cancelTelegramLogin(qrPayload.sessionId); }
      catch (err) { console.warn('[TelegramSettings] cancelTelegramLogin:', err?.message); }
    }
    setQrPayload(null);
    setQrStatus('idle');
    setQrError(null);
    setQrModalOpen(false);
  }, [qrPayload, stopPolling]);

  const handleDelete = useCallback(async (id) => {
    if (!window.confirm(t('telegramSettings.deleteConfirm'))) return;
    setDeleting(id);
    try {
      await chatbotApi.deleteTelegramAccount(id);
      toast.success(t('telegramSettings.deleteSuccess'));
      await fetchAccounts();
    } catch (err) {
      toast.error(err?.message || t('telegramSettings.deleteError'));
    } finally {
      setDeleting(null);
    }
  }, [fetchAccounts, t]);

  const handleLogout = useCallback(async (id) => {
    setLoggingOut(id);
    try {
      await chatbotApi.logoutTelegramAccount(id);
      toast.success(t('telegramSettings.logoutSuccess'));
      await fetchAccounts();
    } catch (err) {
      toast.error(err?.message || t('telegramSettings.logoutError'));
    } finally {
      setLoggingOut(null);
    }
  }, [fetchAccounts, t]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    const controller = new AbortController();
    try { await fetchAccounts(controller.signal); }
    finally { setRefreshing(false); }
  }, [fetchAccounts]);

  const totalActive = safeAccounts.filter((a) => a && a.is_active && a.is_loaded).length;

  const canOpenQr = !qrModalOpen && !connecting && (gatewayStatus?.canStartLogin !== false);

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 rounded-xl bg-primary-500 flex items-center justify-center text-white shadow-sm">
              <FaTelegramPlane className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">{t('telegramSettings.title')}</h2>
          </div>
          <p className="text-sm text-slate-500 max-w-2xl leading-relaxed">
            {t('telegramSettings.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50"
          >
            <HiOutlineRefresh className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? t('telegramSettings.loading') : t('telegramSettings.refresh')}
          </button>
          <button
            type="button"
            onClick={handleStartQrLogin}
            disabled={!canOpenQr}
            title={
              gatewayStatus?.stubOnly
                ? t('telegramSettings.gatewayStubWarning')
                : gatewayStatus && !gatewayStatus.hasSecret
                ? t('telegramSettings.gatewayNotConfigured')
                : undefined
            }
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-primary-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            <HiOutlineQrcode className="w-3.5 h-3.5" />
            {t('telegramSettings.scanQr')}
          </button>
        </div>
      </div>

      {/* ── Gateway warning banner ── */}
      {gatewayStatus && !gatewayStatus.canStartLogin && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <HiOutlineExclamation className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-amber-800">
              {gatewayStatus.stubOnly
                ? t('telegramSettings.gatewayStubWarning')
                : t('telegramSettings.gatewayNotConfigured')}
            </p>
            <p className="mt-0.5 text-xs text-amber-700 flex items-center gap-1">
              {gatewayStatus.stubOnly
                ? t('telegramSettings.gatewayStubAdminAction')
                : t('telegramSettings.gatewaySecretAdminAction')}
              {' '}
              <HiOutlineRefresh className="w-3 h-3 animate-spin inline" />
              {t('telegramSettings.rechecking30s')}
            </p>
          </div>
        </div>
      )}

      {/* ── Account list ── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* List header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-800">{t('telegramSettings.linkedAccounts')}</span>
            {safeAccounts.length > 0 && (
              <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full bg-slate-200 text-[11px] font-bold text-slate-600">
                {safeAccounts.length}
              </span>
            )}
          </div>
          {totalActive > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              {t('telegramSettings.activeCount', { count: totalActive })}
            </span>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-14">
            <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-500">{t('telegramSettings.loadingList')}</p>
          </div>
        ) : safeAccounts.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center text-center px-6 py-16 gap-3">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center">
              <FaTelegramPlane className="w-8 h-8 text-slate-300" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">{t('telegramSettings.emptyTitle')}</p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs leading-relaxed">
                {t('telegramSettings.emptySubtitle', { action: t('telegramSettings.scanQr') })}
              </p>
            </div>
            <button
              type="button"
              onClick={handleStartQrLogin}
              disabled={!canOpenQr}
              className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 bg-primary-500 hover:bg-primary-600 text-white text-sm font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50"
            >
              <HiOutlineQrcode className="w-4 h-4" />
              {t('telegramSettings.scanQr')}
            </button>
          </div>
        ) : (
          /* Account cards */
          <div className="p-4 sm:p-5 space-y-3">
            {safeAccounts.map((acc) => (
              <AccountCard
                key={acc.id}
                account={acc}
                onLogout={handleLogout}
                onDelete={handleDelete}
                loggingOut={loggingOut}
                deleting={deleting}
                t={t}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Footer tip ── */}
      <div className="flex items-start gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <HiOutlineInformationCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-600 leading-relaxed">
          {t('telegramSettings.footerTip')}
        </p>
      </div>

      {/* ── QR Modal ── */}
      <QrModal
        open={qrModalOpen}
        onClose={() => {
          if (qrStatus === 'success') {
            setQrModalOpen(false);
            setQrPayload(null);
            setQrStatus('idle');
          } else if (qrStatus !== 'connecting') {
            handleCancelQr();
          }
        }}
        qrPayload={qrPayload}
        qrStatus={qrStatus}
        qrError={qrError}
        onCancel={handleCancelQr}
        onNewQr={handleStartQrLogin}
      />
    </div>
  );
}
