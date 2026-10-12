import { HiOutlineTrash } from 'react-icons/hi';
import { useI18n } from '../../../../i18n';
import FieldShowIfEditor from './FieldShowIfEditor';
import { isDisplayFieldType } from '../../utils/formFieldTypes.util';
import {
  FIELD_TYPES,
  FIELD_TYPE_GROUPS,
  MAX_HELP_TEXT_LENGTH,
  MAX_LABEL_LENGTH,
  MAX_PARAGRAPH_LENGTH,
  MAX_PLACEHOLDER_LENGTH,
  NO_ROLE_FIELD_TYPES,
  OPTION_FIELD_TYPES,
  PLACEHOLDER_FIELD_TYPES,
} from './formEditorConstants';
import {
  FORM_FILE_KIND_IDS,
  FORM_FILE_KIND_EXTS,
  MIN_FORM_FILE_MB,
  MAX_FORM_FILE_MB,
  MIN_FORM_FILE_COUNT,
  MAX_FORM_FILE_COUNT,
} from '../../utils/formFileKinds.util';

const inputBase =
  'w-full px-3.5 py-2.5 bg-white dark:bg-dk-bg rounded-xl border text-sm text-slate-900 dark:text-dk-text placeholder:text-slate-400 dark:placeholder:text-dk-muted focus:outline-none focus:ring-4 transition shadow-2xs';
const inputOk = 'border-gray-200 dark:border-dk-border focus:border-orange-500 focus:ring-orange-500/10';
const inputErr = 'border-red-300 dark:border-red-500/60 focus:ring-red-100 dark:focus:ring-red-950/30';

/**
 * Bảng thuộc tính của TRƯỜNG ĐANG CHỌN: nhãn, loại, vai trò, độ rộng, bắt buộc, gợi ý trong ô (placeholder), chữ hướng dẫn, lựa chọn.
 * Chuyển từ thẻ trường của trình soạn cũ (nhãn / loại / vai trò / bắt buộc / lựa chọn nguyên văn) + thêm placeholder & helpText.
 *
 * PR-4: ẨN ô không áp dụng. Khối bố cục (heading / paragraph / page_break) không có Bắt buộc / Vai trò / Gợi ý trong ô /
 * Độ rộng / Lựa chọn; paragraph và page_break cũng không có chữ hướng dẫn. Nhãn đổi nghĩa theo loại: heading = chữ tiêu
 * đề, paragraph = NỘI DUNG đoạn chữ (lưu trong `label`, tối đa 2000), page_break = tiêu đề bước (tuỳ chọn, được để trống).
 * rating / yes_no / time không có Vai trò.
 *
 * PR-8a: mục "Điều kiện hiển thị" ở cuối bảng (mọi trường trừ ngắt trang) — xem FieldShowIfEditor.
 */
