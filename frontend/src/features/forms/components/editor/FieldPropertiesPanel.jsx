import { HiOutlineTrash } from 'react-icons/hi';
import { useI18n } from '../../../../i18n';
import {
  FIELD_TYPES,
  MAX_HELP_TEXT_LENGTH,
  MAX_LABEL_LENGTH,
  MAX_PLACEHOLDER_LENGTH,
  OPTION_FIELD_TYPES,
  PLACEHOLDER_FIELD_TYPES,
} from './formEditorConstants';

const inputBase =
  'w-full px-3.5 py-2.5 bg-white dark:bg-dk-bg rounded-xl border text-sm text-slate-900 dark:text-dk-text placeholder:text-slate-400 dark:placeholder:text-dk-muted focus:outline-none focus:ring-4 transition shadow-2xs';
const inputOk = 'border-gray-200 dark:border-dk-border focus:border-orange-500 focus:ring-orange-500/10';
const inputErr = 'border-red-300 dark:border-red-500/60 focus:ring-red-100 dark:focus:ring-red-950/30';

/**
 * Bảng thuộc tính của TRƯỜNG ĐANG CHỌN: nhãn, loại, vai trò, bắt buộc, gợi ý trong ô (placeholder), chữ hướng dẫn, lựa chọn.
 * Chuyển từ thẻ trường của trình soạn cũ (nhãn / loại / vai trò / bắt buộc / lựa chọn nguyên văn) + thêm placeholder & helpText.
 */
export default function FieldPropertiesPanel({
  field,
  idx,
  errors,
  onUpdateField,
  onAddOption,
  onUpdateOption,
  onRemoveOption,
}) {
  const { t } = useI18n();
  const hasOptions = OPTION_FIELD_TYPES.includes(field.type);
  const supportsPlaceholder = PLACEHOLDER_FIELD_TYPES.includes(field.type);
  const labelError = errors[`field_${idx}_label`];
  const optionsError = errors[`field_${idx}_options`];
  const helpTextError = errors[`field_${idx}_helpText`];
  const placeholderError = errors[`field_${idx}_placeholder`];
  const idPrefix = `fp-${field.uid}`;

  return (
    <div className="space-y-4" data-testid="field-properties-panel">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Nhãn trường */}
        <div className="sm:col-span-2">
          <label htmlFor={`${idPrefix}-label`} className="block text-xs font-semibold text-gray-700 dark:text-dk-text mb-1">
            {t('forms.fieldLabel')} <span className="text-red-500 dark:text-red-400">*</span>
          </label>
          <input
            id={`${idPrefix}-label`}
            type="text"
            maxLength={MAX_LABEL_LENGTH}
            value={field.label}
            onChange={(e) => onUpdateField(idx, 'label', e.target.value)}
            placeholder={t('forms.editorPage.fieldLabelPlaceholder')}
            className={`${inputBase} font-medium ${labelError ? inputErr : inputOk}`}
          />
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
            {FIELD_TYPES.map((ft) => (
              <option key={ft.value} value={ft.value}>
                {t(ft.labelKey)}
              </option>
            ))}
          </select>
        </div>

        {/* Vai trò role */}
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

        {/* Chữ hướng dẫn dưới nhãn */}
        <div className="sm:col-span-2">
          <label htmlFor={`${idPrefix}-help`} className="block text-xs font-semibold text-gray-700 dark:text-dk-text mb-1">
            {t('forms.editorPage.properties.helpTextLabel')}
          </label>
          <textarea
            id={`${idPrefix}-help`}
            rows={2}
            maxLength={MAX_HELP_TEXT_LENGTH}
            value={field.helpText || ''}
            onChange={(e) => onUpdateField(idx, 'helpText', e.target.value)}
            placeholder={t('forms.editorPage.properties.helpTextExample')}
            className={`${inputBase} resize-y ${helpTextError ? inputErr : inputOk}`}
          />
          <div className="flex items-start justify-between gap-2 mt-1">
            <p className="text-[11px] text-gray-500 dark:text-dk-text2">{t('forms.editorPage.properties.helpTextHint')}</p>
            <span className="text-[11px] text-gray-400 dark:text-dk-muted shrink-0">
              {(field.helpText || '').length}/{MAX_HELP_TEXT_LENGTH}
            </span>
          </div>
          {helpTextError && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{helpTextError}</p>}
        </div>

        {/* Bắt buộc check */}
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
      </div>

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
    </div>
  );
}
