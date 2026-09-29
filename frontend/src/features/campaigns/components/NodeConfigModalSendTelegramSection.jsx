/**
 * PLAN_PR7_NODE_TELEGRAM_TRINH_DUNG_2026-09-28 Việc 4 — hộp cấu hình node `send_telegram`.
 * v1: một tài khoản, một nguồn người nhận (hội thoại đang mở HOẶC nhập tay chat id), một ô soạn
 * tin (không nhiều bước, không mẫu tin — khác Zalo). Khuôn UI/trạng thái mượn từ
 * NodeConfigModalSelectZaloAccountSection.jsx (loading/error/empty cho danh sách tài khoản).
 *
 * @param {Object} props
 * @param {Object} props.formData
 * @param {Function} props.setFormData
 * @param {Array<{id: number, name: string, username: string|null, openConversationCount?: number}>} props.telegramAccounts
 * @param {'idle'|'loading'|'loaded'|'error'} [props.telegramAccountsStatus='loaded']
 * @param {string} [props.telegramAccountsError]
 * @param {Function} [props.onRetryTelegramAccounts]
 * @returns {JSX.Element}
 */
import { useI18n } from '../../../i18n';

export const NodeConfigSendTelegramSection = ({
  formData,
  setFormData,
  telegramAccounts = [],
  telegramAccountsStatus = 'loaded',
  telegramAccountsError = '',
  onRetryTelegramAccounts,
}) => {
  const { t } = useI18n();
  const isEmptyAfterSuccess = telegramAccountsStatus === 'loaded' && telegramAccounts.length === 0;
  const messageValue = formData.steps?.[0]?.message || '';
  // PLAN_TELEGRAM_0_NGUOI_NHAN_2026-09-29 Việc 3 — cảnh báo khi nguồn là hội thoại mà tài khoản đang
  // chọn chưa có hội thoại mở nào. Chỉ cảnh báo khi BE trả số (số thiếu = không biết = không cảnh báo).
  const selectedAccount = telegramAccounts.find((a) => String(a.id) === String(formData.telegramAccountId || ''));
  const isConversationSource = (formData.recipientSource || 'telegram_conversations') === 'telegram_conversations';
  const showNoConversationsWarning = Boolean(
    selectedAccount
    && isConversationSource
    && Number.isFinite(selectedAccount.openConversationCount)
    && selectedAccount.openConversationCount === 0
  );

  const handleMessageChange = (value) => {
    setFormData((prev) => ({
      ...prev,
      steps: [{ ...(prev.steps?.[0] || {}), message: value }],
    }));
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('telegramNodeSend.nodeName')}</label>
        <input
          type="text"
          value={formData.label}
          onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          placeholder={t('telegramNodeSend.nodeNamePlaceholder')}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t('telegramNodeSend.accountRequired')} <span className="text-red-500">*</span>
        </label>
        <select
          value={formData.telegramAccountId || ''}
          onChange={(e) => setFormData((prev) => ({ ...prev, telegramAccountId: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
        >
          <option value="">-- {t('telegramNodeSend.selectAccount')} --</option>
          {telegramAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
              {account.username ? ` (@${account.username})` : ''}
              {Number.isFinite(account.openConversationCount)
                ? ` (${t('telegramNodeSend.conversationCount', { count: account.openConversationCount })})`
                : ''}
            </option>
          ))}
        </select>

        {telegramAccountsStatus === 'loading' && (
          <p role="status" className="mt-1 text-sm text-gray-500">{t('telegramNodeSend.loadingAccounts')}</p>
        )}

        {telegramAccountsStatus === 'error' && (
          <div role="alert" className="mt-2 bg-red-50 border border-red-200 p-3 rounded-lg text-sm text-red-700 space-y-2">
            <p className="font-medium">{t('telegramNodeSend.loadFailed')}</p>
            {telegramAccountsError && <p className="text-xs break-words">{telegramAccountsError}</p>}
            {onRetryTelegramAccounts && (
              <button
                type="button"
                onClick={onRetryTelegramAccounts}
                className="px-3 py-1.5 text-xs font-semibold bg-white border border-red-300 text-red-700 rounded-lg hover:bg-red-100"
              >
                {t('telegramNodeSend.retry')}
              </button>
            )}
          </div>
        )}

        {isEmptyAfterSuccess && (
          <div className="mt-2 bg-amber-50 p-3 rounded-lg text-sm text-amber-700">
            {t('telegramNodeSend.noAccountsAvailable')}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('telegramNodeSend.recipientSource')}</label>
        <select
          value={formData.recipientSource || 'telegram_conversations'}
          onChange={(e) => setFormData((prev) => ({ ...prev, recipientSource: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
        >
          <option value="telegram_conversations">{t('telegramNodeSend.sourceConversations')}</option>
          <option value="manual">{t('telegramNodeSend.sourceManual')}</option>
        </select>
        <p className="mt-1 text-xs text-gray-500">{t('telegramNodeSend.recipientSourceNote')}</p>
        {showNoConversationsWarning && (
          <div role="alert" className="mt-2 bg-amber-50 border border-amber-200 p-3 rounded-lg text-sm text-amber-700">
            {t('telegramNodeSend.noConversationsWarning')}
          </div>
        )}
      </div>

      {formData.recipientSource === 'manual' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('telegramNodeSend.chatIdsLabel')}</label>
          <textarea
            rows={4}
            value={formData.recipientKeys || ''}
            onChange={(e) => setFormData((prev) => ({ ...prev, recipientKeys: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 font-mono text-sm"
            placeholder={t('telegramNodeSend.chatIdsPlaceholder')}
          />
          <p className="mt-1 text-xs text-gray-500">{t('telegramNodeSend.chatIdsHint')}</p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t('telegramNodeSend.messageRequired')} <span className="text-red-500">*</span>
        </label>
        <textarea
          rows={6}
          value={messageValue}
          onChange={(e) => handleMessageChange(e.target.value)}
          maxLength={4000}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          placeholder={t('telegramNodeSend.messagePlaceholder')}
        />
        <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
          <span>{t('telegramNodeSend.variableHint')}</span>
          <span>{messageValue.length}/4000</span>
        </div>
      </div>
    </div>
  );
};

export default NodeConfigSendTelegramSection;
