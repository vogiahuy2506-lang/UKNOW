import useAsyncResource from '../useAsyncResource';
import { loadSenderAccounts } from '../loadSenderAccounts';
import { senderKindOf } from '../simpleCampaign.helpers';

/**
 * "Người đã nhắn với tài khoản" (Telegram, WhatsApp): người nhận là MỌI người đã từng nhắn tới tài khoản gửi, đọc lại mỗi lượt chạy —
 * không có danh sách nào để chọn, nên panel chỉ giải thích và nêu số người hiện có (số do endpoint danh sách tài khoản trả).
 *
 * @param {object} props
 * @param {'telegram'|'whatsapp'} props.channel
 * @param {{ id: number|string, label: string }|null} props.sender tài khoản đã chọn ở bước đầu
 * @param {(key: string, params?: object) => string} props.t
 * @param {string} props.locale
 */
export default function ConversationsPanel({ channel, sender, t, locale }) {
  const kind = senderKindOf(channel);
  const resource = useAsyncResource(() => loadSenderAccounts(kind), [kind]);
  const account = resource.status === 'ready'
    ? resource.data.find((item) => String(item.id) === String(sender?.id ?? ''))
    : null;
  const count = account?.conversationCount ?? null;

  return (
    <div className="space-y-2 text-sm" data-testid="simple-conversations-panel">
      <p className="text-slate-700 dark:text-dk-text">{t(`simpleCampaign.audience.conversations.${channel}Note`)}</p>
      {resource.status === 'loading' && (
        <p className="text-slate-500 dark:text-dk-text2" role="status">{t('simpleCampaign.audience.loading')}</p>
      )}
      {count !== null && count > 0 && (
        <p className="font-semibold text-slate-800 dark:text-dk-text" data-testid="simple-conversations-count">
          {t('simpleCampaign.audience.conversations.count', { count: count.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN'), account: sender?.label || '' })}
        </p>
      )}
      {count === 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200" data-testid="simple-conversations-empty">
          {t('simpleCampaign.audience.conversations.empty', { account: sender?.label || '' })}
        </p>
      )}
    </div>
  );
}
