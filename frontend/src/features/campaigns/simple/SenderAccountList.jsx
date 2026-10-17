import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import campaignBuilderApiService from '../services/campaignBuilderApi.service';
import useAsyncResource from './useAsyncResource';
import { mapEmailAccounts, mapZaloAccounts, senderKindOf } from './simpleCampaign.helpers';

const SETTINGS_LINK = Object.freeze({
  email: '/app/settings/channels#email',
  zalo: '/app/settings/channels#zalo',
});

const DOT_CLASS = Object.freeze({
  ok: 'bg-emerald-500',
  locked: 'bg-slate-400 dark:bg-dk-muted',
  disconnected: 'bg-red-500',
});

/** Tải tài khoản gửi: email dùng `getActiveEmailSettings` (limit 100 — ĐỪNG gọi GET /email-settings trần, chỉ 10), Zalo dùng `selectable`. */
const loadAccounts = async (kind) => {
  if (kind === 'email') {
    const response = await campaignBuilderApiService.getActiveEmailSettings();
    return mapEmailAccounts(response?.data?.data?.items);
  }
  const response = await campaignBuilderApiService.getZaloAccounts();
  return mapZaloAccounts(response?.data?.data?.items);
};

/**
 * "Gửi từ tài khoản nào?" — danh sách tài khoản có chấm trạng thái.
 * Tài khoản mất kết nối/bị khoá theo gói: không chọn được, kèm link "Kết nối lại" tới trang cài đặt kênh.
 * Chỉ có đúng một tài khoản dùng được thì chọn sẵn.
 *
 * @param {object} props
 * @param {'email'|'zalo'|'zalo_group'} props.channel
 * @param {{ id: number, label: string }|null} props.selected
 * @param {(sender: { id: number, label: string }) => void} props.onSelect
 * @param {(key: string, params?: object) => string} props.t
 */
export default function SenderAccountList({ channel, selected, onSelect, t }) {
  const kind = senderKindOf(channel);
  const resource = useAsyncResource(() => loadAccounts(kind), [kind]);
  const accounts = resource.status === 'ready' ? resource.data : [];
  const usable = accounts.filter((account) => account.usable);

  useEffect(() => {
    if (resource.status !== 'ready' || selected) return;
    if (usable.length === 1) onSelect({ id: usable[0].id, label: usable[0].label });
    // `usable` dựng lại mỗi lần vẽ; chỉ phản ứng khi danh sách tải xong hoặc người dùng bỏ chọn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource.status, resource.data, selected]);

  return (
    <section className="mt-8" aria-labelledby="simple-sender-title" data-testid="simple-sender-section">
      <h3 id="simple-sender-title" className="text-lg font-bold text-slate-900 dark:text-dk-text">
        {t('simpleCampaign.channel.accountTitle')}
      </h3>

      {resource.status === 'loading' && (
        <p className="mt-3 text-sm text-slate-500 dark:text-dk-text2" role="status">{t('simpleCampaign.channel.accountLoading')}</p>
      )}

      {resource.status === 'error' && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300" role="alert">
          <p>{resource.error || t('simpleCampaign.channel.accountLoadFailed')}</p>
          <button type="button" onClick={resource.reload} className="mt-2 font-semibold underline">
            {t('simpleCampaign.retry')}
          </button>
        </div>
      )}

      {resource.status === 'ready' && accounts.length === 0 && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200" data-testid="simple-sender-empty">
          <p>{t('simpleCampaign.channel.accountEmpty')}</p>
          <Link to={SETTINGS_LINK[kind]} className="mt-2 inline-block font-semibold underline">
            {kind === 'email' ? t('simpleCampaign.channel.connectEmail') : t('simpleCampaign.channel.connectZalo')}
          </Link>
        </div>
      )}

      {resource.status === 'ready' && accounts.length > 0 && (
        <ul className="mt-3 space-y-2">
          {accounts.map((account) => {
            const isSelected = String(selected?.id ?? '') === String(account.id);
            const dot = account.usable ? DOT_CLASS.ok : (DOT_CLASS[account.problem] || DOT_CLASS.disconnected);
            return (
              <li
                key={account.id}
                data-testid={`simple-sender-${account.id}`}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border-2 px-3 py-2.5 ${
                  isSelected
                    ? 'border-orange-500 bg-orange-50/70 dark:bg-orange-950/30'
                    : 'border-slate-200 bg-white dark:border-dk-border dark:bg-dk-surface'
                } ${account.usable ? '' : 'opacity-80'}`}
              >
                <button
                  type="button"
                  disabled={!account.usable}
                  aria-pressed={isSelected}
                  onClick={() => onSelect({ id: account.id, label: account.label })}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-not-allowed"
                >
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-900 dark:text-dk-text">{account.label}</span>
                    {account.sublabel && (
                      <span className="block truncate text-xs text-slate-500 dark:text-dk-text2">{account.sublabel}</span>
                    )}
                  </span>
                  {account.isDefault && account.usable && (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-dk-raised dark:text-dk-text2">
                      {t('simpleCampaign.channel.defaultBadge')}
                    </span>
                  )}
                </button>
                {!account.usable && (
                  <span className="flex shrink-0 flex-wrap items-center gap-x-2 text-xs">
                    <span className="font-medium text-red-600 dark:text-red-400">
                      {account.problem === 'locked' ? t('simpleCampaign.channel.accountLocked') : t('simpleCampaign.channel.accountDisconnected')}
                    </span>
                    <Link to={SETTINGS_LINK[kind]} className="font-semibold text-orange-600 underline dark:text-orange-400">
                      {account.problem === 'locked' ? t('simpleCampaign.channel.viewAccounts') : t('simpleCampaign.channel.reconnect')}
                    </Link>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {resource.status === 'ready' && accounts.length > 0 && usable.length === 0 && (
        <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">{t('simpleCampaign.channel.noUsableAccount')}</p>
      )}
    </section>
  );
}
