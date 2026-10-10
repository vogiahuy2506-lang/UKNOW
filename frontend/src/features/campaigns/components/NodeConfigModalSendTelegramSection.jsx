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
 * @param {string} [props.campaignType] PR-E2: 'telegram_group' -> nguồn mặc định + tuỳ chọn "Nhóm Telegram".
 * @param {Array<Object>} [props.zaloTemplates] P5: kho mẫu tin (dùng chung với Zalo) cho ô "Chọn mẫu".
 * @param {Function} [props.fetchTemplateById] P5: lấy chi tiết mẫu (nội dung + tệp đính kèm).
 * @returns {JSX.Element}
 */
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../../i18n';
import { useAuthStore } from '../../../stores/authStore';
import { fetchTelegramGroupOptions } from '../utils/nodeConfigModal.helpers';
import ChannelStepsEditor from './ChannelStepsEditor';

/** Nhóm đã chọn lưu ở config.recipientKeys dạng [{ recipientKey, display }]. */
const getSelectedGroups = (formData) => (
  Array.isArray(formData.recipientKeys) ? formData.recipientKeys : []
);

export const NodeConfigSendTelegramSection = ({
  formData,
  setFormData,
  telegramAccounts = [],
  telegramAccountsStatus = 'loaded',
  telegramAccountsError = '',
  onRetryTelegramAccounts,
  campaignType = '',
  zaloTemplates = [],
  fetchTemplateById,
}) => {
  const { t } = useI18n();
  // PLAN_GIAO_TK_TG_WA H2: nhân viên 0 tài khoản được giao thì câu nhắc là "chưa giao", không phải "chưa kết nối".
  const isEmployeeContext = useAuthStore((state) => state.activeContext?.type) === 'employee';
  const recipientSource = formData.recipientSource || (campaignType === 'telegram_group' ? 'telegram_groups' : 'telegram_conversations');
  // Nguồn nhóm: chiến dịch 'telegram_group' luôn có; chiến dịch khác chỉ hiện khi config đã lưu nguồn này.
  const showGroupsOption = campaignType === 'telegram_group' || recipientSource === 'telegram_groups';
  const isGroupsSource = recipientSource === 'telegram_groups';
  const selectedGroups = getSelectedGroups(formData);
  const accountId = String(formData.telegramAccountId || '');

  const [groups, setGroups] = useState([]);
  const [groupsStatus, setGroupsStatus] = useState('idle'); // idle | loading | loaded | error
  const [groupsError, setGroupsError] = useState('');
  const [groupsFilter, setGroupsFilter] = useState('');

  // Đổi tài khoản -> bỏ danh sách đã tải (chat id nhóm thuộc về từng tài khoản).
  useEffect(() => {
    setGroups([]);
    setGroupsStatus('idle');
    setGroupsError('');
    setGroupsFilter('');
  }, [accountId]);

  const handleLoadGroups = async () => {
    if (!accountId) return;
    setGroupsStatus('loading');
    setGroupsError('');
    try {
      const items = await fetchTelegramGroupOptions(accountId);
      setGroups(items);
      setGroupsStatus('loaded');
    } catch (error) {
      setGroups([]);
      setGroupsError(error?.response?.data?.message || error?.message || '');
      setGroupsStatus('error');
    }
  };

  const toggleGroup = (group) => {
    const key = String(group.chatId);
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
      telegramAccountId: value,
      // Nhóm đã chọn thuộc tài khoản cũ -> xoá khi đổi tài khoản.
      ...(prev.recipientSource === 'telegram_groups' || (!prev.recipientSource && campaignType === 'telegram_group')
        ? { recipientKeys: [] }
        : {}),
    }));
  };

  const handleSourceChange = (value) => {
    setFormData((prev) => ({
      ...prev,
      recipientSource: value,
      // recipientKeys khác kiểu giữa nguồn nhóm (mảng object) và nhập tay (chuỗi) -> đặt lại khi đổi nguồn.
      recipientKeys: value === 'telegram_groups' ? [] : '',
    }));
  };
  const isEmptyAfterSuccess = telegramAccountsStatus === 'loaded' && telegramAccounts.length === 0;
  // PLAN_TELEGRAM_0_NGUOI_NHAN_2026-09-29 Việc 3 — cảnh báo khi nguồn là hội thoại mà tài khoản đang
  // chọn chưa có hội thoại mở nào. Chỉ cảnh báo khi BE trả số (số thiếu = không biết = không cảnh báo).
  const selectedAccount = telegramAccounts.find((a) => String(a.id) === String(formData.telegramAccountId || ''));
  const isConversationSource = recipientSource === 'telegram_conversations';
  const showNoConversationsWarning = Boolean(
    selectedAccount
    && isConversationSource
    && Number.isFinite(selectedAccount.openConversationCount)
    && selectedAccount.openConversationCount === 0
  );

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
          onChange={(e) => handleAccountChange(e.target.value)}
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
            {isEmployeeContext ? t('telegramNodeSend.noAccountsAssigned') : t('telegramNodeSend.noAccountsAvailable')}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('telegramNodeSend.recipientSource')}</label>
        <select
          value={recipientSource}
          onChange={(e) => handleSourceChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
        >
          {showGroupsOption && <option value="telegram_groups">{t('telegramNodeSend.sourceGroups')}</option>}
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

      {isGroupsSource && (
        <div data-testid="telegram-groups-picker" className="space-y-2">
          <p className="text-xs text-gray-500">{t('telegramNodeSend.groupsHint')}</p>
          {!accountId ? (
            <p className="text-sm text-amber-700">{t('telegramNodeSend.groupsPickAccountFirst')}</p>
          ) : (
            <button
              type="button"
              onClick={handleLoadGroups}
              disabled={groupsStatus === 'loading'}
              className="px-3 py-1.5 text-sm font-semibold bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-60"
            >
              {groupsStatus === 'loaded' ? t('telegramNodeSend.reloadGroups') : t('telegramNodeSend.loadGroups')}
            </button>
          )}
          {groupsStatus === 'loading' && (
            <p role="status" className="text-sm text-gray-500">{t('telegramNodeSend.loadingGroups')}</p>
          )}
          {groupsStatus === 'error' && (
            <div role="alert" className="bg-red-50 border border-red-200 p-3 rounded-lg text-sm text-red-700">
              <p className="font-medium">{t('telegramNodeSend.groupsLoadFailed')}</p>
              {groupsError && <p className="text-xs break-words">{groupsError}</p>}
            </div>
          )}
          {groupsStatus === 'loaded' && groups.length === 0 && (
            <div className="bg-amber-50 p-3 rounded-lg text-sm text-amber-700">{t('telegramNodeSend.groupsEmpty')}</div>
          )}
          {groupsStatus === 'loaded' && groups.length > 0 && (
            <>
              <input
                type="text"
                value={groupsFilter}
                onChange={(e) => setGroupsFilter(e.target.value)}
                placeholder={t('telegramNodeSend.groupsFilterPlaceholder')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
              />
              <ul className="max-h-56 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                {visibleGroups.map((group) => {
                  const checked = selectedGroups.some((g) => String(g.recipientKey) === String(group.chatId));
                  return (
                    <li key={group.chatId}>
                      <label className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                        <input type="checkbox" checked={checked} onChange={() => toggleGroup(group)} />
                        <span className="flex-1 truncate">{group.title}</span>
                        {Number.isFinite(group.membersCount) && (
                          <span className="text-xs text-gray-400">
                            {t('telegramNodeSend.groupsMembers', { count: group.membersCount })}
                          </span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <p className="text-xs text-gray-600" data-testid="telegram-groups-selected">
            {t('telegramNodeSend.groupsSelectedCount', { count: selectedGroups.length })}
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

      {/* P7 — nhiều bước (tối đa 5), bước 2+ có "gửi sau … kể từ bước trước"; mỗi bước có mẫu/đính kèm (P5). */}
      <ChannelStepsEditor
        channel="telegram"
        steps={formData.steps}
        setFormData={setFormData}
        templates={zaloTemplates}
        fetchTemplateById={fetchTemplateById}
        messageMax={4000}
        i18nPrefix="telegramNodeSend"
      />
    </div>
  );
};

export default NodeConfigSendTelegramSection;
