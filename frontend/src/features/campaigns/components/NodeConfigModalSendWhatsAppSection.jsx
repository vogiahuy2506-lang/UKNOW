/**
 * PLAN_WHATSAPP_DAY_DU_2026-09-29 PR-W4b — hộp cấu hình node `send_whatsapp`.
 * Khuôn từ NodeConfigModalSendTelegramSection.jsx. Một tài khoản (phiên WhatsApp của chủ workspace),
 * ba nguồn người nhận (hội thoại WhatsApp / nhập SĐT / từ khối dữ liệu phía trước), một ô soạn tin.
 * Khác Telegram: WhatsApp gửi được số lạ nên có nguồn 'node' (cùng khuôn khối email chọn khối + cột).
 *
 * config lưu: { whatsappSessionKey, recipientSource: 'whatsapp_conversations'|'manual'|'node',
 *   recipientKeys (manual) | recipientNodeId + recipientColumn (node), steps: [{ message }] }.
 *
 * @param {Object} props
 * @param {Object} props.formData
 * @param {Function} props.setFormData
 * @param {Array<{sessionKey: string, display: string, status: string, openConversationCount?: number}>} props.whatsappAccounts
 * @param {'idle'|'loading'|'loaded'|'error'} [props.whatsappAccountsStatus='loaded']
 * @param {string} [props.whatsappAccountsError]
 * @param {Function} [props.onRetryWhatsappAccounts]
 * @param {Array<Object>} [props.upstreamNodes] khối phía trước (chọn nguồn 'node')
 * @param {Array<{key: string}>} [props.sourceSchema] cột của khối đã chọn
 * @returns {JSX.Element}
 */
import { useMemo } from 'react';
import { useI18n } from '../../../i18n';
import { parseWhatsAppPhoneList } from '../utils/nodeConfigModal.helpers';

const MESSAGE_MAX = 4096;

