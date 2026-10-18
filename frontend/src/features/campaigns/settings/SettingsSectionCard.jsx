import { Children } from 'react';
import { HiOutlineCheckCircle, HiOutlineExclamation, HiOutlinePencil } from 'react-icons/hi';

export const CARD = 'rounded-xl border border-gray-200 bg-white shadow-sm dark:border-dk-border dark:bg-dk-surface';
export const MUTED = 'text-gray-500 dark:text-dk-text2';

const BADGE_KEY = { ok: 'campaignSettings.checklist.okBadge', missing: 'campaignSettings.checklist.missingBadge', idle: 'campaignSettings.checklist.idleBadge' };

/**
 * Vỏ của một MỤC ở tab Thiết lập (Gửi từ · Gửi cho ai · Nội dung · Thời điểm · Sau khi gửi): ✓ / ⚠ + tên mục + tóm tắt một dòng khi đóng,
 * nút Sửa mở biểu mẫu riêng của mục ngay tại thẻ (`children`). Không biết gì về khối / cấu hình — chỉ là khung.
 *
 * @param {object} props
 * @param {string} props.sectionKey 'sender' | 'audience' | 'content' | 'timing' | 'after'
 * @param {'ok'|'missing'|'idle'} props.status
 * @param {string} props.title
 * @param {string} [props.summary] tóm tắt một dòng (ẩn khi đang sửa)
 * @param {boolean} [props.editing] đang mở biểu mẫu
 * @param {boolean} [props.keepSummary] vẫn hiện tóm tắt khi đang mở biểu mẫu (khung chiến dịch trống: biểu mẫu luôn mở)
 * @param {string} [props.editLabel] chữ nút (mặc định "Sửa")
 * @param {() => void} [props.onEdit] có → hiện nút Sửa (khi không editing)
 * @param {boolean} [props.editDisabled]
 * @param {string} [props.editDisabledTitle]
 * @param {string} [props.reason] vì sao chưa sửa nhanh được (hiện dưới tóm tắt)
 * @param {() => void} [props.onAdvanced] có → liên kết nhỏ "Cài đặt nâng cao"
 * @param {React.ReactNode} [props.children] biểu mẫu / danh sách của mục
 * @param {(key: string, params?: object) => string} props.t
 */
export default function SettingsSectionCard({
  sectionKey,
  status,
  title,
  summary = '',
  editing = false,
  keepSummary = false,
  editLabel,
  onEdit,
  editDisabled = false,
  editDisabledTitle,
  reason = '',
  onAdvanced,
  children,
  t,
}) {
  const ok = status === 'ok';
  const idle = status === 'idle';
  return (
    <section
      className={`${CARD} min-w-0 scroll-mt-4 p-4 ${editing ? 'ring-2 ring-primary-400 dark:ring-primary-500' : (status === 'missing' ? 'border-amber-300 dark:border-amber-500/60' : '')}`}
      data-testid={`settings-section-${sectionKey}`}
      data-status={status}
      data-editing={editing ? 'true' : 'false'}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center" aria-label={t(BADGE_KEY[status] || BADGE_KEY.idle)} data-testid={`settings-section-badge-${sectionKey}`}>
          {ok && <HiOutlineCheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" aria-hidden="true" />}
          {idle && <span className="h-2 w-2 rounded-full bg-gray-300 dark:bg-dk-border" aria-hidden="true" />}
          {!ok && !idle && <HiOutlineExclamation className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-dk-text">{title}</h3>
          {(!editing || keepSummary) && summary && (
            <p
              className={`mt-0.5 break-words text-sm ${ok ? 'text-gray-700 dark:text-dk-text' : (idle ? MUTED : 'font-medium text-rose-600 dark:text-rose-400')}`}
              data-testid={`settings-section-summary-${sectionKey}`}
            >
              {summary}
            </p>
          )}
        </div>
        {onEdit && !editing && (
          <button
            type="button"
            onClick={onEdit}
            disabled={editDisabled}
            title={editDisabled ? editDisabledTitle : undefined}
            data-testid={`settings-section-edit-${sectionKey}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent dark:border-dk-border dark:text-dk-text dark:hover:bg-dk-raised"
          >
            <HiOutlinePencil className="h-4 w-4" aria-hidden="true" />
            {editLabel || t('campaignSettings.section.edit')}
          </button>
        )}
      </div>
      {Children.toArray(children).length > 0 && <div className="mt-3 min-w-0 border-t border-gray-100 pt-3 dark:border-dk-border">{children}</div>}
      {!editing && (reason || onAdvanced) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-9">
          {reason && <p className={`text-xs ${MUTED}`} data-testid={`settings-section-reason-${sectionKey}`}>{reason}</p>}
          {onAdvanced && (
            <button
              type="button"
              onClick={onAdvanced}
              data-testid={`settings-section-advanced-${sectionKey}`}
              className="text-xs font-medium text-primary-600 hover:underline dark:text-primary-400"
            >
              {t('campaignSettings.section.advanced')}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
