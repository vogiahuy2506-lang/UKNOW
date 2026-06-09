import { useState, useEffect } from 'react';
import { HiChevronDown, HiRefresh, HiCheck, HiUser } from 'react-icons/hi';
import { useI18n } from '../../i18n';
import chatbotApi from '../../features/chatbot/services/chatbotApi.service';

const ZaloAccountSelector = ({ onAccountChange, selectedAccountId }) => {
  const { t } = useI18n();
  const [accounts, setAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Fetch connected accounts
  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    setIsLoading(true);
    try {
      const response = await chatbotApi.getZaloSyncStatus();
      // Always show accounts list if any exist (even disconnected ones)
      if (response.success && response.data?.accounts?.length > 0) {
        // Map accounts from the new array format
        setAccounts(response.data.accounts.map(account => ({
          id: account.id,
          displayName: account.displayName || 'Zalo Cá nhân',
          isActive: true,
          hasSession: account.hasActiveSession,
          conversationCount: account.conversationCount,
        })));
        // Auto-select first account if none selected
        if (!selectedAccountId && response.data.accounts.length > 0) {
          onAccountChange?.(response.data.accounts[0].id);
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

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const response = await chatbotApi.syncZaloAll();
      if (response.success) {
        await fetchAccounts();
      }
    } catch (err) {
      console.error('Failed to sync Zalo:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const selectedAccount = accounts.find(a => a.id === selectedAccountId) || accounts[0];

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg">
        <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-gray-500">{t('common.loading')}</span>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
        <span className="text-sm text-red-600">{t('inbox.noZaloAccount')}</span>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors"
      >
        <div className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center text-white text-xs font-medium">
          {selectedAccount?.displayName?.[0]?.toUpperCase() || 'Z'}
        </div>
        <div className="text-left">
          <p className="text-sm font-medium text-gray-900">
            {selectedAccount?.displayName || 'Zalo Cá nhân'}
          </p>
          <div className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${selectedAccount?.hasSession ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-xs text-gray-500">
              {selectedAccount?.hasSession ? t('inbox.connected') : t('inbox.sessionExpired')}
            </span>
          </div>
        </div>
        <HiChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)} 
          />
          
          {/* Menu */}
          <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-20 overflow-hidden">
            {/* Header */}
            <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
              <p className="text-xs font-medium text-gray-500 uppercase">
                {t('inbox.zaloAccounts')}
              </p>
            </div>

            {/* Account list */}
            <div className="py-1">
              {accounts.map((account) => (
                <button
                  key={account.id}
                  onClick={() => {
                    if (onAccountChange) onAccountChange(account.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition-colors ${
                    account.id === selectedAccountId ? 'bg-primary-50' : ''
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${
                    account.hasSession ? 'bg-orange-500' : 'bg-gray-400'
                  }`}>
                    {account.displayName?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-gray-900">
                      {account.displayName || 'Zalo Cá nhân'}
                    </p>
                    <div className="flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${account.hasSession ? 'bg-green-500' : 'bg-red-500'}`} />
                      <span className="text-xs text-gray-500">
                        {account.hasSession ? t('inbox.online') : t('inbox.offline')}
                      </span>
                    </div>
                  </div>
                  {account.id === selectedAccountId && (
                    <HiCheck className="w-4 h-4 text-primary-500" />
                  )}
                </button>
              ))}
            </div>

            {/* Sync button */}
            <div className="px-3 py-2 border-t border-gray-100">
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSyncing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm">{t('inbox.syncing')}</span>
                  </>
                ) : (
                  <>
                    <HiRefresh className="w-4 h-4" />
                    <span className="text-sm">{t('inbox.syncNow')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ZaloAccountSelector;
