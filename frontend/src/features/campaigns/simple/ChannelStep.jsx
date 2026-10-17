import { HiOutlineChat, HiOutlineMail, HiOutlineUserGroup } from 'react-icons/hi';
import SimpleChoiceCard from './SimpleChoiceCard';
import SenderAccountList from './SenderAccountList';
import { senderKindOf } from './simpleCampaign.helpers';

/** `availabilityKey`: Zalo cá nhân và Zalo nhóm cùng nằm dưới kênh `zalo` của useChannelAvailability. */
const CHANNEL_CARDS = Object.freeze([
  { id: 'email', availabilityKey: 'email', icon: HiOutlineMail, tone: 'blue' },
  { id: 'zalo', availabilityKey: 'zalo', icon: HiOutlineChat, tone: 'sky' },
  { id: 'zalo_group', availabilityKey: 'zalo', icon: HiOutlineUserGroup, tone: 'violet' },
]);

/**
 * Bước 1 — "Bạn muốn gửi qua đâu?" + "Gửi từ tài khoản nào?".
 * Kênh không có trong gói: thẻ mờ + ổ khoá (`aria-disabled`), bấm vẫn mở modal giải thích/gợi ý mua (cha lo modal).
 *
 * @param {object} props
 * @param {object} props.wizard kết quả `useSimpleCampaignWizard`
 * @param {Record<string, { available?: boolean }>} props.availability kết quả `useChannelAvailability`
 * @param {(channelKey: 'email'|'zalo') => void} props.onLockedClick
 * @param {(key: string, params?: object) => string} props.t
 */
export default function ChannelStep({ wizard, availability, onLockedClick, t }) {
  const { state, selectChannel, selectSender } = wizard;

  return (
    <div>
      <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-dk-text sm:text-2xl">{t('simpleCampaign.channel.title')}</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-dk-text2">{t('simpleCampaign.channel.hint')}</p>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {CHANNEL_CARDS.map(({ id, availabilityKey, icon, tone }) => {
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
        />
      )}
    </div>
  );
}
