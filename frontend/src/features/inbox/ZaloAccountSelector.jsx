import { useState, useEffect, useRef } from 'react';
import { HiChevronDown, HiRefresh, HiCheck, HiExclamationCircle, HiUser, HiExternalLink } from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../../i18n';
import chatbotApi from '../../features/chatbot/services/chatbotApi.service';
import toast from 'react-hot-toast';

const ZaloAccountSelector = ({ selectedAccountId, onAccountChange, onSyncComplete }) => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [accounts, setAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const dropdownRef = useRef(null);

  const fetchAccounts = async () => {
    setIsLoading(true);
    try {
      const response = await chatbotApi.getZaloSyncStatus();
      const payload = response.data || response;
      if (payload?.success && payload?.data?.accounts?.length > 0) {
        setAccounts(payload.data.accounts.map((account) => ({
          id: account.id,
          displayName: account.displayName || account.display_name || 'Zalo Cá nhân',
          isActive: account.status === 'connected' && account.hasActiveSession,
          hasSession: account.hasActiveSession,
          conversationCount: account.conversationCount,
        })));
        if (!selectedAccountId && payload.data.accounts.length > 0) {
          onAccountChange?.(payload.data.accounts[0].id);
        }
      } else {
        setAccounts([]);
      }
    } catch (err) {
      console.error('Failed to fetch Zalo accounts:', err);
      setAccounts([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleSync = async (e) => {
    e?.stopPropagation();
    setIsSyncing(true);
    setIsOpen(false);
    try {
      const response = await chatbotApi.syncZaloAll();
      const payload = response.data || response;
      if (payload?.success) {
        toast.success(t('inbox.syncSuccess') || 'Đồng bộ thành công');
        await fetchAccounts();
        onSyncComplete?.();
      } else {
        const errorMsg = payload?.message || t('inbox.syncFailed');
        toast.error(errorMsg);
        if (errorMsg.includes('hết hạn') || errorMsg.includes('Session')) {
          await fetchAccounts();
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

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) || accounts[0];
  const hasExpiredAccounts = accounts.some((a) => !a.hasSession);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded-lg border border-gray-200">
        <div className="w-3.5 h-3.5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-[11px] text-gray-500">{t('common.loading')}</span>
      </div>
    );
  }

  if (accounts.length === 0) {
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

  return (
    <div className="relative" ref={dropdownRef}>
      <div
        className={`flex items-center gap-1 rounded-lg border ${
          hasExpiredAccounts
            ? 'bg-amber-50 border-amber-200'
            : 'bg-gray-50 border-gray-200'
        }`}
      >
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex flex-1 min-w-0 items-center gap-2 px-2 py-1.5 text-left hover:bg-black/5 rounded-l-lg transition-colors"
        >
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold shrink-0 ${
            hasExpiredAccounts ? 'bg-amber-500' : 'bg-gray-500'
          }`}>
            {selectedAccount?.displayName?.[0]?.toUpperCase() || <HiUser className="w-3 h-3" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-800 truncate">
              {selectedAccount?.displayName || 'Zalo'}
            </p>
            <p className="text-[10px] text-gray-500 truncate">
              {selectedAccount?.hasSession
                ? `${selectedAccount.conversationCount || 0} ${t('inbox.conversations')}`
                : t('inbox.sessionExpired')}
            </p>
          </div>
          <HiChevronDown className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        <button
          type="button"
          onClick={handleSync}
          disabled={isSyncing}
          title={t('inbox.syncNow')}
          className="shrink-0 p-2 border-l border-gray-200/80 text-gray-500 hover:text-primary-600 hover:bg-white/60 rounded-r-lg transition-colors disabled:opacity-50"
        >
          {isSyncing ? (
            <div className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <HiRefresh className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 z-30 overflow-hidden">
          <div className="px-2.5 py-1.5 border-b border-gray-100 flex items-center justify-between">
            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
              {t('inbox.zaloAccounts')} ({accounts.length})
            </p>
            {hasExpiredAccounts && (
              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-medium rounded">
                {t('inbox.sessionExpired')}
              </span>
            )}
          </div>
          <div className="py-0.5 max-h-40 overflow-y-auto">
            {accounts.map((account) => (
              <button
                key={account.id}
                type="button"
                onClick={() => handleSelectAccount(account.id)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-gray-50 transition-colors ${
                  account.id === selectedAccountId ? 'bg-primary-50' : ''
                }`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-medium ${
                  account.hasSession ? 'bg-gray-500' : 'bg-gray-300'
                }`}>
                  {account.displayName?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-xs font-medium text-gray-700 truncate">{account.displayName}</p>
                  <p className="text-[10px] text-gray-400">
                    {account.hasSession
                      ? `${account.conversationCount || 0} ${t('inbox.conversations')}`
                      : t('inbox.sessionExpired')}
                  </p>
                </div>
                {account.id === selectedAccountId && (
                  <HiCheck className="w-3.5 h-3.5 text-primary-500 shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ZaloAccountSelector;
