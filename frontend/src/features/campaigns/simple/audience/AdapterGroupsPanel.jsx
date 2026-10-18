import { useMemo, useState } from 'react';
import { fetchTelegramGroupOptions, fetchWhatsAppGroupOptions } from '../../utils/nodeConfigModal.helpers';
import useAsyncResource from '../useAsyncResource';

/** Nhóm của tài khoản → `{ recipientKey, title, membersCount }`. Telegram trả `chatId` số, WhatsApp trả `recipientKey` (`<id>@g.us`). */
const loadGroups = async (channel, accountId) => {
  const items = channel === 'telegram'
    ? await fetchTelegramGroupOptions(accountId)
    : await fetchWhatsAppGroupOptions(accountId);
  return items
    .map((item) => ({
      recipientKey: String((channel === 'telegram' ? item.chatId : item.recipientKey) ?? ''),
      title: String(item.title || ''),
      membersCount: Number.isFinite(Number(item.membersCount)) && item.membersCount !== null ? Number(item.membersCount) : null,
    }))
    .filter((item) => item.recipientKey);
};

/**
 * "Nhóm Telegram" / "Nhóm WhatsApp": chọn các nhóm của tài khoản gửi (đọc trực tiếp từ nền tảng, có thể chậm vài giây).
 * Nhóm đã chọn lưu ở `audience.groups` = `[{ recipientKey, display }]` — đúng hình dạng trình dựng lưu ở cấu hình khối gửi. BẮT BUỘC
 * ≥ 1 nhóm (`isStepComplete`): không có nhóm nào nghĩa là không có ai để gửi.
 *
 * @param {object} props
 * @param {'telegram'|'whatsapp'} props.channel
 * @param {number|string|undefined} props.accountId Telegram: id tài khoản; WhatsApp: mã phiên (`sender.id`)
 * @param {Array<{ recipientKey: string, display: string }>} props.groups nhóm đã chọn
 * @param {(patch: object) => void} props.patchAudience
 * @param {(key: string, params?: object) => string} props.t
 */
export default function AdapterGroupsPanel({ channel, accountId, groups, patchAudience, t }) {
  const [filter, setFilter] = useState('');
  const resource = useAsyncResource(() => (accountId ? loadGroups(channel, accountId) : Promise.resolve([])), [channel, accountId]);
  const loaded = resource.status === 'ready' ? resource.data : null;
  const available = useMemo(() => loaded || [], [loaded]);
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? available.filter((item) => item.title.toLowerCase().includes(q)) : available;
  }, [available, filter]);

  if (!accountId) {
    return <p className="text-sm text-amber-700 dark:text-amber-300">{t('simpleCampaign.audience.adapterGroups.needAccount')}</p>;
  }

  const toggle = (item) => {
    const exists = groups.some((group) => group.recipientKey === item.recipientKey);
    patchAudience({
      groups: exists
        ? groups.filter((group) => group.recipientKey !== item.recipientKey)
        : [...groups, { recipientKey: item.recipientKey, display: item.title || item.recipientKey }],
    });
  };

  let body;
  if (resource.status === 'loading') {
    body = <p className="text-sm text-slate-500 dark:text-dk-text2" role="status">{t('simpleCampaign.audience.adapterGroups.loading')}</p>;
  } else if (resource.status === 'error') {
    body = (
      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300" role="alert">
        <p>{resource.error || t('simpleCampaign.audience.adapterGroups.loadFailed')}</p>
        <button type="button" onClick={resource.reload} className="mt-2 font-semibold underline">{t('simpleCampaign.retry')}</button>
      </div>
    );
  } else if (available.length === 0) {
    body = (
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200" data-testid="simple-adapter-groups-empty">
        {t(`simpleCampaign.audience.adapterGroups.${channel}Empty`)}
      </p>
    );
  } else {
    body = (
      <>
        <input
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={t('simpleCampaign.audience.adapterGroups.filter')}
          aria-label={t('simpleCampaign.audience.adapterGroups.filter')}
          className="mb-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-500/10 dark:border-dk-border dark:bg-dk-inset dark:text-dk-text dark:placeholder:text-dk-muted"
        />
        <ul className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-1.5 dark:border-dk-border">
          {visible.map((item) => {
            const checked = groups.some((group) => group.recipientKey === item.recipientKey);
            return (
              <li key={item.recipientKey}>
                <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg px-2.5 py-2 hover:bg-slate-50 dark:hover:bg-dk-raised">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(item)}
                    data-testid={`simple-adapter-group-${item.recipientKey}`}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-orange-500 focus:ring-orange-500 dark:border-dk-border-strong dark:bg-dk-inset"
                  />
                  <span className="min-w-0 text-sm text-slate-800 dark:text-dk-text">
                    <span className="block break-words font-medium">{item.title || item.recipientKey}</span>
                    {item.membersCount !== null && (
                      <span className="block text-xs text-slate-500 dark:text-dk-text2">
                        {t('simpleCampaign.audience.adapterGroups.members', { count: item.membersCount.toLocaleString('vi-VN') })}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
          {visible.length === 0 && (
            <li className="px-2.5 py-2 text-sm text-slate-500 dark:text-dk-text2">{t('simpleCampaign.audience.adapterGroups.noMatch')}</li>
          )}
        </ul>
      </>
    );
  }

  return (
    <div data-testid="simple-adapter-groups-panel">
      <p className="mb-2 text-sm text-slate-600 dark:text-dk-text2">{t(`simpleCampaign.audience.adapterGroups.${channel}Hint`)}</p>
      {body}
      {groups.length > 0 && (
        <p className="mt-2 text-xs font-semibold text-slate-600 dark:text-dk-text2" data-testid="simple-adapter-groups-selected">
          {t('simpleCampaign.audience.adapterGroups.selected', { count: groups.length })}
        </p>
      )}
    </div>
  );
}
