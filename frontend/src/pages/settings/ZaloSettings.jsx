/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import PageContainer from '../../components/common/PageContainer';
import NumberInput from '../../components/common/NumberInput';
import {
  HiOutlineChatAlt2,
  HiOutlineCheckCircle,
  HiOutlineClipboardCopy,
  HiOutlineExclamationCircle,
  HiOutlineQrcode,
  HiOutlineRefresh,
  HiOutlineTrash,
  HiOutlineX,
  HiOutlineIdentification,
  HiOutlineDeviceMobile,
  HiOutlineUserCircle,
  HiOutlineClock,
  HiOutlineInformationCircle,
} from 'react-icons/hi';
import { formatCampaignDateTime } from '../../features/campaigns/utils/campaignDateTime.helpers';
import zaloSettingsApiService from '../../features/settings/services/zaloSettingsApi.service';
import { useAuthStore } from '../../stores/authStore';

/**
 * Chuẩn hóa dữ liệu tài khoản Zalo trả về từ API
 * để UI luôn dùng cùng một shape.
 *
 * @param {Record<string, any>} account dữ liệu account thô
 * @returns {{
 *  id: string;
 *  displayName: string;
 *  zaloUserId: string;
 *  zaloName: string;
 *  zaloPhone: string;
 *  status: string;
 *  isActive: boolean;
 *  isDefault: boolean;
 *  loginMethod: string;
 *  notes: string;
 *  creatorName: string;
 *  createdBy: { name: string } | null;
 *  assignedEmployeeCount: number | null;
 *  updatedAt: string | null;
 * }}
 */
function normalizeAccount(account = {}) {
  return {
    id: String(account.id || crypto.randomUUID()),
    displayName: account.displayName || account.name || 'Zalo Account',
    zaloUserId: String(account.zaloUserId || account.oaId || account.accountId || ''),
    zaloName: String(account.zaloName || account.fullName || ''),
    zaloPhone: String(account.zaloPhone || account.phoneNumber || ''),
    status: account.status || 'disconnected',
    isActive: account.isActive ?? true,
    isDefault: account.isDefault ?? false,
    lastRestoreAttemptAt: account.lastRestoreAttemptAt || null,
    restoreFailCount: Number(account.restoreFailCount || 0),
    loginMethod: account.loginMethod || 'qr',
    notes: account.notes || '',
    creatorName: String(account.creatorName || account.createdBy?.name || ''),
    createdBy: account?.createdBy?.name
      ? { name: String(account.createdBy.name) }
      : (account.creatorName ? { name: String(account.creatorName) } : null),
    // Số nhân viên được giao tài khoản này: chỉ chủ nhận số (nhân viên nhận null và không thấy dòng này).
    assignedEmployeeCount: Number.isFinite(Number(account.assignedEmployeeCount)) && account.assignedEmployeeCount !== null
      ? Number(account.assignedEmployeeCount)
      : null,
    updatedAt: account.updatedAt || account.lastSyncAt || null,
    userDailySendLimit: account.userDailySendLimit ?? account.user_daily_send_limit ?? null,
    sendSpeed: account.sendSpeed || 'safe',
  };
}

