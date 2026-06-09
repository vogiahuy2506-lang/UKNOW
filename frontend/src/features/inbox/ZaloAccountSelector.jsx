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
        setAccounts(payload.data.accounts.map(account => ({
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

  const handleSync = async () => {
    setIsSyncing(true);
    setIsOpen(false);
    try {
      const response = await chatbotApi.syncZaloAll();
      // Check nested response structure
      const payload = response.data || response;
      if (payload?.success) {
        toast.success(t('inbox.syncSuccess') || 'Đồng bộ thành công');
        await fetchAccounts();
        onSyncComplete?.();
      } else {
        // Show specific error message from backend
        const errorMsg = payload?.message || t('inbox.syncFailed');
        toast.error(errorMsg);
        // If session expired, refresh status
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

  const selectedAccount = accounts.find(a => a.id === selectedAccountId) || accounts[0];
  const hasExpiredAccounts = accounts.some(a => !a.hasSession);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
        <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-gray-500">{t('common.loading')}</span>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <button
        type="button"
        onClick={() => {
          console.log('Navigating to /app/settings/channels');
          navigate('/app/settings/channels');
        }}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-orange-50 rounded-lg border border-orange-200 hover:bg-orange-100 hover:border-orange-300 transition-colors group"
      >
        <HiExclamationCircle className="w-4 h-4 text-orange-400 flex-shrink-0" />
        <p className="text-xs text-orange-600 flex-1 text-left">{t('inbox.noZaloAccount')}</p>
        <HiExternalLink className="w-3.5 h-3.5 text-orange-400 group-hover:text-orange-500 flex-shrink-0" />
      </button>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
          hasExpiredAccounts
            ? 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100'
            : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
        }`}
      >
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0 ${
          hasExpiredAccounts ? 'bg-yellow-500' : 'bg-gray-500'
        }`}>
          {selectedAccount?.displayName?.[0]?.toUpperCase() || <HiUser className="w-4 h-4" />}
        </div>
        
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-medium text-gray-700 truncate">
            {selectedAccount?.displayName || 'Zalo'}
          </p>
          <p className="text-xs text-gray-400">
            {selectedAccount?.hasSession 
              ? `${selectedAccount.conversationCount || 0} ${t('inbox.conversations')}`
              : t('inbox.sessionExpired')
            }
          </p>
        </div>
        
        {hasExpiredAccounts && (
          <HiExclamationCircle className="w-4 h-4 text-yellow-500 flex-shrink-0" />
        )}
        
        <HiChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Sync button */}
      <button
        onClick={handleSync}
        disabled={isSyncing}
        className={`w-full mt-1.5 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium transition-colors ${
          isSyncing
            ? 'bg-gray-50 text-gray-400 cursor-not-allowed'
            : 'bg-white text-gray-600 hover:bg-gray-50'
        }`}
      >
        {isSyncing ? (
          <>
            <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            <span>{t('inbox.syncing')}</span>
          </>
        ) : (
          <>
            <HiRefresh className="w-3.5 h-3.5" />
            <span>{t('inbox.syncNow')}</span>
          </>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-lg shadow-lg border border-gray-200 z-30 overflow-hidden animate-fade-in">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
            <p className="text-xs font-medium text-gray-500">
              {t('inbox.zaloAccounts')} ({accounts.length})
            </p>
            {hasExpiredAccounts && (
              <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 text-[10px] font-medium rounded">
                {t('inbox.sessionExpired')}
              </span>
            )}
          </div>

          <div className="py-1 max-h-48 overflow-y-auto">
            {accounts.map((account) => (
              <button
                key={account.id}
                onClick={() => handleSelectAccount(account.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition-colors ${
                  account.id === selectedAccountId ? 'bg-primary-50' : ''
                }`}
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-medium ${
                  account.hasSession ? 'bg-gray-500' : 'bg-gray-300'
                }`}>
                  {account.displayName?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">
                    {account.displayName || 'Zalo'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {account.hasSession 
                      ? `${account.conversationCount || 0} ${t('inbox.conversations')}`
                      : t('inbox.sessionExpired')
                    }
                  </p>
                </div>
                {account.id === selectedAccountId && (
                  <HiCheck className="w-4 h-4 text-primary-500" />
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
