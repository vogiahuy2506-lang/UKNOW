import { useState } from 'react';
import { ZaloGroupPickerCard } from '../../../ai/components/AiChatbotWizardCards.jsx';

/**
 * "Chọn nhóm" của Zalo nhóm: dùng lại thẻ chọn nhóm của trợ lý AI/Gửi nhanh. BẮT BUỘC ≥ 1 nhóm — danh sách nhóm rỗng
 * nghĩa là server gửi vào MỌI nhóm của tài khoản (bộ biên dịch không chặn), nên "Tiếp tục" khoá tới khi có nhóm
 * (`isStepComplete`). Chọn xong thì thu gọn thành danh sách tên nhóm kèm nút "Đổi nhóm".
 *
 * @param {object} props
 * @param {number|string} props.accountId tài khoản Zalo đã chọn ở bước 1
 * @param {string[]} props.groupIds
 * @param {string[]} props.groupNames song song với `groupIds`
 * @param {(patch: object) => void} props.patchAudience
 * @param {(key: string, params?: object) => string} props.t
 */
export default function GroupsPanel({ accountId, groupIds, groupNames, patchAudience, t }) {
  const [isPicking, setIsPicking] = useState(groupIds.length === 0);

  if (!accountId) {
    return <p className="text-sm text-amber-700 dark:text-amber-300">{t('simpleCampaign.audience.groups.needAccount')}</p>;
  }
  if (!isPicking && groupIds.length > 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-dk-border dark:bg-dk-surface" data-testid="simple-groups-chosen">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-800 dark:text-dk-text">{t('simpleCampaign.audience.groups.chosen', { count: groupIds.length })}</p>
          <button type="button" onClick={() => setIsPicking(true)} className="text-sm font-semibold text-orange-600 underline dark:text-orange-400">
            {t('simpleCampaign.audience.groups.change')}
          </button>
        </div>
        {/* Nhóm đã lưu từ trước (tab Thiết lập) chỉ còn mã nhóm, không còn tên: không in dãy mã vô nghĩa. */}
        {groupNames.some(Boolean) && (
          <ul className="mt-2 flex flex-wrap gap-2">
            {groupIds.map((id, index) => (
              <li key={id} className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs text-orange-700 dark:border-orange-500/30 dark:bg-orange-950/40 dark:text-orange-300">
                {groupNames[index] || id}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  return (
    <div>
      <p className="mb-1 text-sm text-slate-600 dark:text-dk-text2">{t('simpleCampaign.audience.groups.required')}</p>
      <ZaloGroupPickerCard
        data={{ accountId }}
        isActive
        t={t}
        onSubmit={(ids, groups) => {
          const nameById = new Map(
            groups.map((group) => [String(group.groupId || group.group_id || group.id || ''), group.groupName || group.group_name || group.name])
          );
          patchAudience({
            groupIds: ids.map(String),
            groupNames: ids.map((id) => String(nameById.get(String(id)) || id)),
          });
          setIsPicking(false);
        }}
      />
    </div>
  );
}
