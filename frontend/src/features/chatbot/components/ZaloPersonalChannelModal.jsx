import { useState, useEffect, useCallback } from 'react';
import { HiOutlineSparkles, HiOutlineChevronDown, HiOutlineChevronRight, HiOutlineXCircle, HiOutlineCheckCircle } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useI18n } from '../../../i18n';
import chatbotApi from '../../chatbot/services/chatbotApi.service';
import { AIConfig } from '../../chatbot/components/ChatbotSettingsComponents';
import zaloSettingsApiService from '../../settings/services/zaloSettingsApi.service';

/**
 * Zalo Personal Channel Modal - contains full chatbot settings for each Zalo personal account
 */
export default function ZaloPersonalChannelModal({ open, onClose }) {
  const { t } = useI18n();
  const [accounts, setAccounts] = useState([]);
  const [chatbotSettings, setChatbotSettings] = useState({}); // { [zaloSettingId]: settings }
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch Zalo personal accounts
      const accountsRes = await zaloSettingsApiService.listAccounts();
      const normalizedAccounts = (accountsRes.data?.data?.items || [])
        .filter(acc => acc.status === 'connected' && acc.isActive)
        .map(acc => ({
          id: String(acc.id),
          displayName: acc.displayName || 'Zalo Account',
          zaloName: acc.zaloName || '',
          status: acc.status,
          isActive: acc.isActive,
        }));

      setAccounts(normalizedAccounts);

      // Fetch chatbot settings for all accounts
      const settingsRes = await chatbotApi.listZaloAccountsWithChatbotSettings();
      const settingsMap = {};
      (settingsRes.data?.data || []).forEach(setting => {
        settingsMap[setting.id_zalo_setting] = setting;
      });
      setChatbotSettings(settingsMap);
    } catch (error) {
      console.error('[ZaloPersonalChannelModal] Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open, fetchData]);

  const handleToggle = async (account, enabled) => {
    try {
      const res = await chatbotApi.toggleZaloAccountChatbot(account.id, enabled);
      setChatbotSettings(prev => ({ ...prev, [account.id]: res.data?.data }));
      toast.success(enabled ? t('zaloPersonalChatbot.enabled') : t('zaloPersonalChatbot.disabled'));
    } catch (error) {
      console.error('[ZaloPersonalChannelModal] Toggle failed:', error);
      toast.error(t('zaloPersonalChatbot.toggleFailed'));
    }
  };

  const handleSaveConfig = async (account, formData) => {
    try {
      const res = await chatbotApi.updateZaloAccountChatbotSettings(account.id, formData);
      setChatbotSettings(prev => ({ ...prev, [account.id]: res.data?.data }));
      toast.success(t('zaloPersonalChatbot.settingsSaved'));
    } catch (error) {
      console.error('[ZaloPersonalChannelModal] Save failed:', error);
      toast.error(t('zaloPersonalChatbot.saveFailed'));
    }
  };

  const enabledCount = Object.values(chatbotSettings).filter(s => s?.is_enabled).length;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center text-lg font-bold">
              ZP
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-800">{t('zaloPersonalChatbot.title')}</h3>
              <p className="text-xs text-slate-400">
                {accounts.length} {t('zaloPersonalChatbot.accountsConnected')}
                {enabledCount > 0 && ` • ${enabledCount} ${t('zaloPersonalChatbot.chatbotEnabled')}`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center">
            <HiOutlineXCircle className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-6">
              <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-300 mb-3">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-600 mb-1">{t('zaloPersonalChatbot.noAccounts')}</p>
              <p className="text-xs text-slate-400">Vui lòng kết nối tài khoản Zalo cá nhân trước</p>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {accounts.map(account => {
                const settings = chatbotSettings[account.id] || {};
                const isEnabled = settings?.is_enabled || false;

                return (
                  <div
                    key={account.id}
                    className={`rounded-xl border transition-all ${
                      isEnabled
                        ? 'bg-green-50/50 border-green-200'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    {/* Account Header */}
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                          isEnabled ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'
                        }`}>
                          {isEnabled ? (
                            <HiOutlineCheckCircle className="w-5 h-5" />
                          ) : (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{account.displayName}</p>
                          <p className="text-xs text-slate-500">
                            {isEnabled ? t('zaloPersonalChatbot.chatbotEnabled') : t('zaloPersonalChatbot.chatbotDisabled')}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center">
                        {/* Toggle */}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isEnabled}
                          onClick={() => handleToggle(account, !isEnabled)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            isEnabled ? 'bg-green-500' : 'bg-gray-200'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                              isEnabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end shrink-0">
          <button onClick={onClose} className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-xl transition-colors">
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Inline settings form for a single Zalo personal account
 */
function AccountSettingsForm({ account, settings, onSave }) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    is_enabled: settings?.is_enabled || false,
    welcome_message: settings?.welcome_message || '',
    ai_model: settings?.ai_model || 'gemini-2.5-flash',
    temperature: settings?.temperature || 0.7,
    max_tokens: settings?.max_tokens || 2048,
    response_style: settings?.response_style || 'friendly',
  });

  useEffect(() => {
    setForm({
      is_enabled: settings?.is_enabled || false,
      welcome_message: settings?.welcome_message || '',
      ai_model: settings?.ai_model || 'gemini-2.5-flash',
      temperature: settings?.temperature || 0.7,
      max_tokens: settings?.max_tokens || 2048,
      response_style: settings?.response_style || 'friendly',
    });
  }, [settings]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <AIConfig
        config={form}
        onChange={updated => setForm(p => ({ ...p, ...updated }))}
        options={{ showSystemInstruction: false, compact: true }}
      />
      <div className="flex justify-end pt-2 border-t border-slate-100">
        <button
          type="submit"
          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {t('common.save')}
        </button>
      </div>
    </form>
  );
}
