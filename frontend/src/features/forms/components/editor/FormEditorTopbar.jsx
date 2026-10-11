import {
  HiOutlineChevronLeft,
  HiOutlineDocumentText,
  HiOutlineEye,
  HiOutlineEyeOff,
  HiOutlineInbox,
  HiOutlineShare,
} from 'react-icons/hi';
import { useI18n } from '../../../../i18n';
import {
  TopbarButton,
  TopbarDivider,
  TopbarSaveButton,
  TopbarSettingsButton,
} from '../../../../components/editor/AdminEditorShell';

/**
 * Thanh trên của trình soạn biểu mẫu (kiểu trang soạn landing /app):
 *   [‹ quay lại] [tên biểu mẫu] [trạng thái] … [Cài đặt] [Chia sẻ] [Bài nộp] | [Xuất bản/Gỡ] [Lưu]
 * Chia sẻ + Bài nộp chỉ có khi biểu mẫu đã lưu (có id). Dưới sm các nút chỉ còn icon, thanh tự xuống hàng nếu chật.
 */
export default function FormEditorTopbar({
  isEditMode,
  title,
  onTitleChange,
  titleError,
  isPublished,
  submissionCount,
  isSaving,
  isTogglingPublish,
  settingsOpen,
  onBack,
  onOpenSettings,
  onShare,
  onOpenSubmissions,
  onSave,
  onTogglePublish,
}) {
  const { t } = useI18n();
  const submissionsLabel =
    submissionCount !== null && submissionCount !== undefined
      ? `${t('forms.editorPage.submissions')} (${submissionCount})`
      : t('forms.editorPage.submissions');

  return (
    <div
      data-testid="form-editor-topbar"
      className="min-h-[52px] bg-white dark:bg-dk-surface border-b border-gray-200/90 dark:border-dk-border flex flex-wrap items-center justify-between px-3 sm:px-4 py-2 gap-x-3 gap-y-2 shrink-0 shadow-2xs z-20"
    >
      <div className="flex items-center gap-2 min-w-0 flex-1 basis-60 sm:max-w-md lg:max-w-lg">
        <button
          type="button"
          onClick={onBack}
          title={t('forms.submissionsPage.backToForms')}
          aria-label={t('forms.submissionsPage.backToForms')}
          className="p-1.5 rounded-xl text-gray-500 dark:text-dk-text2 hover:text-gray-900 dark:hover:text-dk-text hover:bg-gray-100 dark:hover:bg-dk-raised transition-colors shrink-0"
        >
          <HiOutlineChevronLeft className="w-5 h-5" />
        </button>

        <div className="min-w-0 flex-1">
          <div
            className={`flex items-center gap-2 bg-gray-50/90 dark:bg-dk-raised hover:bg-gray-100/80 dark:hover:bg-dk-strong focus-within:bg-white dark:focus-within:bg-dk-raised border rounded-xl px-2.5 h-[36px] transition-all w-full box-border focus-within:ring-2 ${
              titleError
                ? 'border-red-300 dark:border-red-500/60 focus-within:border-red-400 focus-within:ring-red-500/15'
                : 'border-gray-200/90 dark:border-dk-border/80 focus-within:border-orange-500 focus-within:ring-orange-500/15'
            }`}
          >
            <HiOutlineDocumentText className="w-4 h-4 text-orange-500 shrink-0" />
            <input
              type="text"
              maxLength={200}
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              aria-label={t('forms.formTitle')}
              placeholder={t('forms.editorPage.titlePlaceholder')}
              className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-dk-text bg-transparent border-none focus:outline-none min-w-0 flex-1 placeholder:text-gray-400 dark:placeholder:text-dk-muted placeholder:font-normal"
            />
            {isEditMode && (
              <span
                className={`hidden sm:inline-flex shrink-0 items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                  isPublished
                    ? 'bg-green-50 dark:bg-emerald-950/40 text-green-700 dark:text-emerald-400 border-green-200 dark:border-emerald-800'
                    : 'bg-gray-100 dark:bg-dk-raised text-gray-600 dark:text-dk-text2 border-gray-200 dark:border-dk-border'
                }`}
              >
                {isPublished ? t('forms.isPublished') : t('forms.isDraft')}
              </span>
            )}
          </div>
          {titleError && <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5 px-1">{titleError}</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 ml-auto">
        <TopbarSettingsButton onClick={onOpenSettings} active={settingsOpen} />

        {/* Chia sẻ + Bài nộp chỉ hiện khi biểu mẫu đã lưu (có id) — chưa lưu thì không có gì để chia sẻ / xem. */}
        {isEditMode && (
          <>
            <TopbarButton
              icon={HiOutlineShare}
              onClick={onShare}
              title={t('forms.share')}
              aria-label={t('forms.share')}
            >
              <span className="hidden sm:inline">{t('forms.share')}</span>
            </TopbarButton>
            <TopbarButton
              icon={HiOutlineInbox}
              onClick={onOpenSubmissions}
              title={submissionsLabel}
              aria-label={submissionsLabel}
            >
              <span className="hidden sm:inline">{submissionsLabel}</span>
            </TopbarButton>
          </>
        )}

        <TopbarDivider />

        <button
          type="button"
          onClick={onTogglePublish}
          disabled={isSaving || isTogglingPublish}
          title={!isEditMode ? t('forms.editorPage.saveAndPublishTooltip') : undefined}
          aria-label={isPublished ? t('forms.unpublish') : t('forms.publish')}
          className={`inline-flex items-center justify-center gap-1.5 h-[36px] px-2.5 sm:px-3 rounded-xl text-xs sm:text-sm font-semibold border shadow-2xs transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
            isPublished
              ? 'border-gray-300/90 dark:border-dk-border/80 text-gray-700 dark:text-dk-text bg-white dark:bg-dk-raised hover:bg-gray-50 dark:hover:bg-dk-strong'
              : 'border-emerald-600 text-emerald-700 dark:text-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
          }`}
        >
          {isPublished ? (
            <>
              <HiOutlineEyeOff className="w-4 h-4 text-gray-500 dark:text-dk-text2" />
              <span className="hidden sm:inline">{t('forms.unpublish')}</span>
            </>
          ) : (
            <>
              <HiOutlineEye className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="hidden sm:inline">{t('forms.publish')}</span>
            </>
          )}
        </button>

        <TopbarSaveButton
          onClick={onSave}
          saving={isSaving}
          disabled={isTogglingPublish}
          label={t('forms.editorPage.saveForm')}
        />
      </div>
    </div>
  );
}
