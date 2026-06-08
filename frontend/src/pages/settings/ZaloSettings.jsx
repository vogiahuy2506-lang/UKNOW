import { useEffect, useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import {
  HiOutlineChatAlt2,
  HiOutlineCheckCircle,
  HiOutlineClipboardCopy,
  HiOutlineExclamationCircle,
  HiOutlineQrcode,
  HiOutlineRefresh,
  HiOutlineTrash,
  HiOutlineXCircle,
  HiOutlineQuestionMarkCircle,
} from 'react-icons/hi';
import { formatCampaignDateTime } from '../../features/campaigns/utils/campaignDateTime.helpers';
import zaloSettingsApiService from '../../features/settings/services/zaloSettingsApi.service';

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
    loginMethod: account.loginMethod || 'qr',
    notes: account.notes || '',
    creatorName: String(account.creatorName || account.createdBy?.name || ''),
    createdBy: account?.createdBy?.name
      ? { name: String(account.createdBy.name) }
      : (account.creatorName ? { name: String(account.creatorName) } : null),
    updatedAt: account.updatedAt || account.lastSyncAt || null,
  };
}

const ZaloSettings = () => {
  const { t } = useI18n();
  const [accounts, setAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreatingQr, setIsCreatingQr] = useState(false);
  const [restoringAccountIds, setRestoringAccountIds] = useState([]);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrPreview.isOpen, qrPreview.sessionKey]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('zaloSettings.title')}</h1>
          
        </div>
        <button
          type="button"
          onClick={handleRefreshStatus}
          className="btn btn-secondary"
          disabled={isRefreshing}
        >
          <HiOutlineRefresh className="w-4 h-4 mr-2" />
          {isRefreshing ? t('zaloSettings.refreshing') : t('zaloSettings.refresh')}
        </button>
      </div>

      {!isBackendReady && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
          <div className="flex items-start gap-2">
            <HiOutlineExclamationCircle className="w-5 h-5 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">{t('zaloSettings.backendNotReadyTitle')}</p>
              <p className="mt-1">
                {backendModeMessage || t('zaloSettings.backendNotReadyNote')}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2 text-gray-900">
          <HiOutlineQrcode className="w-5 h-5 text-primary-600" />
          <h2 className="text-lg font-semibold">{t('zaloSettings.loginByQr')}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleConnectByQr}
            className="btn btn-primary"
            disabled={isCreatingQr}
          >
            <HiOutlineQrcode className="w-4 h-4 mr-2" />
            {isCreatingQr ? t('zaloSettings.creatingQr') : t('zaloSettings.createQrLogin')}
          </button>
        </div>
      </div>

      <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">{t('zaloSettings.accounts')}</h2>
            <span className="text-sm text-gray-500">{t('zaloSettings.totalAccounts')}: {sortedAccounts.length}</span>
          </div>

          {isLoading ? (
            <div className="py-12 flex items-center justify-center">
              <div className="spinner w-8 h-8" />
            </div>
          ) : sortedAccounts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <HiOutlineChatAlt2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>{t('zaloSettings.noAccounts')}</p>
              <p className="text-xs mt-1">{t('zaloSettings.addFirstAccount')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedAccounts.map((account) => (
                <div key={account.id} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center flex-wrap gap-2">
                        <h3 className="font-semibold text-gray-900">{account.displayName}</h3>
                        {account.isDefault && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-primary-100 text-primary-700">
                            {t('zaloSettings.default')}
                          </span>
                        )}
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            account.status === 'connected' && account.isActive
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {account.status === 'connected' && account.isActive
                            ? t('zaloSettings.connected')
                            : t('zaloSettings.disconnected')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {t('zaloSettings.zaloId')}: {account.zaloUserId || t('zaloSettings.notConfigured')}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        {t('zaloSettings.zaloName')}: {account.zaloName || account.displayName || t('zaloSettings.unknown')}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        {t('zaloSettings.phone')}: {account.zaloPhone || t('zaloSettings.unknown')}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        {t('zaloSettings.createdBy')}: {account?.createdBy?.name || account?.creatorName || t('zaloSettings.unknown')}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {t('zaloSettings.lastSync')}: {account.updatedAt ? formatCampaignDateTime(account.updatedAt) : 'N/A'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {!(account.status === 'connected' && account.isActive) && (
                        <>
                          <button
                            type="button"
                            className="btn btn-secondary text-xs"
                            onClick={() => handleRestoreSession(account)}
                            disabled={restoringAccountIds.includes(account.id)}
                          >
                            <HiOutlineRefresh className="w-4 h-4 mr-1" />
                            {restoringAccountIds.includes(account.id)
                              ? t('zaloSettings.restoring')
                              : t('zaloSettings.restoreSession')}
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary text-xs"
                            onClick={() => handleReconnectByQr(account)}
                            disabled={isCreatingQr}
                          >
                            <HiOutlineQrcode className="w-4 h-4 mr-1" />
                            {t('zaloSettings.reconnectQr')}
                          </button>
                        </>
                      )}
                      {!account.isDefault && (
                        <button
                          type="button"
                          className="btn btn-secondary text-xs"
                          onClick={() => handleSetDefault(account.id)}
                        >
                          <HiOutlineCheckCircle className="w-4 h-4 mr-1" />
                          {t('zaloSettings.setDefault')}
                        </button>
                      )}
                      <button
                        type="button"
                        className="p-2 rounded-md hover:bg-red-50 text-gray-500 hover:text-red-600"
                        onClick={() => handleDeleteAccount(account.id)}
                        title={t('zaloSettings.delete')}
                      >
                        <HiOutlineTrash className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  {account.notes && <p className="text-sm text-gray-700 mt-3">{account.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

      {qrPreview.isOpen &&
        createPortal(
          // Render ra document.body để overlay luôn phủ full viewport,
          // tránh bị giới hạn bởi layout cha có overflow/transform.
          <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center px-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">{t('zaloSettings.qrModalTitle')}</h3>
                <button
                  type="button"
                  className="p-2 rounded-md hover:bg-gray-100 text-gray-500"
                  onClick={closeQrPreview}
                  aria-label={t('zaloSettings.close')}
                >
                  <HiOutlineXCircle className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 space-y-3">
                <div className="rounded-lg border border-gray-200 p-3 flex items-center justify-center">
                  <img src={qrPreview.image} alt={t('zaloSettings.qrAlt')} className="w-64 h-64 object-contain" />
                </div>
                <p className="text-sm text-gray-600 text-center">
                  {t('zaloSettings.qrScanInstruction')}
                </p>
                {qrPreview.path && (
                  <button
                    type="button"
                    onClick={() => copyText(qrPreview.path, t('zaloSettings.copiedQrPath'))}
                    className="btn btn-secondary w-full"
                  >
                    <HiOutlineClipboardCopy className="w-4 h-4 mr-2" />
                    {t('zaloSettings.copyQrPath')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeQrPreview}
                  className="btn btn-primary w-full"
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
    </div>
  );
};

export default ZaloSettings;
