/**
 * PLAN_WHATSAPP_DAY_DU_2026-09-29 PR-W4b — hộp cấu hình node `send_whatsapp`.
 * Khuôn từ NodeConfigModalSendTelegramSection.jsx. Một tài khoản (phiên WhatsApp của chủ workspace),
 * ba nguồn người nhận (hội thoại WhatsApp / nhập SĐT / từ khối dữ liệu phía trước), một ô soạn tin.
 * Khác Telegram: WhatsApp gửi được số lạ nên có nguồn 'node' (cùng khuôn khối email chọn khối + cột).
 *
 * config lưu: { whatsappSessionKey, recipientSource: 'whatsapp_conversations'|'manual'|'node'|'whatsapp_groups',
 *   recipientKeys (manual: chuỗi SĐT; whatsapp_groups: mảng [{ recipientKey: '<id>@g.us', display }])
 *   | recipientNodeId + recipientColumn (node), steps: [{ message }] }.
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
 * @param {Array<Object>} [props.zaloTemplates] P5: kho mẫu tin (dùng chung với Zalo) cho ô "Chọn mẫu".
 * @param {Function} [props.fetchTemplateById] P5: lấy chi tiết mẫu (nội dung + tệp đính kèm).
 * @returns {JSX.Element}
 */
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../../i18n';
import { useAuthStore } from '../../../stores/authStore';
import { fetchWhatsAppGroupOptions, parseWhatsAppPhoneList } from '../utils/nodeConfigModal.helpers';
import ChannelStepsEditor from './ChannelStepsEditor';

const MESSAGE_MAX = 4096;

/** Nhóm đã chọn lưu ở config.recipientKeys dạng [{ recipientKey, display }]. */
const getSelectedGroups = (formData) => (
  Array.isArray(formData.recipientKeys) ? formData.recipientKeys : []
);

