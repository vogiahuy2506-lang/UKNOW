/**
 * Section UI cho node chọn tài khoản Zalo: một TK mặc định hoặc pool nhiều TK (gán bền theo slot).
 *
 * Luồng:
 * - Tắt pool: chọn đúng một TK như trước (dropdown).
 * - Bật pool: tick các TK dùng cho chiến dịch; TK mặc định lấy tài khoản đầu trong danh sách đã chọn.
 *
 * @param {Object} props
 * @param {Object} props.formData
 * @param {Function} props.setFormData
 * @param {Array<{id: string, displayName: string, status: string, isActive: boolean, isDefault: boolean}>} props.zaloAccounts
 * @returns {JSX.Element}
 */
import { useI18n } from '../../../i18n';

export const NodeConfigSelectZaloAccountSection = ({ formData, setFormData, zaloAccounts = [] }) => {
  const { t } = useI18n();
  const sortedAccounts = [...zaloAccounts].sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return a.displayName.localeCompare(b.displayName, 'vi');
  });

  const poolEnabled = Boolean(formData.zaloPoolMultiAccountEnabled);
  const poolIds = Array.isArray(formData.zaloPoolAccountIds)
    ? formData.zaloPoolAccountIds.map(String).filter(Boolean)
    : [];

  const handleSingleAccountChange = (value) => {
    const selected = sortedAccounts.find((item) => item.id === value);
    setFormData((prev) => ({
      ...prev,
      zaloAccountId: value,
      zaloAccountName: selected?.displayName || '',
    }));
  };

  const togglePoolAccount = (idStr, checked) => {
    setFormData((prev) => {
      const cur = Array.isArray(prev.zaloPoolAccountIds)
        ? prev.zaloPoolAccountIds.map(String)
        : [];
      const next = checked
        ? [...new Set([...cur, idStr])]
        : cur.filter((x) => x !== idStr);
      const first = next[0] || '';
      const acc = sortedAccounts.find((item) => String(item.id) === first);
      return {
        ...prev,
        zaloPoolAccountIds: next,
        zaloAccountId: first,
        zaloAccountName: acc?.displayName || prev.zaloAccountName || '',
      };
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('zaloAccount.nodeName')}</label>
        <input
          type="text"
          value={formData.label}
          onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          placeholder={t('zaloAccount.nodeNamePlaceholder')}
        />
      </div>

      <div className="rounded-lg border border-gray-200 p-3 space-y-3">
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            checked={poolEnabled}
            onChange={(e) => {
              const on = e.target.checked;
              setFormData((prev) => {
                if (on) {
                  const seed = String(prev.zaloAccountId || '').trim();
                  const initialPool = seed ? [seed] : [];
                  const acc = sortedAccounts.find((item) => String(item.id) === seed);
                  return {
                    ...prev,
                    zaloPoolMultiAccountEnabled: true,
                    zaloPoolAccountIds: initialPool,
                    zaloAccountName: acc?.displayName || prev.zaloAccountName || '',
                  };
                }
                const singleId = String(prev.zaloAccountId || '').trim();
                const acc = sortedAccounts.find((item) => String(item.id) === singleId);
                return {
                  ...prev,
                  zaloPoolMultiAccountEnabled: false,
                  zaloPoolAccountIds: [],
                  zaloAccountName: acc?.displayName || prev.zaloAccountName || '',
                };
              });
            }}
          />
          <span className="text-sm text-gray-800">
            <span className="font-medium text-gray-900">{t('zaloAccount.poolMode')}</span>
            <span className="block mt-1 text-gray-600 leading-snug">
              {t('zaloAccount.poolModeDescription')}
            </span>
          </span>
        </label>

        {poolEnabled ? (
          <div className="space-y-2 pl-1">
            <div className="text-sm font-medium text-gray-700">{t('zaloAccount.selectAccountsForCampaign')}</div>
            <div className="max-h-44 overflow-y-auto space-y-2 border border-gray-100 rounded p-2">
              {sortedAccounts.map((acc) => {
                const idStr = String(acc.id || '');
                const selected = poolIds.includes(idStr);
                return (
                  <label key={idStr} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      checked={selected}
                      onChange={(e) => togglePoolAccount(idStr, e.target.checked)}
                    />
                    {acc.displayName || idStr}
                    {acc.isDefault ? ` ${t('zaloAccount.default')}` : ''}
                  </label>
                );
              })}
            </div>
            {sortedAccounts.length === 0 && (
              <p className="text-xs text-amber-700">{t('zaloAccount.noAccounts')}</p>
            )}
            <p className="text-xs text-amber-800 bg-amber-50 p-2 rounded">
              {t('zaloAccount.poolModeNote')}
            </p>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('zaloAccount.zaloAccountRequired')} <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.zaloAccountId || ''}
              onChange={(e) => handleSingleAccountChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            >
              <option value="">-- {t('zaloAccount.selectAccount')} --</option>
              {sortedAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.displayName}
                  {account.isDefault ? ` ${t('zaloAccount.default')}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {sortedAccounts.length === 0 && (
        <div className="bg-amber-50 p-3 rounded-lg text-sm text-amber-700">
          {t('zaloAccount.noAccountsAvailable')}
        </div>
      )}

      {!poolEnabled && formData.zaloAccountId && (
        <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-700">
          {t('zaloAccount.selectedAccountNote')}
        </div>
      )}
    </div>
  );
};
