import { HiOutlineAnnotation, HiOutlineChat, HiOutlineMail, HiOutlinePaperAirplane, HiOutlineUserGroup } from 'react-icons/hi';
import SimpleChoiceCard from './SimpleChoiceCard';
import SenderAccountList from './SenderAccountList';
import { isAdapterChannel, senderKindOf } from './simpleCampaign.helpers';

/**
 * `availabilityKey`: Zalo cá nhân và Zalo nhóm cùng nằm dưới kênh `zalo` của useChannelAvailability.
 * Telegram/WhatsApp là kênh "adapter": hệ thống chưa bật (`visible` khác true) thì KHÔNG vẽ thẻ; bật nhưng gói không có/hết hạn thì
 * vẽ MỜ + ổ khoá (cùng cách thẻ Zalo) — bấm vào mở modal giải thích/gợi ý mua.
 */
const CHANNEL_CARDS = Object.freeze([
  { id: 'email', availabilityKey: 'email', icon: HiOutlineMail, tone: 'blue' },
  { id: 'zalo', availabilityKey: 'zalo', icon: HiOutlineChat, tone: 'sky' },
  { id: 'zalo_group', availabilityKey: 'zalo', icon: HiOutlineUserGroup, tone: 'violet' },
  { id: 'telegram', availabilityKey: 'telegram', icon: HiOutlinePaperAirplane, tone: 'sky' },
  { id: 'whatsapp', availabilityKey: 'whatsapp', icon: HiOutlineAnnotation, tone: 'emerald' },
]);

/** Số cột theo số thẻ đang hiện: 3 thẻ giữ nguyên bố cục cũ; 4–5 thẻ xuống hai/ba cột để tiêu đề không bị bóp. */
const GRID_CLASS_BY_COUNT = Object.freeze({
  3: 'grid-cols-1 sm:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5',
});

/**
 * Bước 1 — "Bạn muốn gửi qua đâu?" + "Gửi từ tài khoản nào?".
 * Kênh không có trong gói: thẻ mờ + ổ khoá (`aria-disabled`), bấm vẫn mở modal giải thích/gợi ý mua (cha lo modal).
 *
 * @param {object} props
 * @param {object} props.wizard kết quả `useSimpleCampaignWizard`
 * @param {Record<string, { available?: boolean }>} props.availability kết quả `useChannelAvailability`
 * @param {(channelKey: 'email'|'zalo'|'telegram'|'whatsapp') => void} props.onLockedClick
 * @param {(key: string, params?: object) => string} props.t
 * @param {string} [props.locale]
 */
export default function ChannelStep({ wizard, availability, onLockedClick, t, locale = 'vi' }) {
  const { state, selectChannel, selectSender } = wizard;
  const cards = CHANNEL_CARDS.filter(({ id, availabilityKey }) => !isAdapterChannel(id) || availability?.[availabilityKey]?.visible === true);

  return (
    <div>
      <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-dk-text sm:text-2xl">{t('simpleCampaign.channel.title')}</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-dk-text2">{t('simpleCampaign.channel.hint')}</p>

      <div className={`mt-5 grid gap-3 ${GRID_CLASS_BY_COUNT[cards.length] || GRID_CLASS_BY_COUNT[3]}`} data-testid="simple-channel-grid">
        {cards.map(({ id, availabilityKey, icon, tone }) => {
          const locked = availability?.[availabilityKey]?.available === false;
          return (
            <SimpleChoiceCard
              key={id}
              testId={`simple-channel-${id}`}
              icon={icon}
              tone={tone}
              title={t(`simpleCampaign.channel.${id}.title`)}
              description={t(`simpleCampaign.channel.${id}.desc`)}
              selected={state.channel === id}
              locked={locked}
              onClick={() => {
                if (locked) {
                  onLockedClick(availabilityKey);
                  return;
                }
                selectChannel(id);
              }}
            />
          );
        })}
      </div>

      {state.channel && (
        // key theo loại tài khoản: đổi Email ↔ Zalo phải dựng lại danh sách, nếu không một lượt vẽ còn giữ tài khoản
        // của kênh cũ và cơ chế "chỉ có một tài khoản thì chọn sẵn" sẽ chọn nhầm nick Zalo cho chiến dịch email.
        <SenderAccountList
          key={senderKindOf(state.channel)}
          channel={state.channel}
          selected={state.sender}
          onSelect={selectSender}
          t={t}
          locale={locale}
        />
      )}
    </div>
  );
}