export const NodeConfigSendWhatsAppSection = ({
  formData,
  setFormData,
  whatsappAccounts = [],
  whatsappAccountsStatus = 'loaded',
  whatsappAccountsError = '',
  onRetryWhatsappAccounts,
  upstreamNodes = [],
  sourceSchema = [],
  zaloTemplates = [],
  fetchTemplateById,
}) => {
  const { t } = useI18n();
  // PLAN_GIAO_TK_TG_WA H2: nhân viên 0 tài khoản được giao thì câu nhắc là "chưa giao", không phải "chưa kết nối".
  const isEmployeeContext = useAuthStore((state) => state.activeContext?.type) === 'employee';
  const recipientSource = formData.recipientSource || 'whatsapp_conversations';
  const isConversationSource = recipientSource === 'whatsapp_conversations';
  const isGroupsSource = recipientSource === 'whatsapp_groups';
  const selectedGroups = getSelectedGroups(formData);
  const sessionKey = String(formData.whatsappSessionKey || '');

  const [groups, setGroups] = useState([]);
  const [groupsStatus, setGroupsStatus] = useState('idle'); // idle | loading | loaded | error
  const [groupsError, setGroupsError] = useState('');
  const [groupsFilter, setGroupsFilter] = useState('');

  // Đổi tài khoản -> bỏ danh sách đã tải (jid nhóm thuộc về từng phiên).
  useEffect(() => {
    setGroups([]);
    setGroupsStatus('idle');
    setGroupsError('');
    setGroupsFilter('');
  }, [sessionKey]);

  const handleLoadGroups = async () => {
    if (!sessionKey) return;
    setGroupsStatus('loading');
    setGroupsError('');
    try {
      const items = await fetchWhatsAppGroupOptions(sessionKey);
      setGroups(items);
      setGroupsStatus('loaded');
    } catch (error) {
      setGroups([]);
      setGroupsError(error?.response?.data?.message || error?.message || '');
      setGroupsStatus('error');
    }
  };

  const toggleGroup = (group) => {
    const key = String(group.recipientKey);
    setFormData((prev) => {
      const current = getSelectedGroups(prev);
      const exists = current.some((g) => String(g.recipientKey) === key);
      return {
        ...prev,
        recipientKeys: exists
          ? current.filter((g) => String(g.recipientKey) !== key)
          : [...current, { recipientKey: key, display: group.title }],
      };
    });
  };

  const visibleGroups = useMemo(() => {
    const q = groupsFilter.trim().toLowerCase();
    return q ? groups.filter((g) => String(g.title || '').toLowerCase().includes(q)) : groups;
  }, [groups, groupsFilter]);

  const handleAccountChange = (value) => {
    setFormData((prev) => ({
      ...prev,
      whatsappSessionKey: value,
      // Nhóm đã chọn thuộc phiên cũ -> xoá khi đổi tài khoản.
      ...(prev.recipientSource === 'whatsapp_groups' ? { recipientKeys: [] } : {}),
    }));
  };
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
      // recipientKeys khác kiểu giữa nguồn nhóm (mảng object) và nhập tay (chuỗi) -> đặt lại khi đổi nguồn.
      recipientKeys: value === 'whatsapp_groups' ? [] : '',
    }));
  };

  // P8b — nguồn "khối dữ liệu": mỗi cột là một biến dùng được trong nội dung ({{tên cột}}) — backend khớp tên cột chính
  // xác/không phân biệt hoa thường/ngữ nghĩa (tên, họ tên, email, SĐT) cho từng người nhận.
  const showColumnVariables = recipientSource === 'node' && sourceSchema.length > 0;
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
          onChange={(e) => handleAccountChange(e.target.value)}
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
            {isEmployeeContext ? t('whatsappNodeSend.noAccountsAssigned') : t('whatsappNodeSend.noAccountsAvailable')}
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
          <option value="whatsapp_groups">{t('whatsappNodeSend.sourceGroups')}</option>
        </select>
        <p className="mt-1 text-xs text-gray-500">{t('whatsappNodeSend.recipientSourceNote')}</p>
        {showNoConversationsWarning && (
          <div role="alert" className="mt-2 bg-amber-50 border border-amber-200 p-3 rounded-lg text-sm text-amber-700">
            {t('whatsappNodeSend.noConversationsWarning')}
          </div>
        )}
      </div>

      {isGroupsSource && (
        <div data-testid="whatsapp-groups-picker" className="space-y-2">
          <p className="text-xs text-gray-500">{t('whatsappNodeSend.groupsHint')}</p>
          {!sessionKey ? (
            <p className="text-sm text-amber-700">{t('whatsappNodeSend.groupsPickAccountFirst')}</p>
          ) : (
            <button
              type="button"
              onClick={handleLoadGroups}
              disabled={groupsStatus === 'loading'}
              className="px-3 py-1.5 text-sm font-semibold bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-60"
            >
              {groupsStatus === 'loaded' ? t('whatsappNodeSend.reloadGroups') : t('whatsappNodeSend.loadGroups')}
            </button>
          )}
          {groupsStatus === 'loading' && (
            <p role="status" className="text-sm text-gray-500">{t('whatsappNodeSend.loadingGroups')}</p>
          )}
          {groupsStatus === 'error' && (
            <div role="alert" className="bg-red-50 border border-red-200 p-3 rounded-lg text-sm text-red-700">
              <p className="font-medium">{t('whatsappNodeSend.groupsLoadFailed')}</p>
              {groupsError && <p className="text-xs break-words">{groupsError}</p>}
            </div>
          )}
          {groupsStatus === 'loaded' && groups.length === 0 && (
            <div className="bg-amber-50 p-3 rounded-lg text-sm text-amber-700">{t('whatsappNodeSend.groupsEmpty')}</div>
          )}
          {groupsStatus === 'loaded' && groups.length > 0 && (
            <>
              <input
                type="text"
                value={groupsFilter}
                onChange={(e) => setGroupsFilter(e.target.value)}
                placeholder={t('whatsappNodeSend.groupsFilterPlaceholder')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
              />
              <ul className="max-h-56 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                {visibleGroups.map((group) => {
                  const checked = selectedGroups.some((g) => String(g.recipientKey) === String(group.recipientKey));
                  return (
                    <li key={group.recipientKey}>
                      <label className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                        <input type="checkbox" checked={checked} onChange={() => toggleGroup(group)} />
                        <span className="flex-1 truncate">{group.title}</span>
                        {Number.isFinite(group.membersCount) && (
                          <span className="text-xs text-gray-400">
                            {t('whatsappNodeSend.groupsMembers', { count: group.membersCount })}
                          </span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <p className="text-xs text-gray-600" data-testid="whatsapp-groups-selected">
            {t('whatsappNodeSend.groupsSelectedCount', { count: selectedGroups.length })}
          </p>
          {selectedGroups.length > 0 && groupsStatus !== 'loaded' && (
            <ul className="text-xs text-gray-500 list-disc pl-5">
              {selectedGroups.map((g) => (
                <li key={g.recipientKey}>{g.display || g.recipientKey}</li>
              ))}
            </ul>
          )}
        </div>
      )}

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

      {/* P7 — nhiều bước (tối đa 5), bước 2+ có "gửi sau … kể từ bước trước"; mỗi bước có mẫu/đính kèm (P5). */}
      <ChannelStepsEditor
        channel="whatsapp"
        steps={formData.steps}
        setFormData={setFormData}
        templates={zaloTemplates}
        fetchTemplateById={fetchTemplateById}
        messageMax={MESSAGE_MAX}
        i18nPrefix="whatsappNodeSend"
        columnVariableKeys={showColumnVariables ? sourceSchema.map((f) => f.key) : []}
      />
    </div>
  );
};

export default NodeConfigSendWhatsAppSection;
