import { useEffect, useMemo, useState } from 'react';
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
} from 'react-icons/hi';
import api from '../../services/api';
import { formatCampaignDateTime } from '../../features/campaigns/utils/campaignDateTime.helpers';

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
  const fetchAccounts = async () => {
    try {
      const response = await api.get('/zalo/accounts');
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
  };

  useEffect(() => {
    fetchAccounts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      await api.delete(`/zalo/accounts/${accountId}`);
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
      await api.patch(`/zalo/accounts/${accountId}/default`);
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
      const response = await api.post('/zalo/accounts/login-qr');
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
      await api.post(`/zalo/accounts/${accountId}/restore-session`);
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
        const response = await api.get(`/zalo/accounts/login-qr/${qrPreview.sessionKey}/status`);
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
          <p className="text-gray-500 mt-1">{t('zaloSettings.description')}</p>
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
    </div>
  );
};

export default ZaloSettings;
