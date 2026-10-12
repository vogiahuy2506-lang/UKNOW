import { HiOutlinePlus, HiOutlineTrash, HiOutlineExclamation } from 'react-icons/hi';
import { useI18n } from '../../../../i18n';
import { isDisplayFieldType, RATING_MAX } from '../../utils/formFieldTypes.util';
import {
  MAX_SHOW_IF_CONDITIONS,
  checkShowIfCondition,
  getShowIfOperatorsForType,
  isShowIfSourceType,
  showIfOperatorNeedsValue,
} from '../../utils/formShowIf.util';

const selectBase =
  'w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border text-xs font-medium text-slate-900 dark:text-dk-text focus:outline-none focus:ring-2 transition shadow-2xs';
const selectOk = 'border-gray-200 dark:border-dk-border focus:border-orange-500 focus:ring-orange-500/20';
const selectErr = 'border-red-300 dark:border-red-500/60 focus:ring-red-100 dark:focus:ring-red-950/30';

const sourceValueOf = (field) => (field.key ? `k:${field.key}` : `u:${field.uid}`);

/** Giá trị mặc định của điều kiện mới / vừa đổi nguồn hoặc toán tử (luôn hợp lệ nếu có thể, để dòng mới sinh ra là đủ). */
function defaultValueFor(source, operator) {
  if (!showIfOperatorNeedsValue(operator)) return '';
  if (source.type === 'yes_no') return 'yes';
  if (source.type === 'rating') return String(RATING_MAX);
  if (source.type === 'number') return '';
  return (source.options || []).find((o) => String(o ?? '').trim() !== '') ?? '';
}

/**
 * Mục "Điều kiện hiển thị" trong bảng thuộc tính của một trường (PR-8a): chỉ hiện ô này khi các câu hỏi PHÍA TRÊN được trả lời
 * theo cách chủ chọn. Nguồn chỉ là ô nhập đứng trước (không tính ô tải tệp / khối bố cục); toán tử và giá trị đổi theo loại nguồn.
 *
 * Trạng thái ở trường: `showIf = { match: 'all'|'any', conditions: [{ fieldKey, operator, value }] } | null` (`value` là chuỗi).
 * Chọn một nguồn chưa có `key` (trường mới) thì xin trang cấp key ngay (`onEnsureFieldKey`) — điều kiện tham chiếu bằng key và key
 * gửi lên cùng trường.
 */
