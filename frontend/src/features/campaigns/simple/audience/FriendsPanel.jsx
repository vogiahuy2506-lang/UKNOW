import { useState } from 'react';
import { ZaloFriendPickerCard } from '../../../ai/components/AiChatbotWizardCards.jsx';

/**
 * "Bạn bè Zalo" (chỉ Zalo cá nhân): dùng lại thẻ chọn bạn bè của trợ lý AI. Chọn xong thì thu gọn thành một dòng
 * "Đã chọn N bạn bè" kèm nút "Đổi lựa chọn".
 *
 * @param {object} props
 * @param {number|string} props.accountId tài khoản Zalo đã chọn ở bước 1
 * @param {string[]} props.uids
 * @param {(patch: object) => void} props.patchAudience
 * @param {(key: string, params?: object) => string} props.t
 */
export default function FriendsPanel({ accountId, uids, patchAudience, t }) {
  const [isPicking, setIsPicking] = useState(uids.length === 0);

  if (!accountId) {
    return <p className="text-sm text-amber-700 dark:text-amber-300">{t('simpleCampaign.audience.friends.needAccount')}</p>;
  }
  if (!isPicking && uids.length > 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-dk-border dark:bg-dk-surface" data-testid="simple-friends-chosen">
        <p className="text-sm font-semibold text-slate-800 dark:text-dk-text">{t('simpleCampaign.audience.friends.chosen', { count: uids.length })}</p>
        <button type="button" onClick={() => setIsPicking(true)} className="text-sm font-semibold text-orange-600 underline dark:text-orange-400">
          {t('simpleCampaign.audience.change')}
        </button>
      </div>
    );
  }
  return (
    <ZaloFriendPickerCard
      data={{ accountId }}
      isActive
      t={t}
      onSubmit={(ids) => {
        patchAudience({ uids: ids.map(String) });
        setIsPicking(false);
      }}
    />
  );
}
