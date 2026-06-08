import { useState, useEffect, useCallback } from 'react';
import { HiOutlineSparkles, HiOutlineChevronDown, HiOutlineChevronRight, HiOutlineXCircle } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import chatbotApi from '../../features/chatbot/services/chatbotApi.service';
import zaloSettingsApiService from '../../features/settings/services/zaloSettingsApi.service';

/**
 * Zalo Personal Chatbot Section for Chatbot Studio
 * Shows connected Zalo personal accounts and allows enabling chatbot auto-reply for each
 */
export default function ZaloPersonalChatbotSection({ chatbotId }) {
  const { t } = useI18n();
  const [accounts, setAccounts] = useState([]);
  const [chatbotSettings, setChatbotSettings] = useState({}); // { [zaloSettingId]: settings }
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [configModal, setConfigModal] = useState({ isOpen: false, account: null, settings: null });
  const [subAssistants, setSubAssistants] = useState([]);

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
      console.error('[ZaloPersonalChatbotSection] Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleToggle = async (account, enabled) => {
    try {
      const res = await chatbotApi.toggleZaloAccountChatbot(account.id, enabled);
      setChatbotSettings(prev => ({ ...prev, [account.id]: res.data?.data }));
      toast.success(enabled ? t('zaloPersonalChatbot.enabled') : t('zaloPersonalChatbot.disabled'));
    } catch (error) {
      console.error('[ZaloPersonalChatbotSection] Toggle failed:', error);
      toast.error(t('zaloPersonalChatbot.toggleFailed'));
    }
  };

  const handleOpenConfig = async (account) => {
    setConfigModal({ isOpen: true, account, settings: null });

    // Fetch settings and sub-assistants
    try {
      const [settingsRes, saRes] = await Promise.all([
        chatbotApi.getZaloAccountChatbotSettings(account.id),
        chatbotApi.listSubAssistants(),
      ]);
      setChatbotSettings(prev => ({ ...prev, [account.id]: settingsRes.data?.data }));
      setSubAssistants(saRes.data?.data || []);
    } catch (error) {
      console.error('[ZaloPersonalChatbotSection] Failed to fetch config:', error);
    }
  };

  const handleSaveConfig = async (account, formData) => {
    try {
      const res = await chatbotApi.updateZaloAccountChatbotSettings(account.id, formData);
      setChatbotSettings(prev => ({ ...prev, [account.id]: res.data?.data }));
      setConfigModal({ isOpen: false, account: null, settings: null });
      toast.success(t('zaloPersonalChatbot.settingsSaved'));
    } catch (error) {
      console.error('[ZaloPersonalChatbotSection] Save failed:', error);
      toast.error(t('zaloPersonalChatbot.saveFailed'));
    }
  };

  const connectedCount = accounts.length;
  const enabledCount = Object.values(chatbotSettings).filter(s => s?.is_enabled).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="text-center py-4 text-xs text-slate-400">
        {t('zaloPersonalChatbot.noAccounts')}
      </div>
    );
  }

  return (
    <div className="mt-4">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-orange-50 rounded-xl hover:bg-orange-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
              <circle cx="8.5" cy="12" r="1.5"/>
              <circle cx="12" cy="12" r="1.5"/>
              <circle cx="15.5" cy="12" r="1.5"/>
            </svg>
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-slate-700">{t('zaloPersonalChatbot.title')}</p>
            <p className="text-xs text-slate-500">
              {connectedCount} {t('zaloPersonalChatbot.accountsConnected')}
              {enabledCount > 0 && ` • ${enabledCount} ${t('zaloPersonalChatbot.chatbotEnabled')}`}
            </p>
          </div>
        </div>
        {expanded ? (
          <HiOutlineChevronDown className="w-5 h-5 text-slate-400" />
        ) : (
          <HiOutlineChevronRight className="w-5 h-5 text-slate-400" />
        )}
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="mt-2 space-y-2">
          {accounts.map(account => {
            const settings = chatbotSettings[account.id] || {};
            const isEnabled = settings?.is_enabled || false;

            return (
              <div
                key={account.id}
                className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${
                  isEnabled ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    isEnabled ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'
                  }`}>
                    <HiOutlineSparkles className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">
                      {account.displayName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {isEnabled
                        ? t('zaloPersonalChatbot.chatbotEnabled')
                        : t('zaloPersonalChatbot.chatbotDisabled')}
                      {settings.sub_assistant_name && (
                        <span className="ml-1">• {settings.sub_assistant_name}</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Toggle */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isEnabled}
                    onClick={() => handleToggle(account, !isEnabled)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      isEnabled ? 'bg-green-500' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                        isEnabled ? 'translate-x-4' : 'translate-x-1'
                      }`}
                    />
                  </button>

                  {/* Settings */}
                  <button
                    type="button"
                    onClick={() => handleOpenConfig(account)}
                    className="p-1.5 rounded-md hover:bg-white text-slate-400 hover:text-indigo-600 transition-colors"
                    title={t('zaloPersonalChatbot.settings')}
                  >
                    <HiOutlineSparkles className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Config Modal */}
      {configModal.isOpen && configModal.account && (
        <ZaloPersonalChatbotConfigModal
          account={configModal.account}
          settings={chatbotSettings[configModal.account.id] || {}}
          subAssistants={subAssistants}
          onSave={(formData) => handleSaveConfig(configModal.account, formData)}
          onClose={() => setConfigModal({ isOpen: false, account: null, settings: null })}
        />
      )}
    </div>
  );
}

/**
 * Configuration Modal for Zalo Personal Chatbot
 */
function ZaloPersonalChatbotConfigModal({ account, settings, subAssistants, onSave, onClose }) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    is_enabled: settings?.is_enabled || false,
    id_sub_assistant: settings?.id_sub_assistant || '',
    welcome_message: settings?.welcome_message || '',
    ai_model: settings?.ai_model || 'gemini-2.5-flash',
    temperature: settings?.temperature || 0.7,
    response_style: settings?.response_style || 'friendly',
  });

  useEffect(() => {
    setForm({
      is_enabled: settings?.is_enabled || false,
      id_sub_assistant: settings?.id_sub_assistant || '',
      welcome_message: settings?.welcome_message || '',
      ai_model: settings?.ai_model || 'gemini-2.5-flash',
      temperature: settings?.temperature || 0.7,
      response_style: settings?.response_style || 'friendly',
    });
  }, [settings]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-auto">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600">
              <HiOutlineSparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{t('zaloPersonalChatbot.configTitle')}</h3>
              <p className="text-xs text-gray-500">{account.displayName}</p>
            </div>
          </div>
          <button
            type="button"
            className="p-2 rounded-md hover:bg-gray-100 text-gray-500"
            onClick={onClose}
          >
            <HiOutlineXCircle className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Enable Toggle */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-700">{t('zaloPersonalChatbot.enable')}</p>
              <p className="text-xs text-gray-500">{t('zaloPersonalChatbot.enableDesc')}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.is_enabled}
              onClick={() => setForm(f => ({ ...f, is_enabled: !f.is_enabled }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                form.is_enabled ? 'bg-indigo-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  form.is_enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Sub-Assistant */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('zaloPersonalChatbot.subAssistant')}
            </label>
            <select
              value={form.id_sub_assistant}
              onChange={(e) => setForm(f => ({ ...f, id_sub_assistant: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400"
            >
              <option value="">{t('zaloPersonalChatbot.noSubAssistant')}</option>
              {subAssistants.map(sa => (
                <option key={sa.id} value={sa.id}>{sa.name}</option>
              ))}
            </select>
          </div>

          {/* Welcome Message */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('zaloPersonalChatbot.welcomeMessage')}
            </label>
            <textarea
              value={form.welcome_message}
              onChange={(e) => setForm(f => ({ ...f, welcome_message: e.target.value }))}
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 resize-none"
              placeholder={t('zaloPersonalChatbot.welcomePlaceholder')}
            />
          </div>

          {/* AI Model */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('zaloPersonalChatbot.aiModel')}
            </label>
            <select
              value={form.ai_model}
              onChange={(e) => setForm(f => ({ ...f, ai_model: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400"
            >
              <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
              <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
              <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
            </select>
          </div>

          {/* Temperature */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('zaloPersonalChatbot.temperature')}: {form.temperature}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={form.temperature}
              onChange={(e) => setForm(f => ({ ...f, temperature: parseFloat(e.target.value) }))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* Response Style */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('zaloPersonalChatbot.responseStyle')}
            </label>
            <div className="flex gap-2">
              {['friendly', 'professional', 'casual'].map(style => (
                <button
                  key={style}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, response_style: style }))}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                    form.response_style === style
                      ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {style === 'friendly' && t('zaloPersonalChatbot.styleFriendly')}
                  {style === 'professional' && t('zaloPersonalChatbot.styleProfessional')}
                  {style === 'casual' && t('zaloPersonalChatbot.styleCasual')}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
            >
              {t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
