import { useState, useEffect, useMemo, useRef } from 'react';
import { HiChevronDown, HiRefresh, HiCheck, HiExclamationCircle, HiUser, HiExternalLink } from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../../i18n';
import chatbotApi from '../../features/chatbot/services/chatbotApi.service';
import toast from 'react-hot-toast';

/**
 * Ô chọn tài khoản Zalo + nút đồng bộ.
 *
 * `statusAccounts` do trang Hộp thư nạp MỘT lần từ `GET /zalo-personal/sync/status` (chỉ đọc, H-05) rồi truyền
 * xuống — ô này không tự gọi API lấy trạng thái. Trang cũng giữ việc chọn tài khoản (đã nhớ / "tất cả"):
 * `selectedAccountId = null` nghĩa là MỌI tài khoản Zalo (H-20, H-07).
 *
 * H-20 — ô chọn chỉ hiện khi có từ 2 tài khoản (một tài khoản thì không có gì để chọn); mục đầu là "Tất cả tài khoản
 * Zalo" nên tab "Tất cả" không còn lọc ngầm một tài khoản; tài khoản hết phiên ghi mờ "cần đăng nhập lại" thay cho
 * nền vàng; dòng gợi ý đồng bộ đã chuyển vào tooltip của nút đồng bộ.
 */
