import {
  HiOutlineClipboardList,
  HiOutlineDatabase,
  HiOutlineGlobeAlt,
  HiOutlinePencilAlt,
  HiOutlineTable,
  HiOutlineUserGroup,
  HiOutlineUsers,
} from 'react-icons/hi';
import SimpleChoiceCard from './SimpleChoiceCard';
import { AUDIENCE_TYPES_BY_CHANNEL } from './simpleCampaign.helpers';
import CustomersPanel from './audience/CustomersPanel';
import LandingPanel from './audience/LandingPanel';
import FormPanel from './audience/FormPanel';
import SheetPanel from './audience/SheetPanel';
import ManualPanel from './audience/ManualPanel';
import FriendsPanel from './audience/FriendsPanel';
import GroupsPanel from './audience/GroupsPanel';

const AUDIENCE_CARDS = Object.freeze({
  customers: { icon: HiOutlineDatabase, tone: 'blue' },
  landing: { icon: HiOutlineGlobeAlt, tone: 'rose' },
  form: { icon: HiOutlineClipboardList, tone: 'emerald' },
  sheet: { icon: HiOutlineTable, tone: 'emerald' },
  manual: { icon: HiOutlinePencilAlt, tone: 'slate' },
  zalo_friends: { icon: HiOutlineUsers, tone: 'sky' },
  zalo_groups: { icon: HiOutlineUserGroup, tone: 'violet' },
});

/** Thẻ có hai câu mô tả (theo kênh): khách đã lưu cần email/SĐT hợp lệ, "Tự nhập" gõ email hay số điện thoại. */
const DESCRIPTION_VARIANT_TYPES = new Set(['customers', 'manual']);

/**
 * Bước 2 — "Bạn muốn gửi cho ai?". Thẻ nguồn lọc theo kênh; chọn thẻ thì phần chọn chi tiết mở ngay bên dưới.
 * Zalo nhóm chỉ có một nguồn ("Chọn nhóm", chọn sẵn) và BẮT BUỘC ≥ 1 nhóm.
 *
 * @param {object} props
 * @param {object} props.wizard kết quả `useSimpleCampaignWizard`
 * @param {(key: string, params?: object) => string} props.t
 * @param {string} props.locale
 */
export default function AudienceStep({ wizard, t, locale }) {
  const { state, selectAudienceType, patchAudience } = wizard;
  const { channel, audience, sender } = state;
  const types = AUDIENCE_TYPES_BY_CHANNEL[channel] || [];
  const isGroupChannel = channel === 'zalo_group';
  const contactKind = channel === 'email' ? 'Email' : 'Phone';

  const renderPanel = () => {
    switch (audience.type) {
      case 'customers':
        return <CustomersPanel patchAudience={patchAudience} t={t} locale={locale} />;
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
      default:
        return null;
    }
  };

  return (
    <div>
      <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-dk-text sm:text-2xl">
        {isGroupChannel ? t('simpleCampaign.audience.groupTitle') : t('simpleCampaign.audience.title')}
      </h2>
      {!isGroupChannel && <p className="mt-1 text-sm text-slate-500 dark:text-dk-text2">{t('simpleCampaign.audience.hint')}</p>}

      {!isGroupChannel && (
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {types.map((type) => {
            const card = AUDIENCE_CARDS[type];
            const descKey = DESCRIPTION_VARIANT_TYPES.has(type)
              ? `simpleCampaign.audience.types.${type}.desc${contactKind}`
              : `simpleCampaign.audience.types.${type}.desc`;
            return (
              <SimpleChoiceCard
                key={type}
                testId={`simple-audience-${type}`}
                icon={card.icon}
                tone={card.tone}
                title={t(`simpleCampaign.audience.types.${type}.title`)}
                description={t(descKey)}
                selected={audience.type === type}
                onClick={() => selectAudienceType(type)}
              />
            );
          })}
        </div>
      )}

      {audience.type && (
        <div className={`${isGroupChannel ? 'mt-4' : 'mt-5'} rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-dk-border dark:bg-dk-bg/40`} data-testid="simple-audience-panel">
          {renderPanel()}
        </div>
      )}

      {!isGroupChannel && (
        <p className="mt-4 text-xs text-slate-500 dark:text-dk-text2" data-testid="simple-consent-note">
          {t('simpleCampaign.audience.consentNote')}
        </p>
      )}
    </div>
  );
}
