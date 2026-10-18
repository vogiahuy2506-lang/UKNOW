import SimpleChoiceCard from './SimpleChoiceCard';
import { AUDIENCE_CARDS } from './audienceCards';
import CustomersPanel from './audience/CustomersPanel';
import LandingPanel from './audience/LandingPanel';
import FormPanel from './audience/FormPanel';
import SheetPanel from './audience/SheetPanel';
import ManualPanel from './audience/ManualPanel';
import FriendsPanel from './audience/FriendsPanel';
import GroupsPanel from './audience/GroupsPanel';
import AdapterGroupsPanel from './audience/AdapterGroupsPanel';
import ConversationsPanel from './audience/ConversationsPanel';

/** Thẻ có hai câu mô tả (theo kênh): khách đã lưu cần email/SĐT hợp lệ, "Tự nhập" gõ email hay số điện thoại. */
const DESCRIPTION_VARIANT_TYPES = new Set(['customers', 'manual']);

/** Nguồn cần biết tài khoản gửi mới chọn được (bạn bè, nhóm của tài khoản đó). */
const ACCOUNT_BOUND_TYPES = new Set(['zalo_friends', 'zalo_groups', 'telegram_groups', 'whatsapp_groups']);

/**
 * Lưới thẻ nguồn người nhận + panel nhập của nguồn đang chọn — dùng CHUNG cho bước "Gửi cho ai" của trình từng bước
 * (`AudienceStep`) và mục "Gửi cho ai" của tab Thiết lập, để hai nơi không lệch nhau về panel hay luật nhập.
 *
 * @param {object} props
 * @param {'email'|'zalo'|'telegram'|'whatsapp'} props.channel
 * @param {Array<string>} props.types các nguồn hiện thẻ
 * @param {object} props.audience trạng thái dạng `EMPTY_AUDIENCE`
 * @param {{ id: number|string, label: string }|null} props.sender tài khoản gửi (panel bạn bè / nhóm / người đã nhắn cần)
 * @param {(type: string) => void} props.onSelectType
 * @param {(patch: object) => void} props.patchAudience
 * @param {(key: string, params?: object) => string} props.t
 * @param {string} props.locale
 * @param {string} [props.gridClassName] lớp lưới thẻ (mặc định 5 cột của trình từng bước)
 * @param {string} [props.testIdPrefix='simple-audience']
 * @param {(type: string) => boolean} [props.isLocked] nguồn bị khoá theo gói (thẻ mờ + ổ khoá)
 * @param {(type: string) => void} [props.onLockedClick]
 * @param {string} [props.accountHint] có → nguồn cần tài khoản mà chưa có tài khoản thì hiện câu này thay cho panel
 */
export default function AudienceChooser({
  channel,
  types,
  audience,
  sender,
  onSelectType,
  patchAudience,
  t,
  locale,
  gridClassName = 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5',
  testIdPrefix = 'simple-audience',
  isLocked = () => false,
  onLockedClick = () => {},
  accountHint = '',
}) {
  const contactKind = channel === 'email' ? 'Email' : 'Phone';

  const renderPanel = () => {
    if (accountHint && ACCOUNT_BOUND_TYPES.has(audience.type) && !sender?.id) {
      return <p className="text-sm text-amber-700 dark:text-amber-300" data-testid={`${testIdPrefix}-need-account`}>{accountHint}</p>;
    }
    switch (audience.type) {
      case 'customers':
        return <CustomersPanel audience={audience} patchAudience={patchAudience} t={t} locale={locale} />;
      case 'landing':
        return <LandingPanel slugs={audience.slugs} landingTitles={audience.landingTitles} patchAudience={patchAudience} t={t} />;
      case 'form':
        return <FormPanel formIds={audience.formIds} formTitles={audience.formTitles} patchAudience={patchAudience} t={t} />;
      case 'sheet':
        return <SheetPanel channel={channel} audience={audience} patchAudience={patchAudience} t={t} />;
      case 'manual':
        return <ManualPanel channel={channel} manualText={audience.manualText} patchAudience={patchAudience} t={t} locale={locale} />;
      case 'zalo_friends':
        return <FriendsPanel accountId={sender?.id} uids={audience.uids} patchAudience={patchAudience} t={t} />;
      case 'conversations':
        return <ConversationsPanel channel={channel} sender={sender} t={t} locale={locale} />;
      case 'zalo_groups':
        return (
          <GroupsPanel
            accountId={sender?.id}
            groupIds={audience.groupIds}
            groupNames={audience.groupNames}
            patchAudience={patchAudience}
            t={t}
          />
        );
      case 'telegram_groups':
      case 'whatsapp_groups':
        return <AdapterGroupsPanel channel={channel} accountId={sender?.id} groups={audience.groups} patchAudience={patchAudience} t={t} />;
      default:
        return null;
    }
  };

  return (
    <>
      <div className={`grid gap-3 ${gridClassName}`}>
        {types.map((type) => {
          const card = AUDIENCE_CARDS[type];
          const locked = isLocked(type);
          const descKey = DESCRIPTION_VARIANT_TYPES.has(type)
            ? `simpleCampaign.audience.types.${type}.desc${contactKind}`
            : `simpleCampaign.audience.types.${type}.desc`;
          return (
            <SimpleChoiceCard
              key={type}
              testId={`${testIdPrefix}-${type}`}
              icon={card.icon}
              tone={card.tone}
              title={t(`simpleCampaign.audience.types.${type}.title`)}
              description={t(descKey)}
              selected={audience.type === type}
              locked={locked}
              onClick={() => (locked ? onLockedClick(type) : onSelectType(type))}
            />
          );
        })}
      </div>

      {audience.type && (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-dk-border dark:bg-dk-bg/40" data-testid={`${testIdPrefix.replace(/-audience$/, '')}-audience-panel`}>
          {renderPanel()}
        </div>
      )}
    </>
  );
}