const ZaloAccountSelector = ({
  selectedAccountId,
  onAccountChange,
  onSyncComplete,
  statusAccounts = [],
  isLoading = false,
  canSync = true,
  canManageChannels = true,
  /** Hiện lời mời kết nối khi chưa có tài khoản nào — chỉ nên bật ở tab Zalo, không bật ở tab "Tất cả". */
  showEmptyCta = false,
}) => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const dropdownRef = useRef(null);

  const accounts = useMemo(() => (statusAccounts || []).map((account) => {
    // `isConnected` = trạng thái trong DB (server chỉ đọc, không khôi phục phiên); bản server cũ chỉ có hasActiveSession.
    const connected = account.isConnected ?? account.hasActiveSession;
    return {
      id: account.id,
      displayName: account.displayName || account.display_name || t('inbox.zaloPersonal'),
      hasSession: connected === true,
    };
  }), [statusAccounts, t]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const selectedAccount = accounts.find((a) => String(a.id) === String(selectedAccountId)) || null;
  // Đồng bộ cần một tài khoản cụ thể: đang chọn "tất cả" thì dùng tài khoản đang kết nối đầu tiên.
  const syncAccountId = selectedAccount?.id ?? accounts.find((a) => a.hasSession)?.id ?? null;

  const handleSync = async (e) => {
    e?.stopPropagation();
    setIsSyncing(true);
    setIsOpen(false);
    try {
      const response = await chatbotApi.syncZaloAll(syncAccountId);
      const payload = response.data || response;
      const errors = payload?.data?.errors || [];
      if (payload?.success) {
        const totalGroups = payload?.data?.groups?.totalGroups ?? payload?.data?.groups?.synced;
        const synced = payload?.data?.groups?.synced;
        const historySynced = Number(payload?.data?.groupHistory?.synced || 0);
        const historyErrors = payload?.data?.groupHistory?.errors?.length || 0;
        const historyNotFound = payload?.data?.groupHistory?.notFound || 0;
        if (historySynced > 0) {
          toast.success(t('inbox.syncSuccessWithHistory', { count: historySynced }));
        } else if (historyErrors > 0 || historyNotFound > 0) {
          toast.success(t('inbox.syncSuccessHistoryPartial'));
        } else if (totalGroups != null && synced != null && Number(synced) < Number(totalGroups)) {
          toast.success(t('inbox.syncPartialGroups', { synced, total: totalGroups }));
        } else {
          toast.success(t('inbox.syncSuccess'));
        }
        onSyncComplete?.();
      } else {
        const errorMsg = payload?.message || t('inbox.syncFailed');
        toast.error(
          errors.length
            ? `${errorMsg}${errors[0]?.error ? `: ${errors[0].error}` : ''}`
            : errorMsg
        );
        if (String(errorMsg).includes('hết hạn') || String(errorMsg).includes('Session')) {
          onSyncComplete?.();
        }
      }
    } catch (err) {
      console.error('Failed to sync Zalo:', err);
      const errMsg = err?.response?.data?.message || err?.message || t('inbox.syncFailed');
      toast.error(errMsg);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSelectAccount = (accountId) => {
    onAccountChange?.(accountId);
    setIsOpen(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded-lg border border-gray-200">
        <div className="w-3.5 h-3.5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-[11px] text-gray-500">{t('common.loading')}</span>
      </div>
    );
  }

  if (accounts.length === 0) {
    if (!showEmptyCta) return null;
    if (!canManageChannels) {
      return (
        <div className="w-full flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded-lg border border-gray-200 text-left">
          <HiExclamationCircle className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <span className="text-[11px] text-gray-600 flex-1">{t('inbox.noZaloAccount')}</span>
        </div>
      );
    }
    return (
      <button
        type="button"
        onClick={() => navigate('/app/settings/channels')}
        className="w-full flex items-center gap-2 px-2 py-1.5 bg-orange-50 rounded-lg border border-orange-200 hover:bg-orange-100 transition-colors text-left"
      >
        <HiExclamationCircle className="w-3.5 h-3.5 text-orange-500 shrink-0" />
        <span className="text-[11px] text-orange-700 flex-1">{t('inbox.noZaloAccount')}</span>
        <HiExternalLink className="w-3 h-3 text-orange-500 shrink-0" />
      </button>
    );
  }

  const showPicker = accounts.length >= 2;
  const showSync = canSync && syncAccountId != null;
  if (!showPicker && !showSync) return null;

  return (
    <div className="flex items-center gap-1.5" ref={dropdownRef}>
      {showPicker && (
        <div className="relative flex-1 min-w-0">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="flex w-full min-w-0 items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-left hover:bg-gray-50 transition-colors"
          >
            <HiUser className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span className="flex-1 min-w-0 truncate text-xs font-medium text-gray-800">
              {selectedAccount ? selectedAccount.displayName : t('inbox.allZaloAccounts')}
            </span>
            <HiChevronDown className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>

          {isOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 z-30 overflow-hidden">
              <div className="py-0.5 max-h-56 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => handleSelectAccount(null)}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-gray-50 transition-colors ${
                    selectedAccount == null ? 'bg-primary-50' : ''
                  }`}
                >
                  <span className="flex-1 text-left text-xs font-medium text-gray-700">{t('inbox.allZaloAccounts')}</span>
                  {selectedAccount == null && <HiCheck className="w-3.5 h-3.5 text-primary-500 shrink-0" />}
                </button>
                {accounts.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => handleSelectAccount(account.id)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-gray-50 transition-colors ${
                      String(account.id) === String(selectedAccountId) ? 'bg-primary-50' : ''
                    }`}
                  >
                    <span className={`flex-1 min-w-0 truncate text-left text-xs ${
                      account.hasSession ? 'font-medium text-gray-700' : 'text-gray-400'
                    }`}>
                      {account.displayName}
                      {!account.hasSession && ` — ${t('inbox.accountNeedsRelogin')}`}
                    </span>
                    {String(account.id) === String(selectedAccountId) && (
                      <HiCheck className="w-3.5 h-3.5 text-primary-500 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
              {canManageChannels && (
                <button
                  type="button"
                  onClick={() => navigate('/app/settings/channels')}
                  className="w-full flex items-center gap-2 px-2.5 py-2 text-[11px] text-primary-700 border-t border-gray-100 hover:bg-primary-50"
                >
                  <HiExternalLink className="w-3.5 h-3.5" />
                  {t('inbox.manageZaloAccounts')}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {showSync && (
        <button
          type="button"
          onClick={handleSync}
          disabled={isSyncing}
          title={t('inbox.syncTooltip')}
          aria-label={t('inbox.syncTooltip')}
          className="shrink-0 rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:text-primary-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {isSyncing ? (
            <div className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <HiRefresh className="w-3.5 h-3.5" />
          )}
        </button>
      )}
    </div>
  );
};

export default ZaloAccountSelector;