export default function FieldShowIfEditor({ field, idx, fields, issues, onUpdateField, onEnsureFieldKey }) {
  const { t } = useI18n();
  const idPrefix = `showif-${field.uid}`;
  const conditions = Array.isArray(field.showIf?.conditions) ? field.showIf.conditions : [];
  const match = field.showIf?.match === 'any' ? 'any' : 'all';
  const sources = fields.slice(0, idx).filter((f) => !isDisplayFieldType(f.type) && isShowIfSourceType(f.type));
  const sourceByKey = new Map(sources.filter((f) => f.key).map((f) => [f.key, f]));
  const sourceLabel = (f) => f.label?.trim() || t('forms.editorPage.showIf.untitledField');

  const setShowIf = (nextConditions, nextMatch = match) => {
    onUpdateField(idx, 'showIf', nextConditions.length > 0 ? { match: nextMatch, conditions: nextConditions } : null);
  };
  const updateCondition = (condIdx, patch) => {
    setShowIf(conditions.map((c, i) => (i === condIdx ? { ...c, ...patch } : c)));
  };

  const buildConditionFor = (source) => {
    const key = source.key || onEnsureFieldKey(source.uid);
    const operator = getShowIfOperatorsForType(source.type)[0];
    return { fieldKey: key, operator, value: defaultValueFor(source, operator) };
  };

  const handleAdd = () => {
    if (sources.length === 0 || conditions.length >= MAX_SHOW_IF_CONDITIONS) return;
    // Nguồn mặc định: câu hỏi đứng liền trước ô này (hay gặp nhất: "Có xe không?" rồi "Biển số xe").
    setShowIf([...conditions, buildConditionFor(sources[sources.length - 1])]);
  };

  const handlePickSource = (condIdx, raw) => {
    const source = sources.find((f) => sourceValueOf(f) === raw);
    if (!source) return;
    updateCondition(condIdx, buildConditionFor(source));
  };

  // Đổi toán tử: giữ giá trị đang chọn nếu còn hợp lệ với toán tử mới (đổi "là" ↔ "không phải là" không mất lựa chọn), không thì lấy mặc định.
  const handlePickOperator = (condIdx, source, condition, operator) => {
    if (!showIfOperatorNeedsValue(operator)) {
      updateCondition(condIdx, { operator, value: '' });
      return;
    }
    const keep = checkShowIfCondition(source, operator, condition.value).ok;
    updateCondition(condIdx, { operator, value: keep ? condition.value : defaultValueFor(source, operator) });
  };

  const renderValueControl = (condition, condIdx, source, invalid) => {
    if (!source || !showIfOperatorNeedsValue(condition.operator)) return null;
    const controlId = `${idPrefix}-value-${condIdx}`;
    const className = `${selectBase} ${invalid ? selectErr : selectOk}`;
    const common = {
      id: controlId,
      'aria-label': t('forms.editorPage.showIf.valueLabel'),
      value: condition.value ?? '',
      onChange: (e) => updateCondition(condIdx, { value: e.target.value }),
      className,
    };
    if (source.type === 'number') {
      return <input {...common} type="number" inputMode="decimal" step="any" placeholder={t('forms.editorPage.showIf.numberPlaceholder')} />;
    }
    let options = [];
    if (source.type === 'yes_no') {
      options = [
        { value: 'yes', label: t('forms.answerValue.yes') },
        { value: 'no', label: t('forms.answerValue.no') },
      ];
    } else if (source.type === 'rating') {
      options = Array.from({ length: RATING_MAX }, (_, i) => ({ value: String(i + 1), label: t('forms.editorPage.showIf.starCount', { count: i + 1 }) }));
    } else {
      options = (source.options || [])
        .filter((o) => String(o ?? '').trim() !== '')
        .map((o) => ({ value: o, label: o }));
    }
    const hasCurrent = options.some((o) => o.value === condition.value);
    return (
      <select {...common}>
        {/* Giá trị đã chọn không còn trong danh sách (lựa chọn bị xoá) hoặc chưa chọn: dòng trống để không tự nhận nhầm lựa chọn đầu */}
        {!hasCurrent && <option value={condition.value ?? ''}>{condition.value ? String(condition.value) : '—'}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  };

  return (
    <div className="pt-3 border-t border-gray-200/80 dark:border-dk-border space-y-3" data-testid="field-showif-editor">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-xs font-semibold text-gray-700 dark:text-dk-text">{t('forms.editorPage.showIf.title')}</span>
          <p className="text-[11px] text-gray-500 dark:text-dk-text2 mt-0.5">{t('forms.editorPage.showIf.hint')}</p>
        </div>
        {conditions.length > 0 && (
          <button
            type="button"
            onClick={() => onUpdateField(idx, 'showIf', null)}
            className="shrink-0 text-xs font-semibold text-gray-500 dark:text-dk-text2 hover:text-rose-600 dark:hover:text-rose-400 px-2 py-1 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
          >
            {t('forms.editorPage.showIf.clear')}
          </button>
        )}
      </div>

      {conditions.length > 0 && ['name', 'email', 'phone'].includes(field.role) && (
        // Review PR-8a 12/10: ô mang vai trò định danh mà bị ẩn thì bài nộp thiếu tên/email/SĐT người nộp — chỉ cảnh báo, không chặn
        // (vd hợp lệ: chỉ hiện ô Email khi khách chọn nhận tin qua email).
        <p className="text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl p-2.5" data-testid="showif-role-warning">
          {t('forms.editorPage.showIf.roleWarning')}
        </p>
      )}

      {conditions.length === 0 && sources.length === 0 && (
        <p className="text-[11px] text-gray-500 dark:text-dk-text2 bg-gray-50 dark:bg-dk-inset rounded-xl p-2.5" data-testid="showif-no-source">
          {t('forms.editorPage.showIf.noSource')}
        </p>
      )}

      {conditions.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`${idPrefix}-match`} className="text-xs font-semibold text-gray-700 dark:text-dk-text">
            {t('forms.editorPage.showIf.matchLabel')}
          </label>
          <select
            id={`${idPrefix}-match`}
            value={match}
            onChange={(e) => setShowIf(conditions, e.target.value === 'any' ? 'any' : 'all')}
            className={`${selectBase} ${selectOk} w-auto`}
          >
            <option value="all">{t('forms.editorPage.showIf.matchAll')}</option>
            <option value="any">{t('forms.editorPage.showIf.matchAny')}</option>
          </select>
        </div>
      )}

      <div className="space-y-2">
        {conditions.map((condition, condIdx) => {
          const source = sourceByKey.get(condition.fieldKey) || null;
          const rowIssues = issues.filter((issue) => issue.conditionIndex === condIdx);
          const broken = rowIssues.length > 0;
          const operators = source ? getShowIfOperatorsForType(source.type) : [];
          const operatorValue = operators.includes(condition.operator) ? condition.operator : '';
          const sourceSelectValue = source ? sourceValueOf(source) : `k:${condition.fieldKey || ''}`;
          return (
            <div
              key={condIdx}
              data-testid={`showif-row-${condIdx}`}
              className={`rounded-xl border p-2.5 space-y-2 ${
                broken ? 'border-amber-300 dark:border-amber-500/50 bg-amber-50/60 dark:bg-amber-950/20' : 'border-gray-200 dark:border-dk-border bg-gray-50/60 dark:bg-dk-inset'
              }`}
            >
              <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
                <select
                  aria-label={t('forms.editorPage.showIf.sourceLabel')}
                  value={sourceSelectValue}
                  onChange={(e) => handlePickSource(condIdx, e.target.value)}
                  className={`${selectBase} ${broken && !source ? selectErr : selectOk}`}
                >
                  {!source && (
                    <option value={sourceSelectValue}>{t('forms.editorPage.showIf.missingSource')}</option>
                  )}
                  {sources.map((f) => (
                    <option key={f.uid} value={sourceValueOf(f)}>
                      {sourceLabel(f)}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={t('forms.editorPage.showIf.operatorLabel')}
                  value={operatorValue}
                  disabled={!source}
                  onChange={(e) => handlePickOperator(condIdx, source, condition, e.target.value)}
                  className={`${selectBase} ${selectOk}`}
                >
                  {operatorValue === '' && <option value="">—</option>}
                  {operators.map((op) => (
                    <option key={op} value={op}>
                      {t(`forms.editorPage.showIf.operator.${op}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  {renderValueControl(condition, condIdx, source, rowIssues.some((i) => i.reason === 'value'))}
                </div>
                <button
                  type="button"
                  onClick={() => setShowIf(conditions.filter((_, i) => i !== condIdx))}
                  className="shrink-0 p-1.5 text-gray-400 dark:text-dk-muted hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"
                  title={t('forms.editorPage.showIf.remove')}
                  aria-label={t('forms.editorPage.showIf.remove')}
                >
                  <HiOutlineTrash className="w-3.5 h-3.5" />
                </button>
              </div>
              {broken && (
                <p className="flex items-start gap-1.5 text-[11px] text-amber-800 dark:text-amber-300" role="alert" data-testid={`showif-issue-${condIdx}`}>
                  <HiOutlineExclamation className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
                  <span>
                    {t(`forms.editorPage.showIf.issue.${rowIssues[0].reason}`)} {t('forms.editorPage.showIf.issue.fixHint')}
                  </span>
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleAdd}
          disabled={sources.length === 0 || conditions.length >= MAX_SHOW_IF_CONDITIONS}
          className="inline-flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 font-semibold px-2 py-1 rounded-md hover:bg-orange-50 dark:hover:bg-orange-950/40 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          <HiOutlinePlus className="w-3.5 h-3.5" />
          {conditions.length === 0 ? t('forms.editorPage.showIf.add') : t('forms.editorPage.showIf.addAnother')}
        </button>
        {conditions.length >= MAX_SHOW_IF_CONDITIONS && (
          <span className="text-[11px] text-gray-500 dark:text-dk-text2">{t('forms.editorPage.showIf.maxReached', { max: MAX_SHOW_IF_CONDITIONS })}</span>
        )}
      </div>
    </div>
  );
}