// P12 — `readOnly`: gói không có kênh Zalo -> chỉ xem/đặt mặc định/xoá tài khoản cũ, KHÔNG có nút tạo QR/quét lại/khôi phục phiên.
const ZaloSettings = ({ readOnly = false } = {}) => {
  const { t } = useI18n();
  // Nhân viên không đổi được tài khoản mặc định (là của cả không gian — backend trả 403 WORKSPACE_OWNER_ONLY).
  const activeContext = useAuthStore((state) => state.activeContext);
  const isEmployeeContext = activeContext?.type === 'employee';
  const [accounts, setAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreatingQr, setIsCreatingQr] = useState(false);
  const [restoringAccountIds, setRestoringAccountIds] = useState([]);
  const [retryingAccountIds, setRetryingAccountIds] = useState([]);
  // Ô nhập giới hạn gửi/ngày sửa tại chỗ trên từng dòng tài khoản (PLAN_GIOI_HAN_GUI_THEO_NGAY
  // 2026-09-22/23, PR-4). Nháp riêng theo accountId — chưa lưu thì không đụng vào `accounts` gốc.
  const [sendLimitDrafts, setSendLimitDrafts] = useState({});
  const [savingSendLimitIds, setSavingSendLimitIds] = useState([]);
  const [sendSpeedDrafts, setSendSpeedDrafts] = useState({});
  const [savingSendSpeedIds, setSavingSendSpeedIds] = useState([]);
  const [isBackendReady, setIsBackendReady] = useState(true);
  const [backendModeMessage, setBackendModeMessage] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [qrPreview, setQrPreview] = useState({
    isOpen: false,
    image: '',
    path: '',
    sessionKey: '',
  });

  const sortedAccounts = useMemo(() => {
    return [...accounts].sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return a.displayName.localeCompare(b.displayName, 'vi');
    });
  }, [accounts]);

  const totalActive = useMemo(() => {
    return accounts.filter((a) => a.status === 'connected' && a.isActive).length;
  }, [accounts]);

  /**
   * Tải danh sách account từ backend.
   */
  const fetchAccounts = useCallback(async () => {
    try {
      const response = await zaloSettingsApiService.listAccounts();
      const apiItems = response.data?.data?.items;
      const normalized = Array.isArray(apiItems) ? apiItems.map(normalizeAccount) : [];
      setAccounts(normalized);
      setIsBackendReady(true);
      setBackendModeMessage('');
    } catch (error) {
      setAccounts([]);
      setIsBackendReady(false);
      const status = error?.response?.status;
      const code = error?.response?.data?.code;
      if (status === 404) {
        setBackendModeMessage(t('zaloSettings.backendRouteMissing'));
      } else if (code === 'ZALO_SETTINGS_TABLE_MISSING') {
        setBackendModeMessage(t('zaloSettings.backendTableMissing'));
      } else {
        setBackendModeMessage(t('zaloSettings.backendConnectionFailed'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchAccounts();
   
  }, []);

  // Auto-refresh when page regains focus (e.g., after tab switch or server restart)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchAccounts();
      }
    };

    const handleFocus = () => {
      fetchAccounts();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchAccounts]);

  const copyText = async (value, successMsg) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(successMsg);
    } catch (_error) {
      toast.error(t('zaloSettings.copyFailed'));
    }
  };

  const handleRefreshStatus = async () => {
    setIsRefreshing(true);
    await fetchAccounts();
    setIsRefreshing(false);
    toast.success(t('zaloSettings.refreshSuccess'));
  };

  const handleDeleteAccount = async (accountId) => {
    if (!window.confirm(t('zaloSettings.confirmDelete'))) return;

    if (!isBackendReady) {
      toast.error(t('zaloSettings.backendNotReady'));
      return;
    }

    try {
      await zaloSettingsApiService.deleteAccount(accountId);
      await fetchAccounts();
      toast.success(t('zaloSettings.deleteSuccess'));
    } catch (error) {
      toast.error(error.response?.data?.message || t('zaloSettings.deleteFailed'));
    }
  };

  const handleSetDefault = async (accountId) => {
    if (!isBackendReady) {
      toast.error(t('zaloSettings.backendNotReady'));
      return;
    }

    try {
      await zaloSettingsApiService.setDefaultAccount(accountId);
      await fetchAccounts();
      toast.success(t('zaloSettings.setDefaultSuccess'));
    } catch (error) {
      toast.error(error.response?.data?.message || t('zaloSettings.setDefaultFailed'));
    }
  };

  /** Giá trị đang hiện trên ô nhập — ưu tiên nháp chưa lưu, không thì giá trị đã lưu. */
  const getSendLimitDraft = (account) => {
    if (Object.prototype.hasOwnProperty.call(sendLimitDrafts, account.id)) {
      return sendLimitDrafts[account.id];
    }
    return account.userDailySendLimit != null ? String(account.userDailySendLimit) : '';
  };

  const handleSaveSendLimit = async (account) => {
    if (!isBackendReady) {
      toast.error(t('zaloSettings.backendNotReady'));
      return;
    }

    const raw = getSendLimitDraft(account).trim();
    if (raw) {
      const parsed = Number(raw);
      // 0, số âm, số thập phân đều chặn ở đây — đừng để backend trả 400
      // (validator isInt({min:1,max:100000}) của PATCH .../send-limit).
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100000) {
        toast.error(t('zaloSettings.dailySendLimitInvalid'));
        return;
      }
    }

    setSavingSendLimitIds((prev) => [...prev, account.id]);
    try {
      // Body PHẢI luôn có field này, ô trống = gửi null tường minh để bỏ giới hạn — KHÔNG được
      // gửi body rỗng (backend trả 400, xem zaloSettingsApi.service.js).
      await zaloSettingsApiService.updateSendLimit(account.id, raw ? Number(raw) : null);
      await fetchAccounts();
      setSendLimitDrafts((prev) => {
        const next = { ...prev };
        delete next[account.id];
        return next;
      });
      toast.success(t('zaloSettings.dailySendLimitSaveSuccess'));
    } catch (error) {
      toast.error(error.response?.data?.message || t('zaloSettings.dailySendLimitSaveFailed'));
    } finally {
      setSavingSendLimitIds((prev) => prev.filter((id) => id !== account.id));
    }
  };

  /** Tốc độ gửi đang chọn (ưu tiên nháp chưa lưu, fallback về account.sendSpeed hoặc 'safe'). */
  const getSendSpeedDraft = (account) => {
    if (Object.prototype.hasOwnProperty.call(sendSpeedDrafts, account.id)) {
      return sendSpeedDrafts[account.id];
    }
    return account.sendSpeed || 'safe';
  };

  const handleSaveSendSpeed = async (account) => {
    if (!isBackendReady) {
      toast.error(t('zaloSettings.backendNotReady'));
      return;
    }

    const speed = getSendSpeedDraft(account);
    if (!['safe', 'fast', 'very_fast'].includes(speed)) {
      return;
    }

    setSavingSendSpeedIds((prev) => [...prev, account.id]);
    try {
      await zaloSettingsApiService.updateSendSpeed(account.id, speed);
      await fetchAccounts();
      setSendSpeedDrafts((prev) => {
        const next = { ...prev };
        delete next[account.id];
        return next;
      });
      toast.success(t('zaloSettings.sendSpeedSaveSuccess'));
    } catch (error) {
      toast.error(error.response?.data?.message || t('zaloSettings.sendSpeedSaveFailed'));
    } finally {
      setSavingSendSpeedIds((prev) => prev.filter((id) => id !== account.id));
    }
  };

  const handleConnectByQr = async () => {
    if (!isBackendReady) {
      toast.error(backendModeMessage || t('zaloSettings.backendNotReady'));
      return;
    }

    try {
      setIsCreatingQr(true);
      const response = await zaloSettingsApiService.createLoginQr();
      const qrPath = response.data?.data?.qrPath;
      const qrImage = response.data?.data?.qrImage;
      const sessionKey = response.data?.data?.sessionKey;
      if (qrPath) {
        await copyText(qrPath, t('zaloSettings.copiedQrPath'));
      }
      if (qrImage && sessionKey) {
        setQrPreview({
          isOpen: true,
          image: qrImage,
          path: qrPath || '',
          sessionKey,
        });
        toast.success(t('zaloSettings.qrSuccess'));
      } else {
        toast.error(t('zaloSettings.qrDataMissing'));
      }
    } catch (error) {
      toast.error(error.response?.data?.message || t('zaloSettings.qrFailed'));
    } finally {
      setIsCreatingQr(false);
    }
  };

  /**
   * Trigger QR login flow again for disconnected account.
   *
   * @param {{displayName?: string}} account
   * @returns {Promise<void>}
   */
  const handleReconnectByQr = async (account) => {
    const displayName = String(account?.displayName || '').trim();
    if (displayName) {
      toast(t('zaloSettings.reconnectQrHint'), {
        icon: 'ℹ️',
      });
    }
    await handleConnectByQr();
  };

  /**
   * Re-enable automatic restore after needs_reauth (does not login).
   *
   * @param {{ id: string }} account
   * @returns {Promise<void>}
   */
  const handleRetryRestore = async (account) => {
    const accountId = account?.id;
    if (!accountId) return;
    setRetryingAccountIds((prev) => [...prev, accountId]);
    try {
      await zaloSettingsApiService.retryRestore(accountId);
      toast.success(t('zaloSettings.retryRestoreSuccess'));
      await fetchAccounts();
    } catch (error) {
      toast.error(error?.response?.data?.message || t('zaloSettings.retryRestoreFailed'));
    } finally {
      setRetryingAccountIds((prev) => prev.filter((id) => id !== accountId));
    }
  };

  /**
   * Khôi phục session Zalo từ cookie đã lưu cho một account.
   *
   * @param {{ id: string; displayName?: string }} account
   * @returns {Promise<void>}
   */
  const handleRestoreSession = async (account) => {
    const accountId = String(account?.id || '').trim();
    if (!accountId) {
      toast.error(t('zaloSettings.missingAccountId'));
      return;
    }
    if (!isBackendReady) {
      toast.error(backendModeMessage || t('zaloSettings.backendNotReady'));
      return;
    }

    setRestoringAccountIds((prev) => (prev.includes(accountId) ? prev : [...prev, accountId]));
    try {
      await zaloSettingsApiService.restoreSession(accountId);
      await fetchAccounts();
      toast.success(t('zaloSettings.restoreSuccess', { accountName: account?.displayName || 'Zalo Account' }));
    } catch (error) {
      const status = error?.response?.status;
      if (status === 404) {
        toast.error(t('zaloSettings.restoreNotSupported'));
      } else {
        toast.error(error?.response?.data?.message || t('zaloSettings.restoreFailed'));
      }
    } finally {
      setRestoringAccountIds((prev) => prev.filter((id) => id !== accountId));
    }
  };

  const closeQrPreview = () => {
    setQrPreview({
      isOpen: false,
      image: '',
      path: '',
      sessionKey: '',
    });
  };

  useEffect(() => {
    if (!qrPreview.isOpen || !qrPreview.sessionKey) return undefined;

    let disposed = false;
    let timerId = null;

    const pollStatus = async () => {
      if (disposed) return;
      try {
        const response = await zaloSettingsApiService.getLoginQrStatus(qrPreview.sessionKey);
        const status = response.data?.data?.status;
        const message = response.data?.data?.message;
        const account = response.data?.data?.account;

        if (status === 'connected') {
          toast.success(message || t('zaloSettings.loginSuccess'));
          if (account?.displayName) {
            toast.success(`${t('zaloSettings.loginSuccessSaved')} ${account.displayName}`);
          }
          await fetchAccounts();
          closeQrPreview();
          return;
        }

        if (status === 'failed') {
          toast.error(message || t('zaloSettings.loginFailed'));
          closeQrPreview();
        }
      } catch (error) {
        if (error?.response?.status === 404) {
          toast.error(t('zaloSettings.qrExpired'));
          closeQrPreview();
        }
      }
    };

    pollStatus();
    timerId = window.setInterval(pollStatus, 3000);

    return () => {
      disposed = true;
      if (timerId) {
        window.clearInterval(timerId);
      }
    };
   
  }, [qrPreview.isOpen, qrPreview.sessionKey]);

  return (
    <PageContainer
      icon={HiOutlineChatAlt2}
      title={t('zaloSettings.title')}
      subtitle={t('zaloSettings.description')}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefreshStatus}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50"
          >
            <HiOutlineRefresh className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? t('zaloSettings.refreshing') : t('zaloSettings.refresh')}
          </button>
          {!readOnly && (
            <button
              type="button"
              onClick={handleConnectByQr}
              disabled={isCreatingQr}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-primary-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <HiOutlineQrcode className="w-3.5 h-3.5" />
              {isCreatingQr ? t('zaloSettings.creatingQr') : t('zaloSettings.createQrLogin')}
            </button>
          )}
        </div>
      }
    >
      {!isBackendReady && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
          <div className="flex items-start gap-2">
            <HiOutlineExclamationCircle className="w-5 h-5 mt-0.5 text-amber-600 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold">{t('zaloSettings.backendNotReadyTitle')}</p>
              <p className="mt-1 text-xs text-amber-800">
                {backendModeMessage || t('zaloSettings.backendNotReadyNote')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Accounts list container (Đồng bộ với Telegram & WhatsApp) ──── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* List header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-800">
              {t('zaloSettings.accounts') || 'Tài khoản đã liên kết'}
            </span>
            {sortedAccounts.length > 0 && (
              <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full bg-slate-200 text-[11px] font-bold text-slate-600">
                {sortedAccounts.length}
              </span>
            )}
          </div>
          {totalActive > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              {t('telegramSettings.activeCount', { count: totalActive }) || `${totalActive} đang hoạt động`}
            </span>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-14">
            <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-500">{t('telegramSettings.loadingList') || 'Đang tải danh sách…'}</p>
          </div>
        ) : sortedAccounts.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center text-center px-6 py-16 gap-3">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center">
              <HiOutlineChatAlt2 className="w-8 h-8 text-slate-300" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">{t('zaloSettings.noAccounts')}</p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs leading-relaxed">
                {!readOnly ? t('zaloSettings.addFirstAccount') : ''}
              </p>
            </div>
            {!readOnly && (
              <button
                type="button"
                onClick={handleConnectByQr}
                disabled={isCreatingQr}
                className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 bg-primary-500 hover:bg-primary-600 text-white text-sm font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50"
              >
                <HiOutlineQrcode className="w-4 h-4" />
                {t('zaloSettings.createQrLogin')}
              </button>
            )}
          </div>
        ) : (
          /* Account cards */
          <div className="p-4 sm:p-5 space-y-3">
            {sortedAccounts.map((account) => (
              <div
                key={account.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 transition hover:border-primary-200 shadow-sm"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  {/* Left: Avatar + Title & Badges */}
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-white font-bold shadow-sm text-lg">
                      {account.displayName?.trim().charAt(0)?.toUpperCase() || 'Z'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-slate-900 truncate text-base">{account.displayName}</h3>
                        {account.isDefault && (
                          <span className="inline-flex items-center rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700">
                            {t('zaloSettings.default')}
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                            account.status === 'connected' && account.isActive
                              ? 'border-green-200 bg-green-50 text-green-700'
                              : account.status === 'needs_reauth'
                              ? 'border-amber-200 bg-amber-50 text-amber-700'
                              : 'border-slate-200 bg-slate-50 text-slate-600'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              account.status === 'connected' && account.isActive
                                ? 'bg-green-500'
                                : account.status === 'needs_reauth'
                                ? 'bg-amber-500 animate-pulse'
                                : 'bg-slate-400'
                            }`}
                          />
                          {account.status === 'connected' && account.isActive
                            ? t('zaloSettings.connected')
                            : account.status === 'needs_reauth'
                            ? t('zaloSettings.needsReauth')
                            : t('zaloSettings.disconnected')}
                        </span>
                        {account.phoneLookupCooldownUntil && new Date(account.phoneLookupCooldownUntil).getTime() > Date.now() && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                            {t('zaloSettings.phoneLookupCooldownBadge', {
                              until: formatCampaignDateTime(account.phoneLookupCooldownUntil),
                            })}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                        <HiOutlineIdentification className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>ID: {account.zaloUserId || t('zaloSettings.notConfigured')}</span>
                      </p>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                    {!readOnly && !(account.status === 'connected' && account.isActive) && (
                      <>
                        {(account.status === 'needs_reauth' || account.status === 'disconnected') && (
                          <button
                            type="button"
                            onClick={() => handleRetryRestore(account)}
                            disabled={retryingAccountIds.includes(account.id)}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                          >
                            <HiOutlineRefresh className={`w-3.5 h-3.5 ${retryingAccountIds.includes(account.id) ? 'animate-spin' : ''}`} />
                            {retryingAccountIds.includes(account.id)
                              ? t('zaloSettings.restoring')
                              : t('zaloSettings.retryRestore')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRestoreSession(account)}
                          disabled={restoringAccountIds.includes(account.id)}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                          title="Khôi phục lại phiên từ cookie đã lưu"
                        >
                          <HiOutlineRefresh className={`w-3.5 h-3.5 ${restoringAccountIds.includes(account.id) ? 'animate-spin' : ''}`} />
                          {restoringAccountIds.includes(account.id) ? t('zaloSettings.restoring') : t('zaloSettings.restoreSession')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReconnectByQr(account)}
                          disabled={isCreatingQr}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-100 transition-colors disabled:opacity-50"
                        >
                          <HiOutlineQrcode className="w-3.5 h-3.5" />
                          {t('zaloSettings.reconnectQr')}
                        </button>
                      </>
                    )}
                    {!account.isDefault && !isEmployeeContext && (
                      <button
                        type="button"
                        onClick={() => handleSetDefault(account.id)}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                        title={t('zaloSettings.setDefault')}
                      >
                        <HiOutlineCheckCircle className="w-3.5 h-3.5 text-slate-400" />
                        <span className="hidden md:inline">{t('zaloSettings.setDefault')}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteAccount(account.id)}
                      className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      title={t('zaloSettings.delete')}
                    >
                      <HiOutlineTrash className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Needs Reauth Alert Banner */}
                {account.status === 'needs_reauth' && (
                  <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800">
                    <HiOutlineExclamationCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium">{t('zaloSettings.needsReauthHint')}</p>
                      {account.lastRestoreAttemptAt && (
                        <p className="text-[11px] text-amber-600 mt-0.5">
                          {t('zaloSettings.lastRestoreAttempt')}: {formatCampaignDateTime(account.lastRestoreAttemptAt)}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Account Details Grid (2 columns) */}
                <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 text-xs border-t border-slate-100 pt-3">
                  <div className="flex items-center gap-2">
                    <HiOutlineDeviceMobile className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="text-slate-500 shrink-0">{t('zaloSettings.phone')}:</span>
                    <span className="font-medium text-slate-800 truncate">{account.zaloPhone || t('zaloSettings.unknown')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <HiOutlineUserCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="text-slate-500 shrink-0">{t('zaloSettings.zaloName')}:</span>
                    <span className="font-medium text-slate-800 truncate">{account.zaloName || t('zaloSettings.unknown')}</span>
                  </div>
                  {account.assignedEmployeeCount !== null && (
                    <div className="flex items-center gap-2">
                      <HiOutlineUserCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-medium text-slate-800 truncate">
                        {t('zaloSettings.assignedEmployees', { count: account.assignedEmployeeCount })}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <HiOutlineClock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="text-slate-500 shrink-0">{t('zaloSettings.lastSync')}:</span>
                    <span className="font-medium text-slate-800 truncate">{account.updatedAt ? formatCampaignDateTime(account.updatedAt) : 'N/A'}</span>
                  </div>
                </div>

                {/* Send Settings Inner Box */}
                <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                  <p className="text-xs font-semibold text-slate-700">{t('channelSendSettings.title') || 'Giới hạn & tốc độ gửi chiến dịch'}</p>

                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <label htmlFor={`send-limit-${account.id}`} className="text-xs text-slate-600 min-w-[110px]">
                      {t('zaloSettings.dailySendLimit')}:
                    </label>
                    <div className="w-52 sm:w-56">
                      <NumberInput
                        id={`send-limit-${account.id}`}
                        min={1}
                        max={100000}
                        value={getSendLimitDraft(account)}
                        onChange={(v) => setSendLimitDrafts((prev) => ({ ...prev, [account.id]: String(v) }))}
                        className="input py-1 text-sm bg-white"
                        placeholder={t('zaloSettings.dailySendLimitPlaceholder')}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary text-xs px-3 py-1 font-medium"
                      onClick={() => handleSaveSendLimit(account)}
                      disabled={savingSendLimitIds.includes(account.id)}
                    >
                      {savingSendLimitIds.includes(account.id) ? t('common.saving') : t('common.save')}
                    </button>
                    {Number(getSendLimitDraft(account)) > 100 && (
                      <span className="text-xs text-amber-600 font-medium">{t('zaloSettings.dailySendLimitHighWarning')}</span>
                    )}
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <label htmlFor={`send-speed-${account.id}`} className="text-xs text-slate-600 min-w-[110px]">
                      {t('zaloSettings.sendSpeed')}:
                    </label>
                    <div className="w-56 sm:w-64">
                      <select
                        id={`send-speed-${account.id}`}
                        value={getSendSpeedDraft(account)}
                        onChange={(e) => setSendSpeedDrafts((prev) => ({ ...prev, [account.id]: e.target.value }))}
                        className="input py-1 text-sm bg-white"
                      >
                        {account.sendSpeed === 'custom' && !Object.prototype.hasOwnProperty.call(sendSpeedDrafts, account.id) && (
                          <option value="custom" disabled>
                            {t('zaloSettings.sendSpeedCustom')}
                          </option>
                        )}
                        <option value="safe">{t('zaloSettings.sendSpeedSafe')}</option>
                        <option value="fast">{t('zaloSettings.sendSpeedFast')}</option>
                        <option value="very_fast">{t('zaloSettings.sendSpeedVeryFast')}</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary text-xs px-3 py-1 font-medium"
                      onClick={() => handleSaveSendSpeed(account)}
                      disabled={savingSendSpeedIds.includes(account.id) || getSendSpeedDraft(account) === 'custom'}
                    >
                      {savingSendSpeedIds.includes(account.id) ? t('common.saving') : t('common.save')}
                    </button>
                    {getSendSpeedDraft(account) === 'fast' && (
                      <span className="text-xs text-amber-600 font-medium">{t('zaloSettings.sendSpeedFastWarning')}</span>
                    )}
                    {getSendSpeedDraft(account) === 'very_fast' && (
                      <span className="text-xs font-medium text-red-600">{t('zaloSettings.sendSpeedVeryFastWarning')}</span>
                    )}
                  </div>
                  {account.sendSpeed === 'custom' && (
                    <p className="text-xs text-slate-500 mt-1 italic">
                      {t('zaloSettings.sendSpeedCustom')}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-slate-400">{t('zaloSettings.sendSpeedAppliedNextRunHint')}</p>
                </div>

                {account.notes && <p className="text-xs text-slate-500 mt-2.5">{account.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Footer tip ── */}
      <div className="flex items-start gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <HiOutlineInformationCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-600 leading-relaxed">
          Quét mã QR bằng ứng dụng Zalo trên điện thoại để liên kết. Hệ thống sẽ tự động duy trì phiên đăng nhập và điều phối tốc độ gửi để bảo vệ tài khoản của bạn.
        </p>
      </div>

      {qrPreview.isOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center px-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">{t('zaloSettings.qrModalTitle')}</h3>
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  onClick={closeQrPreview}
                  aria-label={t('zaloSettings.close')}
                >
                  <HiOutlineX className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="rounded-xl border border-slate-200 p-3 flex items-center justify-center bg-slate-50">
                  <img src={qrPreview.image} alt={t('zaloSettings.qrAlt')} className="w-60 h-60 object-contain rounded-lg" />
                </div>
                <p className="text-xs text-slate-500 text-center leading-relaxed">
                  {t('zaloSettings.qrScanInstruction')}
                </p>
                {qrPreview.path && (
                  <button
                    type="button"
                    onClick={() => copyText(qrPreview.path, t('zaloSettings.copiedQrPath'))}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <HiOutlineClipboardCopy className="w-3.5 h-3.5" />
                    {t('zaloSettings.copyQrPath')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeQrPreview}
                  className="w-full py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-xs font-bold text-white transition-colors shadow-sm"
                >
                  {t('zaloSettings.close')}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Custom Domain Guide Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-auto">
            <div className="sticky top-0 bg-white border-b border-slate-100 p-6 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Kết nối tên miền riêng</h3>
                    <p className="text-xs text-slate-500">Sử dụng domain của bạn cho chatbot</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowHelp(false)}
                  className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* What is custom domain */}
              <div className="bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-100 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center text-violet-600 flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <div>
                    <p className="font-semibold text-violet-900 mb-1">Tên miền riêng là gì?</p>
                    <p className="text-sm text-violet-700">Thay vì dùng link mặc định <code className="bg-violet-100 px-1.5 py-0.5 rounded text-xs">app.uknow.vn/chat/&#123;id&#125;</code>, bạn có thể dùng domain riêng như <code className="bg-violet-100 px-1.5 py-0.5 rounded text-xs">senna.founderai.biz</code> để tạo thương hiệu chuyên nghiệp hơn.</p>
                  </div>
                </div>
              </div>

              {/* Steps */}
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center font-bold">1</span>
                  Thêm DNS Records
                </h4>
                <p className="text-sm text-slate-600 pl-8">Đăng nhập vào dashboard nhà cung cấp domain (GoDaddy, Namecheap, VNPT...) và thêm 2 records sau:</p>

                {/* DNS Records */}
                <div className="bg-slate-900 rounded-xl p-4 space-y-3 pl-8">
                  {/* Example */}
                  <div className="text-xs text-slate-500 mb-3 flex items-center gap-2">
                    <span>Ví dụ:</span>
                    <code className="text-emerald-400">senna.founderai.biz</code>
                    <span>→</span>
                    <code className="text-blue-400">founderai.biz</code>
                  </div>

                  {/* CNAME */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs font-mono rounded">CNAME</span>
                      <span className="text-slate-400 text-xs">Record #1 - Điều hướng subdomain</span>
                    </div>
                    <div className="space-y-1.5 font-mono text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 w-16">Host:</span>
                        <span className="text-emerald-400">senna</span>
                        <span className="text-slate-500 text-xs">(tên subdomain)</span>
                        <button
                          onClick={() => copyText('senna', 'Đã copy Host')}
                          className="ml-1 text-slate-400 hover:text-white transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 w-16">Value:</span>
                        <span className="text-emerald-400">founderai.biz</span>
                        <button
                          onClick={() => copyText('founderai.biz', 'Đã copy Value')}
                          className="ml-1 text-slate-400 hover:text-white transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 w-16">TTL:</span>
                        <span className="text-slate-400">3600 (hoặc Auto)</span>
                      </div>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="border-t border-slate-700 my-3"></div>

                  {/* TXT */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs font-mono rounded">TXT</span>
                      <span className="text-slate-400 text-xs">Record #2 - Xác minh quyền sở hữu</span>
                    </div>
                    <div className="space-y-1.5 font-mono text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 w-16">Host:</span>
                        <span className="text-emerald-400">_uknow-verification</span>
                        <button
                          onClick={() => copyText('_uknow-verification', 'Đã copy Host')}
                          className="ml-1 text-slate-400 hover:text-white transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 w-16">Value:</span>
                        <span className="text-blue-400 text-xs break-all">uknow-verify=&#123;token&#125;...</span>
                        <span className="text-slate-500 text-xs">(copy từ hệ thống)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 w-16">TTL:</span>
                        <span className="text-slate-400">3600 (hoặc Auto)</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 2 */}
                <h4 className="font-semibold text-gray-900 flex items-center gap-2 pt-2">
                  <span className="w-6 h-6 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center font-bold">2</span>
                  Thêm domain trong hệ thống
                </h4>
                <p className="text-sm text-slate-600 pl-8">Sau khi thêm DNS records, vào <strong>Cài đặt &gt; Tên miền</strong> và nhấn <strong>"Thêm tên miền"</strong>. Nhập domain của bạn (vd: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">senna.founderai.biz</code>).</p>

                {/* Step 3 */}
                <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center font-bold">3</span>
                  Chờ xác minh
                </h4>
                <p className="text-sm text-slate-600 pl-8">DNS propagation có thể mất <strong>5-30 phút</strong>. Nhấn <strong>"Xác minh"</strong> để kiểm tra trạng thái. SSL sẽ được cấp tự động sau khi domain được xác nhận.</p>
              </div>

              {/* Tips */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600 flex-shrink-0">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  </div>
                  <div>
                    <p className="font-semibold text-amber-900 mb-1">Lưu ý</p>
                    <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
                      <li>Với <code className="bg-amber-100 px-1 py-0.5 rounded text-xs">senna.founderai.biz</code>: Host là <code className="bg-amber-100 px-1 py-0.5 rounded text-xs">senna</code>, không phải <code className="bg-amber-100 px-1 py-0.5 rounded text-xs">@</code></li>
                      <li>Liên hệ support nếu gặp lỗi xác minh sau 24h</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-slate-100 p-4">
              <button
                onClick={() => setShowHelp(false)}
                className="w-full py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-violet-700 hover:to-indigo-700 transition-all shadow-lg shadow-violet-500/25"
              >
                Đã hiểu, bắt đầu thiết lập
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
};

export default ZaloSettings;