export const NodeConfigSendWhatsAppSection = ({
  formData,
  setFormData,
  whatsappAccounts = [],
  whatsappAccountsStatus = 'loaded',
  whatsappAccountsError = '',
  onRetryWhatsappAccounts,
  upstreamNodes = [],
  sourceSchema = [],
}) => {
  const { t } = useI18n();
  const recipientSource = formData.recipientSource || 'whatsapp_conversations';
  const isConversationSource = recipientSource === 'whatsapp_conversations';
  const messageValue = formData.steps?.[0]?.message || '';
  const isEmptyAfterSuccess = whatsappAccountsStatus === 'loaded' && whatsappAccounts.length === 0;

  const selectedAccount = whatsappAccounts.find(
    (a) => String(a.sessionKey) === String(formData.whatsappSessionKey || '')
  );
  const showNotConnectedWarning = Boolean(selectedAccount && selectedAccount.status !== 'open');
  // Chỉ cảnh báo khi BE trả số (số thiếu = không biết = không cảnh báo).
  const showNoConversationsWarning = Boolean(
    selectedAccount
    && isConversationSource
    && Number.isFinite(selectedAccount.openConversationCount)
    && selectedAccount.openConversationCount === 0
  );

  const phoneParse = useMemo(
    () => (recipientSource === 'manual' ? parseWhatsAppPhoneList(formData.recipientKeys) : { valid: [], invalid: [] }),
    [recipientSource, formData.recipientKeys]
  );

  const handleSourceChange = (value) => {
    setFormData((prev) => ({
      ...prev,
      recipientSource: value,
      // recipientKeys chỉ dùng cho nhập tay -> đặt lại khi đổi nguồn.
      recipientKeys: '',
    }));
  };

  const handleMessageChange = (value) => {
    setFormData((prev) => ({
      ...prev,
      steps: [{ ...(prev.steps?.[0] || {}), message: value }],
    }));
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('whatsappNodeSend.nodeName')}</label>
        <input
          type="text"
          value={formData.label}
          onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          placeholder={t('whatsappNodeSend.nodeNamePlaceholder')}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t('whatsappNodeSend.accountRequired')} <span className="text-red-500">*</span>
        </label>
        <select
          value={formData.whatsappSessionKey || ''}
          onChange={(e) => setFormData((prev) => ({ ...prev, whatsappSessionKey: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
        >
          <option value="">-- {t('whatsappNodeSend.selectAccount')} --</option>
          {whatsappAccounts.map((account) => (
            <option key={account.sessionKey} value={account.sessionKey}>
              {account.display || account.sessionKey}
              {Number.isFinite(account.openConversationCount)
                ? ` (${t('whatsappNodeSend.conversationCount', { count: account.openConversationCount })})`
                : ''}
            </option>
          ))}
        </select>

        {whatsappAccountsStatus === 'loading' && (
          <p role="status" className="mt-1 text-sm text-gray-500">{t('whatsappNodeSend.loadingAccounts')}</p>
        )}

        {whatsappAccountsStatus === 'error' && (
          <div role="alert" className="mt-2 bg-red-50 border border-red-200 p-3 rounded-lg text-sm text-red-700 space-y-2">
            <p className="font-medium">{t('whatsappNodeSend.loadFailed')}</p>
            {whatsappAccountsError && <p className="text-xs break-words">{whatsappAccountsError}</p>}
            {onRetryWhatsappAccounts && (
              <button
                type="button"
                onClick={onRetryWhatsappAccounts}
                className="px-3 py-1.5 text-xs font-semibold bg-white border border-red-300 text-red-700 rounded-lg hover:bg-red-100"
              >
                {t('whatsappNodeSend.retry')}
              </button>
            )}
          </div>
        )}

        {isEmptyAfterSuccess && (
          <div className="mt-2 bg-amber-50 p-3 rounded-lg text-sm text-amber-700">
            {t('whatsappNodeSend.noAccountsAvailable')}
          </div>
        )}

        {showNotConnectedWarning && (
          <div role="alert" className="mt-2 bg-amber-50 border border-amber-200 p-3 rounded-lg text-sm text-amber-700">
            {t('whatsappNodeSend.notConnectedWarning')}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('whatsappNodeSend.recipientSource')}</label>
        <select
          value={recipientSource}
          onChange={(e) => handleSourceChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
        >
          <option value="whatsapp_conversations">{t('whatsappNodeSend.sourceConversations')}</option>
          <option value="manual">{t('whatsappNodeSend.sourceManual')}</option>
          <option value="node">{t('whatsappNodeSend.sourceNode')}</option>
        </select>
        <p className="mt-1 text-xs text-gray-500">{t('whatsappNodeSend.recipientSourceNote')}</p>
        {showNoConversationsWarning && (
          <div role="alert" className="mt-2 bg-amber-50 border border-amber-200 p-3 rounded-lg text-sm text-amber-700">
            {t('whatsappNodeSend.noConversationsWarning')}
          </div>
        )}
      </div>

      {recipientSource === 'manual' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('whatsappNodeSend.phonesLabel')}</label>
          <textarea
            rows={4}
            value={formData.recipientKeys || ''}
            onChange={(e) => setFormData((prev) => ({ ...prev, recipientKeys: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 font-mono text-sm"
            placeholder={t('whatsappNodeSend.phonesPlaceholder')}
          />
          <p className="mt-1 text-xs text-gray-500">{t('whatsappNodeSend.phonesHint')}</p>
          {phoneParse.invalid.length > 0 && (
            <p role="alert" data-testid="whatsapp-invalid-phones" className="mt-1 text-xs text-red-600 break-words">
              {t('whatsappNodeSend.phonesInvalid', {
                count: phoneParse.invalid.length,
                list: phoneParse.invalid.slice(0, 3).join(', '),
              })}
            </p>
          )}
          {phoneParse.valid.length > 0 && (
            <p data-testid="whatsapp-valid-phones" className="mt-1 text-xs text-gray-600">
              {t('whatsappNodeSend.phonesValidCount', { count: phoneParse.valid.length })}
            </p>
          )}
        </div>
      )}

      {recipientSource === 'node' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('whatsappNodeSend.selectDataNode')}</label>
            <select
              value={formData.recipientNodeId || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, recipientNodeId: e.target.value, recipientColumn: '' }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            >
              <option value="">{t('whatsappNodeSend.selectPreviousNode')}</option>
              {upstreamNodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.data?.label || n.data?.nodeType || n.type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('whatsappNodeSend.selectPhoneColumn')}</label>
            {sourceSchema.length ? (
              <select
                value={formData.recipientColumn || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, recipientColumn: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="">{t('whatsappNodeSend.selectColumn')}</option>
                {sourceSchema.map((f) => (
                  <option key={f.key} value={f.key}>{f.key}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={formData.recipientColumn || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, recipientColumn: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder={t('whatsappNodeSend.phoneColumnPlaceholder')}
              />
            )}
            <p className="text-xs text-gray-400 mt-1">{t('whatsappNodeSend.phoneColumnHint')}</p>
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t('whatsappNodeSend.messageRequired')} <span className="text-red-500">*</span>
        </label>
        <textarea
          rows={6}
          value={messageValue}
          onChange={(e) => handleMessageChange(e.target.value)}
          maxLength={MESSAGE_MAX}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          placeholder={t('whatsappNodeSend.messagePlaceholder')}
        />
        <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
          <span>{t('whatsappNodeSend.variableHint')}</span>
          <span>{messageValue.length}/{MESSAGE_MAX}</span>
        </div>
      </div>
    </div>
  );
};

export default NodeConfigSendWhatsAppSection;
