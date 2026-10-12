import { useRef, useState } from 'react';
import {
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineArrowUp,
  HiOutlineArrowDown,
  HiOutlineDuplicate,
  HiOutlineDotsVertical,
  HiOutlineLightningBolt,
  HiOutlineViewList,
  HiOutlineX,
} from 'react-icons/hi';
import { useI18n } from '../../../../i18n';
import FieldPropertiesPanel from './FieldPropertiesPanel';
import { isDisplayFieldType } from '../../utils/formFieldTypes.util';
import { FIELD_TYPES, FIELD_TYPE_GROUPS, MAX_FIELDS, QUICK_FIELD_PRESETS } from './formEditorConstants';

/**
 * Cột TRÁI của trình soạn: hàng "Thêm nhanh" + danh sách trường (chọn để sửa, kéo-thả HTML5 trên máy tính, nút lên/xuống
 * cho bàn phím và cảm ứng, nhân bản, xoá). Trường đang chọn mở ngay bảng thuộc tính bên dưới hàng của nó.
 *
 * Kéo-thả: chỉ phần đầu hàng (không phải bảng thuộc tính) là `draggable` nên bôi đen chữ trong ô nhập vẫn bình thường.
 * Thứ tự cuối cùng do `onReorder(from, to)` của trang quyết định — component này không giữ state danh sách.
 */
