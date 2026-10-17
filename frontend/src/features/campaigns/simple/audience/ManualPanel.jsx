import { parseManualRecipients } from '../simpleCampaign.helpers';

/**
 * "Tự nhập danh sách": mỗi dòng một email (kênh email) hoặc một số điện thoại (Zalo cá nhân).
 * Còn mục sai định dạng thì chưa cho sang bước kế (server sẽ từ chối cả danh sách) — nói rõ mục nào sai.
 *
 * @param {object} props
 * @param {'email'|'zalo'|'zalo_group'} props.channel
 * @param {string} props.manualText
 * @param {(patch: object) => void} props.patchAudience
 * @param {(key: string, params?: object) => string} props.t
 * @param {string} props.locale
 */
export default function ManualPanel({ channel, manualText, patchAudience, t, locale }) {
  const kind = channel === 'email' ? 'email' : 'phone';
  const { valid, invalid } = parseManualRecipients(manualText, kind);
  const suffix = kind === 'email' ? 'Email' : 'Phone';
  return (
    <div>
      <label htmlFor="simple-manual-list" className="block text-sm font-semibold text-slate-800 dark:text-dk-text">
        {t(`simpleCampaign.audience.manual.label${suffix}`)}
      </label>
      <textarea
        id="simple-manual-list"
        value={manualText}
        onChange={(event) => patchAudience({ manualText: event.target.value })}
        rows={6}
        placeholder={t(`simpleCampaign.audience.manual.placeholder${suffix}`)}
        className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 hover:bg-white focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 dark:border-dk-border dark:bg-dk-inset dark:text-dk-text dark:placeholder:text-dk-muted dark:hover:bg-dk-surface dark:focus:bg-dk-inset"
      />
      <p className="mt-1 text-xs text-slate-500 dark:text-dk-text2">{t('simpleCampaign.audience.manual.hint')}</p>
      {valid.length > 0 && (
        <p className="mt-2 text-sm font-medium text-slate-700 dark:text-dk-text" data-testid="simple-manual-count">
          {t('simpleCampaign.audience.manual.count', { count: valid.length.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN') })}
        </p>
      )}
      {invalid.length > 0 && (
        <p role="alert" className="mt-2 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300" data-testid="simple-manual-invalid">
          {t('simpleCampaign.audience.manual.invalid', {
            count: invalid.length,
            items: invalid.slice(0, 3).join(', ') + (invalid.length > 3 ? '…' : ''),
          })}
        </p>
      )}
    </div>
  );
}