export default function FieldPropertiesPanel({
  field,
  idx,
  errors,
  fields = [],
  showIfIssues = [],
  fileUploadsEnabled = false,
  onUpdateField,
  onEnsureFieldKey,
  onAddOption,
  onUpdateOption,
  onRemoveOption,
}) {
  const { t } = useI18n();
  const isBlock = isDisplayFieldType(field.type);
  const isHeading = field.type === 'heading';
  const isParagraph = field.type === 'paragraph';
  const isPageBreak = field.type === 'page_break';
  const supportsRole = !isBlock && !NO_ROLE_FIELD_TYPES.includes(field.type);
  const supportsHelpText = !isParagraph && !isPageBreak;
  const hasOptions = OPTION_FIELD_TYPES.includes(field.type);
  const isFile = field.type === 'file';
  const fileConfig = field.fileConfig || { kinds: [], maxMb: '', maxFiles: '' };
  const fileKindsError = errors[`field_${idx}_fileKinds`];
  const fileSizeError = errors[`field_${idx}_fileSize`];
  const fileCountError = errors[`field_${idx}_fileCount`];
  const toggleFileKind = (kindId) => {
    const kinds = fileConfig.kinds.includes(kindId)
      ? fileConfig.kinds.filter((k) => k !== kindId)
      : FORM_FILE_KIND_IDS.filter((k) => k === kindId || fileConfig.kinds.includes(k));
    onUpdateField(idx, 'fileConfig', { ...fileConfig, kinds });
  };
  const supportsPlaceholder = PLACEHOLDER_FIELD_TYPES.includes(field.type);
  const labelError = errors[`field_${idx}_label`];
  const optionsError = errors[`field_${idx}_options`];
  const helpTextError = errors[`field_${idx}_helpText`];
  const placeholderError = errors[`field_${idx}_placeholder`];
  const idPrefix = `fp-${field.uid}`;

  return (
    <div className="space-y-4" data-testid="field-properties-panel">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Nhãn trường — đổi nghĩa theo loại (xem chú thích đầu file) */}
        <div className="sm:col-span-2">
          <label htmlFor={`${idPrefix}-label`} className="block text-xs font-semibold text-gray-700 dark:text-dk-text mb-1">
            {isHeading
              ? t('forms.editorPage.properties.headingLabel')
              : isParagraph
                ? t('forms.editorPage.properties.paragraphLabel')
                : isPageBreak
                  ? t('forms.editorPage.properties.pageBreakLabel')
                  : t('forms.fieldLabel')}{' '}
            {!isPageBreak && <span className="text-red-500 dark:text-red-400">*</span>}
          </label>
          {isParagraph ? (
            <>
              <textarea
                id={`${idPrefix}-label`}
                rows={4}
                maxLength={MAX_PARAGRAPH_LENGTH}
                value={field.label}
                onChange={(e) => onUpdateField(idx, 'label', e.target.value)}
                placeholder={t('forms.editorPage.properties.paragraphPlaceholder')}
                className={`${inputBase} resize-y ${labelError ? inputErr : inputOk}`}
              />
              <div className="flex justify-end mt-1">
                <span className="text-[11px] text-gray-400 dark:text-dk-muted shrink-0">
                  {(field.label || '').length}/{MAX_PARAGRAPH_LENGTH}
                </span>
              </div>
            </>
          ) : (
            <input
              id={`${idPrefix}-label`}
              type="text"
              maxLength={MAX_LABEL_LENGTH}
              value={field.label}
              onChange={(e) => onUpdateField(idx, 'label', e.target.value)}
              placeholder={
                isHeading
                  ? t('forms.editorPage.properties.headingPlaceholder')
                  : isPageBreak
                    ? t('forms.editorPage.properties.pageBreakPlaceholder')
                    : t('forms.editorPage.fieldLabelPlaceholder')
              }
              className={`${inputBase} font-medium ${labelError ? inputErr : inputOk}`}
            />
          )}
          {isPageBreak && (
            <p className="text-[11px] text-gray-500 dark:text-dk-text2 mt-1">{t('forms.editorPage.properties.pageBreakHint')}</p>
          )}
          {labelError && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{labelError}</p>}
        </div>

        {/* Kiểu dữ liệu */}
        <div>
          <label htmlFor={`${idPrefix}-type`} className="block text-xs font-semibold text-gray-700 dark:text-dk-text mb-1">
            {t('forms.fieldType')}
          </label>
          <select
            id={`${idPrefix}-type`}
            value={field.type}
            onChange={(e) => onUpdateField(idx, 'type', e.target.value)}
            className={`${inputBase} font-medium ${inputOk}`}
          >
            {FIELD_TYPE_GROUPS.map((group) => (
              <optgroup key={group.id} label={t(group.labelKey)}>
                {FIELD_TYPES.filter(
                  (ft) => ft.group === group.id && (!ft.requiresFileFlag || fileUploadsEnabled || field.type === ft.value)
                ).map((ft) => (
                  <option key={ft.value} value={ft.value}>
                    {t(ft.labelKey)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Vai trò role — chỉ loại có thể là tên / email / SĐT (không phải khối bố cục, sao, có-không, giờ) */}
        {supportsRole && (
          <div>
            <label htmlFor={`${idPrefix}-role`} className="block text-xs font-semibold text-gray-700 dark:text-dk-text mb-1">
              {t('forms.role')}
            </label>
            <select
              id={`${idPrefix}-role`}
              value={field.role || ''}
              onChange={(e) => onUpdateField(idx, 'role', e.target.value)}
              className={`${inputBase} ${inputOk}`}
            >
              <option value="">{t('forms.roleNone')}</option>
              <option value="name">{t('forms.roleName')}</option>
              <option value="email">{t('forms.roleEmail')}</option>
              <option value="phone">{t('forms.rolePhone')}</option>
            </select>
          </div>
        )}

        {/* Độ rộng: Cả dòng / Nửa dòng — chỉ trường nhập (khối bố cục luôn cả dòng) */}
        {!isBlock && (
          <div>
            <label htmlFor={`${idPrefix}-width`} className="block text-xs font-semibold text-gray-700 dark:text-dk-text mb-1">
              {t('forms.editorPage.properties.widthLabel')}
            </label>
            <select
              id={`${idPrefix}-width`}
              value={field.width === 'half' ? 'half' : 'full'}
              onChange={(e) => onUpdateField(idx, 'width', e.target.value)}
              className={`${inputBase} ${inputOk}`}
            >
              <option value="full">{t('forms.editorPage.properties.widthFull')}</option>
              <option value="half">{t('forms.editorPage.properties.widthHalf')}</option>
            </select>
          </div>
        )}

        {/* Gợi ý trong ô nhập (placeholder) — chỉ loại có ô nhập chữ */}
        {supportsPlaceholder && (
          <div className="sm:col-span-2">
            <label htmlFor={`${idPrefix}-placeholder`} className="block text-xs font-semibold text-gray-700 dark:text-dk-text mb-1">
              {t('forms.editorPage.properties.placeholderLabel')}
            </label>
            <input
              id={`${idPrefix}-placeholder`}
              type="text"
              maxLength={MAX_PLACEHOLDER_LENGTH}
              value={field.placeholder || ''}
              onChange={(e) => onUpdateField(idx, 'placeholder', e.target.value)}
              placeholder={t('forms.editorPage.properties.placeholderExample')}
              className={`${inputBase} ${placeholderError ? inputErr : inputOk}`}
            />
            {placeholderError && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{placeholderError}</p>}
          </div>
        )}

        {/* Chữ hướng dẫn dưới nhãn (heading: mô tả phụ; paragraph / page_break: không có) */}
        {supportsHelpText && (
        <div className="sm:col-span-2">
          <label htmlFor={`${idPrefix}-help`} className="block text-xs font-semibold text-gray-700 dark:text-dk-text mb-1">
            {isHeading ? t('forms.editorPage.properties.headingHelpLabel') : t('forms.editorPage.properties.helpTextLabel')}
          </label>
          <textarea
            id={`${idPrefix}-help`}
            rows={2}
            maxLength={MAX_HELP_TEXT_LENGTH}
            value={field.helpText || ''}
            onChange={(e) => onUpdateField(idx, 'helpText', e.target.value)}
            placeholder={
              isHeading ? t('forms.editorPage.properties.headingHelpExample') : t('forms.editorPage.properties.helpTextExample')
            }
            className={`${inputBase} resize-y ${helpTextError ? inputErr : inputOk}`}
          />
          <div className="flex items-start justify-between gap-2 mt-1">
            <p className="text-[11px] text-gray-500 dark:text-dk-text2">
              {isHeading ? '' : t('forms.editorPage.properties.helpTextHint')}
            </p>
            <span className="text-[11px] text-gray-400 dark:text-dk-muted shrink-0">
              {(field.helpText || '').length}/{MAX_HELP_TEXT_LENGTH}
            </span>
          </div>
          {helpTextError && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{helpTextError}</p>}
        </div>
        )}

        {/* Bắt buộc check — khối bố cục không có giá trị nên không có ô này */}
        {!isBlock && (
          <div className="sm:col-span-2">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700 dark:text-dk-text px-3 py-2 rounded-xl hover:bg-gray-100/80 dark:hover:bg-dk-raised transition">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => onUpdateField(idx, 'required', e.target.checked)}
                className="h-4 w-4 rounded text-orange-600 dark:text-orange-400 focus:ring-orange-500 border-gray-300 dark:border-dk-border-strong"
              />
              <span className="font-medium">{t('forms.required')}</span>
            </label>
          </div>
        )}
      </div>

      {/* Trường tải tệp: nhóm tệp nhận / dung lượng tối đa mỗi tệp / số tệp tối đa. Loại nguy hiểm (exe, html, svg…) không có trong danh sách. */}
      {isFile && (
        <div className="pt-3 border-t border-gray-200/80 dark:border-dk-border space-y-3" data-testid="file-config-panel">
          <fieldset>
            <legend className="text-xs font-semibold text-gray-700 dark:text-dk-text mb-1.5">
              {t('forms.editorPage.properties.fileKindsLabel')}
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {FORM_FILE_KIND_IDS.map((kindId) => (
                <label
                  key={kindId}
                  className="flex items-start gap-2 cursor-pointer select-none text-sm text-gray-700 dark:text-dk-text px-2.5 py-1.5 rounded-xl hover:bg-gray-100/80 dark:hover:bg-dk-raised transition"
                >
                  <input
                    type="checkbox"
                    checked={fileConfig.kinds.includes(kindId)}
                    onChange={() => toggleFileKind(kindId)}
                    className="mt-0.5 h-4 w-4 rounded text-orange-600 dark:text-orange-400 focus:ring-orange-500 border-gray-300 dark:border-dk-border-strong"
                  />
                  <span className="min-w-0">
                    <span className="font-medium">{t(`forms.editorPage.properties.fileKind.${kindId}`)}</span>
                    <span className="block text-[11px] text-gray-500 dark:text-dk-text2 break-words">
                      {FORM_FILE_KIND_EXTS[kindId].map((ext) => `.${ext}`).join(' ')}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {fileKindsError && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{fileKindsError}</p>}
          </fieldset>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor={`${idPrefix}-file-mb`} className="block text-xs font-semibold text-gray-700 dark:text-dk-text mb-1">
                {t('forms.editorPage.properties.fileMaxSizeLabel')}
              </label>
              <input
                id={`${idPrefix}-file-mb`}
                type="number"
                inputMode="decimal"
                min={MIN_FORM_FILE_MB}
                max={MAX_FORM_FILE_MB}
                step="any"
                value={fileConfig.maxMb}
                onChange={(e) => onUpdateField(idx, 'fileConfig', { ...fileConfig, maxMb: e.target.value })}
                className={`${inputBase} ${fileSizeError ? inputErr : inputOk}`}
              />
              <p className="text-[11px] text-gray-500 dark:text-dk-text2 mt-1">
                {t('forms.editorPage.properties.fileMaxSizeHint', { min: MIN_FORM_FILE_MB, max: MAX_FORM_FILE_MB })}
              </p>
              {fileSizeError && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{fileSizeError}</p>}
            </div>
            <div>
              <label htmlFor={`${idPrefix}-file-count`} className="block text-xs font-semibold text-gray-700 dark:text-dk-text mb-1">
                {t('forms.editorPage.properties.fileMaxFilesLabel')}
              </label>
              <input
                id={`${idPrefix}-file-count`}
                type="number"
                inputMode="numeric"
                min={MIN_FORM_FILE_COUNT}
                max={MAX_FORM_FILE_COUNT}
                step="1"
                value={fileConfig.maxFiles}
                onChange={(e) => onUpdateField(idx, 'fileConfig', { ...fileConfig, maxFiles: e.target.value })}
                className={`${inputBase} ${fileCountError ? inputErr : inputOk}`}
              />
              <p className="text-[11px] text-gray-500 dark:text-dk-text2 mt-1">
                {t('forms.editorPage.properties.fileMaxFilesHint', { min: MIN_FORM_FILE_COUNT, max: MAX_FORM_FILE_COUNT })}
              </p>
              {fileCountError && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{fileCountError}</p>}
            </div>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-dk-text2">{t('forms.editorPage.properties.fileStorageNote')}</p>
        </div>
      )}

      {/* Danh sách lựa chọn options (nếu là select, radio, checkbox) */}
      {hasOptions && (
        <div className="pt-3 border-t border-gray-200/80 dark:border-dk-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700 dark:text-dk-text">{t('forms.options')}</span>
            <button
              type="button"
              onClick={() => onAddOption(idx)}
              className="inline-flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 font-semibold px-2 py-1 rounded-md hover:bg-orange-50 dark:hover:bg-orange-950/40 transition"
            >
              + {t('forms.addOption')}
            </button>
          </div>

          {optionsError && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 p-2.5 rounded-xl">{optionsError}</p>
          )}

          <div className="space-y-2">
            {field.options.map((opt, optIdx) => (
              <div key={optIdx} className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-400 dark:text-dk-muted w-4 text-center shrink-0">
                  {optIdx + 1}.
                </span>
                <input
                  type="text"
                  maxLength={100}
                  value={opt}
                  onChange={(e) => onUpdateOption(idx, optIdx, e.target.value)}
                  placeholder={t('forms.optionPlaceholder')}
                  className="w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border border-gray-200 dark:border-dk-border text-xs font-medium text-slate-900 dark:text-dk-text placeholder:text-slate-400 dark:placeholder:text-dk-muted focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 shadow-2xs"
                />
                <button
                  type="button"
                  onClick={() => onRemoveOption(idx, optIdx)}
                  className="p-1.5 text-gray-400 dark:text-dk-muted hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"
                  title={t('forms.editorPage.removeOption')}
                  aria-label={t('forms.editorPage.removeOption')}
                >
                  <HiOutlineTrash className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Điều kiện hiển thị (PR-8a): mọi trường trừ ngắt trang (ranh giới trang không có điều kiện) */}
      {!isPageBreak && (
        <FieldShowIfEditor
          field={field}
          idx={idx}
          fields={fields}
          issues={showIfIssues}
          onUpdateField={onUpdateField}
          onEnsureFieldKey={onEnsureFieldKey}
        />
      )}
    </div>
  );
}