export default function FieldListPane({
  fields,
  errors,
  selectedUid,
  setupHints,
  onDismissSetupHints,
  onOpenSettings,
  onSelect,
  onAddField,
  onAddQuickField,
  onMoveField,
  onReorderField,
  onDuplicateField,
  onRemoveField,
  onUpdateField,
  onAddOption,
  onUpdateOption,
  onRemoveOption,
}) {
  const { t } = useI18n();
  // Hàng "Thêm nhanh": mặc định chỉ 4 loại hay dùng; "Loại khác…" mở phần còn lại.
  const [showMoreFieldTypes, setShowMoreFieldTypes] = useState(false);
  // Kéo-thả: chỉ số đang kéo giữ trong ref (dataTransfer không đọc được ở dragover trên một số trình duyệt),
  // chỉ số đang rê tới giữ trong state để vẽ vạch đích.
  const dragFromRef = useRef(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  const resetDrag = () => {
    dragFromRef.current = null;
    setDragOverIdx(null);
  };

  const showHints = Boolean(setupHints?.booking || setupHints?.payment);

  // Đếm riêng trường NHẬP (x/30) và khối bố cục (tiêu đề / đoạn chữ / ngắt trang). Số thứ tự "Trường #n" chỉ tính trường
  // nhập; khối bố cục có số riêng (dùng cho nhãn đọc màn hình).
  let inputSeq = 0;
  let blockSeq = 0;
  const ordinals = fields.map((f) => (isDisplayFieldType(f.type) ? { block: ++blockSeq } : { input: ++inputSeq }));
  const inputCount = inputSeq;
  const blockCount = blockSeq;

  const renderPresetButton = (preset) => {
    const Icon = preset.icon;
    return (
      <button
        key={preset.id || preset.title}
        type="button"
        onClick={() => onAddQuickField(preset)}
        className="inline-flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-dk-raised hover:bg-orange-50 dark:hover:bg-orange-950/40 text-slate-700 dark:text-dk-text hover:text-orange-700 dark:hover:text-orange-400 border border-slate-200 dark:border-dk-border hover:border-orange-300 dark:hover:border-orange-500/50 rounded-xl text-xs font-semibold transition-all shadow-2xs hover:shadow-xs active:scale-95 group"
      >
        <Icon className="w-3.5 h-3.5 text-slate-500 dark:text-dk-text2 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition" />
        <span>{preset.titleKey ? t(preset.titleKey) : preset.title}</span>
      </button>
    );
  };

  return (
    <div className="p-3 sm:p-4 space-y-4 min-w-0" data-testid="form-field-list-pane">
      {/* Gợi ý sau khi chọn mẫu bật sẵn Đặt lịch / Thanh toán: dẫn thẳng tới tab cần khai */}
      {showHints && (
        <div
          data-testid="form-setup-hints"
          className="rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/80 dark:bg-blue-950/30 p-3.5 space-y-2"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold text-blue-900 dark:text-blue-200">{t('forms.editorPage.setupHint.title')}</p>
            <button
              type="button"
              onClick={onDismissSetupHints}
              className="p-1 -m-1 text-blue-400 dark:text-blue-300 hover:text-blue-700 dark:hover:text-blue-100 rounded-lg"
              title={t('forms.editorPage.setupHint.dismiss')}
              aria-label={t('forms.editorPage.setupHint.dismiss')}
            >
              <HiOutlineX className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {setupHints.booking && (
              <button
                type="button"
                onClick={() => onOpenSettings('booking')}
                className="px-3 py-1.5 rounded-xl bg-white dark:bg-dk-raised border border-blue-200 dark:border-blue-800/60 text-xs font-semibold text-blue-800 dark:text-blue-200 hover:bg-blue-100/60 dark:hover:bg-dk-strong transition"
              >
                {t('forms.editorPage.setupHint.booking')}
              </button>
            )}
            {setupHints.payment && (
              <button
                type="button"
                onClick={() => onOpenSettings('payment')}
                className="px-3 py-1.5 rounded-xl bg-white dark:bg-dk-raised border border-blue-200 dark:border-blue-800/60 text-xs font-semibold text-blue-800 dark:text-blue-200 hover:bg-blue-100/60 dark:hover:bg-dk-strong transition"
              >
                {t('forms.editorPage.setupHint.payment')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tiêu đề + đếm + thêm trường trống */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/25 flex items-center justify-center shrink-0">
            <HiOutlineViewList className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-dk-text">{t('forms.fields')}</h2>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200/80 dark:border-indigo-900/60">
                {inputCount}/{MAX_FIELDS}
              </span>
              {blockCount > 0 && (
                <span
                  data-testid="form-block-count"
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 border border-teal-100 dark:border-teal-900/60"
                >
                  {t('forms.editorPage.fieldList.blockCount', { count: blockCount })}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-dk-text2 mt-0.5">{t('forms.editorPage.maxFieldsHelp')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onAddField}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 active:scale-[0.98] text-white rounded-xl text-xs font-bold shadow-xs hover:shadow transition self-start sm:self-auto shrink-0"
        >
          <HiOutlinePlus className="w-4 h-4" />
          <span>{t('forms.addField')}</span>
        </button>
      </div>

      {/* Dải nút thêm nhanh 1-chạm */}
      <div className="bg-gradient-to-r from-orange-50/80 via-amber-50/50 to-orange-50/30 dark:from-orange-950/20 dark:via-amber-950/10 dark:to-orange-950/20 p-3.5 rounded-2xl border border-dashed border-orange-200/90 dark:border-orange-800/60 shadow-2xs">
        <div className="text-[11px] font-bold text-orange-950 dark:text-orange-200 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
          <HiOutlineLightningBolt className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
          <span>{t('forms.editorPage.quickAdd.title')}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_FIELD_PRESETS.filter((preset) => preset.common).map(renderPresetButton)}
          <button
            type="button"
            aria-expanded={showMoreFieldTypes}
            onClick={() => setShowMoreFieldTypes((prev) => !prev)}
            className="inline-flex items-center gap-1 px-3 py-2 text-orange-700 dark:text-orange-400 hover:bg-orange-100/70 dark:hover:bg-orange-950/40 rounded-xl text-xs font-bold transition"
          >
            {showMoreFieldTypes ? t('forms.editorPage.quickAdd.fewerTypes') : t('forms.editorPage.quickAdd.moreTypes')}
          </button>
        </div>
        {/* "Loại khác…": phần còn lại chia hai nhóm — Câu hỏi (trường nhập) và Bố cục (tiêu đề, đoạn chữ, ngắt trang) */}
        {showMoreFieldTypes && (
          <div className="mt-3 space-y-3" data-testid="form-more-field-types">
            {FIELD_TYPE_GROUPS.map((group) => {
              const presets = QUICK_FIELD_PRESETS.filter((preset) => !preset.common && preset.group === group.id);
              if (presets.length === 0) return null;
              return (
                <div key={group.id}>
                  <div className="text-[11px] font-bold text-orange-900/80 dark:text-orange-300/80 uppercase tracking-wider mb-1.5">
                    {t(group.labelKey)}
                  </div>
                  <div className="flex flex-wrap gap-2">{presets.map(renderPresetButton)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {errors.fields && (
        <p className="text-xs text-red-600 dark:text-red-400 p-3 bg-red-50 dark:bg-red-950/40 rounded-xl">{errors.fields}</p>
      )}

      {fields.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-dk-text2 text-center py-8 rounded-2xl border border-dashed border-slate-200 dark:border-dk-border">
          {t('forms.editorPage.fieldList.empty')}
        </p>
      )}

      <ul className="space-y-2.5" aria-label={t('forms.fields')}>
        {fields.map((field, idx) => {
          const selected = field.uid === selectedUid;
          const hasError = Object.keys(errors).some((k) => k.startsWith(`field_${idx}_`));
          const typeLabel = t(FIELD_TYPES.find((ft) => ft.value === field.type)?.labelKey || 'forms.types.short_text');
          const isBlock = isDisplayFieldType(field.type);
          // page_break không bắt buộc nhãn: hàng trống nhãn hiện "Sang trang mới" thay vì dấu gạch.
          const rowLabel = field.label || (field.type === 'page_break' ? t('forms.editorPage.fieldList.pageBreakRow') : '—');
          const isDropTarget = dragOverIdx === idx && dragFromRef.current !== null && dragFromRef.current !== idx;

          return (
            <li
              key={field.uid}
              id={`field-row-${field.uid}`}
              data-testid={`field-row-${idx}`}
              data-selected={selected ? 'true' : 'false'}
              onDragOver={(e) => {
                if (dragFromRef.current === null) return;
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                if (dragOverIdx !== idx) setDragOverIdx(idx);
              }}
              onDrop={(e) => {
                if (dragFromRef.current === null) return;
                e.preventDefault();
                const from = dragFromRef.current;
                resetDrag();
                if (from !== idx) onReorderField(from, idx);
              }}
              className={`rounded-2xl border ${isBlock ? 'bg-teal-50/40 dark:bg-dk-inset border-dashed' : 'bg-white dark:bg-dk-raised'} transition-all ${
                isDropTarget
                  ? 'border-orange-400 ring-2 ring-orange-300/60 dark:ring-orange-500/30'
                  : selected
                    ? 'border-orange-300 dark:border-orange-500/50 shadow-sm'
                    : hasError
                      ? 'border-red-300 dark:border-red-500/60'
                      : 'border-slate-200/90 dark:border-dk-border hover:border-slate-300 dark:hover:border-dk-border-strong'
              }`}
            >
              {/* Đầu hàng: kéo được + bấm để chọn + các nút thao tác */}
              <div
                draggable
                onDragStart={(e) => {
                  dragFromRef.current = idx;
                  if (e.dataTransfer) {
                    e.dataTransfer.effectAllowed = 'move';
                    try {
                      e.dataTransfer.setData('text/plain', String(idx));
                    } catch {
                      // một số trình duyệt cũ không cho setData — bỏ qua, ref đã đủ dùng
                    }
                  }
                }}
                onDragEnd={resetDrag}
                className="flex items-center gap-1 pl-1.5 pr-2 py-2"
              >
                <span
                  className="text-slate-300 dark:text-dk-muted cursor-grab active:cursor-grabbing shrink-0 hidden sm:inline-flex"
                  title={t('forms.editorPage.fieldList.dragHandle')}
                  aria-hidden="true"
                >
                  <HiOutlineDotsVertical className="w-4 h-4" />
                </span>
                <button
                  type="button"
                  onClick={() => onSelect(field.uid)}
                  aria-label={
                    isBlock
                      ? t('forms.editorPage.fieldList.selectBlock', { index: ordinals[idx].block, label: rowLabel })
                      : t('forms.editorPage.fieldList.selectField', { index: ordinals[idx].input, label: field.label })
                  }
                  aria-current={selected ? 'true' : undefined}
                  className="flex-1 min-w-0 text-left flex items-center gap-2 flex-wrap rounded-xl px-1.5 py-1 hover:bg-slate-50 dark:hover:bg-dk-strong/50 transition"
                >
                  {!isBlock && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-dk-strong text-slate-700 dark:text-dk-text border border-slate-200/80 dark:border-dk-border shrink-0">
                      {t('forms.editorPage.fieldIndex', { index: ordinals[idx].input })}
                    </span>
                  )}
                  <span
                    className={`text-sm font-semibold truncate min-w-0 max-w-full ${
                      isBlock && !field.label ? 'italic text-slate-500 dark:text-dk-text2' : 'text-slate-900 dark:text-dk-text'
                    }`}
                  >
                    {rowLabel}
                  </span>
                  {/* Khối bố cục mang huy hiệu màu khác (không có "Bắt buộc"/vai trò) để phân biệt với câu hỏi */}
                  <span
                    data-testid={isBlock ? `field-block-badge-${idx}` : undefined}
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border shrink-0 ${
                      isBlock
                        ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 border-teal-100 dark:border-teal-900/60'
                        : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/60'
                    }`}
                  >
                    {typeLabel}
                  </span>
                  {!isBlock && field.width === 'half' && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-dk-strong text-slate-600 dark:text-dk-text2 border border-slate-200/80 dark:border-dk-border shrink-0">
                      {t('forms.editorPage.properties.widthBadgeHalf')}
                    </span>
                  )}
                  {!isBlock && field.required && (
                    <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-900/60 px-2 py-0.5 rounded-md shrink-0">
                      {t('forms.required')}
                    </span>
                  )}
                  {!isBlock && field.role && (
                    <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-900/60 px-2 py-0.5 rounded-md shrink-0">
                      {field.role}
                    </span>
                  )}
                  {hasError && (
                    <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" aria-hidden="true" />
                  )}
                </button>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => onMoveField(idx, -1)}
                    className="p-1.5 text-slate-400 dark:text-dk-muted hover:text-slate-700 dark:hover:text-dk-text hover:bg-slate-100 dark:hover:bg-dk-strong disabled:opacity-30 rounded-lg transition"
                    title={t('forms.editorPage.moveUp')}
                    aria-label={t('forms.editorPage.moveUp')}
                  >
                    <HiOutlineArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === fields.length - 1}
                    onClick={() => onMoveField(idx, 1)}
                    className="p-1.5 text-slate-400 dark:text-dk-muted hover:text-slate-700 dark:hover:text-dk-text hover:bg-slate-100 dark:hover:bg-dk-strong disabled:opacity-30 rounded-lg transition"
                    title={t('forms.editorPage.moveDown')}
                    aria-label={t('forms.editorPage.moveDown')}
                  >
                    <HiOutlineArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDuplicateField(idx)}
                    className="p-1.5 text-slate-400 dark:text-dk-muted hover:text-slate-700 dark:hover:text-dk-text hover:bg-slate-100 dark:hover:bg-dk-strong rounded-lg transition"
                    title={t('forms.editorPage.fieldList.duplicate')}
                    aria-label={t('forms.editorPage.fieldList.duplicate')}
                  >
                    <HiOutlineDuplicate className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveField(idx)}
                    className="p-1.5 text-slate-400 dark:text-dk-muted hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"
                    title={t('forms.editorPage.removeField')}
                    aria-label={t('forms.editorPage.removeField')}
                  >
                    <HiOutlineTrash className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {selected && (
                <div className="px-4 pb-4 pt-3 border-t border-slate-100 dark:border-dk-border">
                  <FieldPropertiesPanel
                    field={field}
                    idx={idx}
                    errors={errors}
                    onUpdateField={onUpdateField}
                    onAddOption={onAddOption}
                    onUpdateOption={onUpdateOption}
                    onRemoveOption={onRemoveOption}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
