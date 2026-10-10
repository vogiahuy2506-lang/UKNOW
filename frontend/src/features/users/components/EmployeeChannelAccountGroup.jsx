import { useI18n } from '../../../i18n';
import { toggleIdInList } from '../../../pages/settings/employeeManagement.helpers';

/**
 * Một nhóm ô chọn "tài khoản kênh được giao cho nhân viên" (Telegram, WhatsApp) trong tab Tài khoản kênh của modal
 * nhân viên (PLAN_GIAO_TK_TG_WA PR-H1). State chọn do component cha giữ (cần cho nhắc "chưa lưu" và nút Lưu chung).
 *
 * @param {{
 *   groupKey: string,
 *   title: string,
 *   emptyText: string,
 *   items: Array<{ key: string|number, title: string, subtitle?: string, connected: boolean, source: string|null }>,
 *   selected: Array<string|number>,
 *   onChange: (next: Array<string|number>) => void,
 * }} props
 */
export default function EmployeeChannelAccountGroup({ groupKey, title, emptyText, items, selected, onChange }) {
  const { t } = useI18n();
  return (
    <section className="space-y-2" data-testid={`channel-group-${groupKey}`} aria-label={title}>
      <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">{emptyText}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-secondary text-sm" onClick={() => onChange(items.map((item) => item.key))}>
              {t('employee.zaloAccountsSelectAll')}
            </button>
            <button type="button" className="btn btn-secondary text-sm" onClick={() => onChange([])}>
              {t('employee.zaloAccountsSelectNone')}
            </button>
            <span className="text-sm text-gray-500 ml-auto">
              {t('employee.zaloAccountsSelectedCount', { selected: selected.length, total: items.length })}
            </span>
          </div>
          <div className="space-y-2">
            {items.map((item) => {
              const isChecked = selected.some((key) => String(key) === String(item.key));
              return (
                <label
                  key={item.key}
                  className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    className="w-4 h-4 mt-1 text-primary-600 rounded"
                    checked={isChecked}
                    onChange={(e) => onChange(toggleIdInList(selected, item.key, e.target.checked))}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-gray-800 break-all">{item.title}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${item.connected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {item.connected ? t('employee.zaloAccountConnected') : t('employee.zaloAccountDisconnected')}
                      </span>
                      {item.source === 'legacy' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">{t('employee.zaloAccountSourceLegacy')}</span>
                      )}
                      {item.source === 'self_login' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{t('employee.zaloAccountSourceSelfLogin')}</span>
                      )}
                    </span>
                    {item.subtitle && <span className="block text-xs text-gray-500 mt-0.5">{item.subtitle}</span>}
                  </span>
                </label>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
