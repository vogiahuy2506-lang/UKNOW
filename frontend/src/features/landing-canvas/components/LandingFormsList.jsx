import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineChevronUp,
  HiOutlineChevronDown,
  HiOutlineExclamation,
  HiOutlineExternalLink,
  HiOutlineClipboardList,
  HiOutlineRefresh,
  HiOutlineX,
} from 'react-icons/hi';
import { fetchForms } from '../../forms/services/formAdminApi.service.js';
import {
  FORM_SLOT_KINDS,
  MAX_FORMS_PER_LANDING,
  addFormSlot,
  addPendingForm,
  buildFormRows,
  listFormBlocks,
  moveFormBlock,
  removeFormBlock,
  removePendingForm,
} from '../utils/landingFormLink.js';

/** Điền `{tham_số}` vào chuỗi i18n (`t` của panel là prop, test truyền bản không nhận tham số). */
function fmt(template, params = {}) {
  return String(template ?? '').replace(/\{(\w+)\}/g, (match, name) =>
    params[name] === undefined ? match : String(params[name])
  );
}

const KIND_BADGE_CLASS = {
  consult: 'bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300',
  booking: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300',
  payment: 'bg-purple-100 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300',
  survey: 'bg-indigo-100 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300',
  blank: 'bg-gray-100 dark:bg-dk-raised text-gray-700 dark:text-dk-text2',
};

/**
 * Danh sách BIỂU MẪU của landing (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-6) — thay "Form cơ bản / Dùng biểu mẫu đã tạo"
 * (chọn một trong hai) của PR-F: một trang có NHIỀU biểu mẫu (tư vấn + đặt lịch + thu tiền + khảo sát…, trần kỹ thuật 20).
 *
 * Mọi thao tác chỉ ghi vào state `form` (không gọi API cho tới khi bấm **Lưu trang**), xem landingFormLink.js:
 *   - bỏ / đổi thứ tự = sửa HTML (đổi chỗ / xoá khối nhúng hoặc chỗ trống); biểu mẫu + bài nộp KHÔNG bị xoá;
 *   - "Tạo mới theo mẫu" = chèn chỗ trống có loại vào HTML (backend tạo biểu mẫu đúng loại lúc lưu);
 *   - "Dùng biểu mẫu đã tạo" = thêm vào `form.linkedFormsPending` (lúc lưu gửi `linkedFormIds`).
 * Trang chưa lưu lần nào (`editingId` rỗng) thêm được biểu mẫu MỚI nhưng chưa chọn được biểu mẫu có sẵn — lưu trang trước.
 */
export default function LandingFormsList({ form, setForm, t, editingId = null }) {
  const tf = (key, params) => fmt(t(key), params);
  const canLink = Boolean(editingId);

  const rows = useMemo(
    () => buildFormRows({ html: form?.htmlContent, linkedForms: form?.linkedForms, pending: form?.linkedFormsPending }),
    [form?.htmlContent, form?.linkedForms, form?.linkedFormsPending]
  );
  const blockCount = rows.filter((r) => r.blockIndex != null).length;
  const limitReached = rows.length >= MAX_FORMS_PER_LANDING;

  const [addOpen, setAddOpen] = useState(false);
  const [formsList, setFormsList] = useState([]);
  const [formsLoading, setFormsLoading] = useState(false);
  const [formsLoadFailed, setFormsLoadFailed] = useState(false);
  const [pickedId, setPickedId] = useState('');

  const loadForms = useCallback(async () => {
    setFormsLoading(true);
    setFormsLoadFailed(false);
    try {
      const list = await fetchForms();
      setFormsList(Array.isArray(list) ? list : []);
    } catch {
      setFormsLoadFailed(true);
    } finally {
      setFormsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (addOpen && canLink) loadForms();
  }, [addOpen, canLink, loadForms]);

  // Biểu mẫu đã có trên trang (đã nhúng hoặc đang chờ gắn) không đưa vào danh sách chọn.
  const onPageKeys = new Set(rows.map((r) => r.publicKey).filter(Boolean));
  const onPageIds = new Set(rows.map((r) => r.formId).filter((v) => v != null).map(String));
  const pickerForms = formsList.filter((f) => !onPageKeys.has(f.publicKey) && !onPageIds.has(String(f.id)));

  const kindLabel = (kind) => t(`leadFormConfig.formKinds.${kind}`);

  const rowTitle = (row) => {
    if (row.source === 'new') {
      return row.valid
        ? tf('leadFormConfig.formNewTitle', { kind: kindLabel(row.kind) })
        : tf('leadFormConfig.formInvalidKindTitle', { kind: row.rawKind });
    }
    if (row.source === 'external') return t('leadFormConfig.formExternalTitle');
    return row.title || tf('leadFormConfig.linkedFallbackTitle', { id: row.formId });
  };

  // Mọi thay đổi HTML kiểm lại khối ở chỉ số đó vẫn là khối của dòng (HTML có thể vừa đổi do AI sửa trang).
  const blockStillMatches = (html, row) => {
    const block = listFormBlocks(html)[row.blockIndex];
    if (!block) return false;
    return row.source === 'new' ? block.type === 'slot' : block.type === 'embed' && block.key === row.publicKey;
  };

  const handleRemove = (row) => {
    if (row.source === 'pending') {
      setForm((prev) => ({ ...prev, linkedFormsPending: removePendingForm(prev.linkedFormsPending, row.formId) }));
      return;
    }
    setForm((prev) => {
      if (!blockStillMatches(prev.htmlContent, row)) return prev;
      return { ...prev, htmlContent: removeFormBlock(prev.htmlContent, row.blockIndex) };
    });
  };

  const handleMove = (row, direction) => {
    setForm((prev) => {
      if (!blockStillMatches(prev.htmlContent, row)) return prev;
      return { ...prev, htmlContent: moveFormBlock(prev.htmlContent, row.blockIndex, direction) };
    });
  };

  const handleAddNew = (kind) => {
    if (limitReached) return;
    setForm((prev) => ({ ...prev, htmlContent: addFormSlot(prev.htmlContent, kind) }));
  };

  const handleAddExisting = () => {
    if (limitReached || !pickedId) return;
    const picked = formsList.find((f) => String(f.id) === String(pickedId));
    if (!picked) return;
    setForm((prev) => ({ ...prev, linkedFormsPending: addPendingForm(prev.linkedFormsPending, picked) }));
    setPickedId('');
  };

  return (
    <section
      data-testid="landing-forms-list"
      className="rounded-2xl border border-indigo-100 dark:border-indigo-800 bg-gradient-to-br from-indigo-50/80 dark:from-indigo-950/40 via-purple-50/30 dark:via-purple-950/30 to-white dark:to-dk-surface p-4 sm:p-5 shadow-2xs space-y-3"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h4 className="text-[14px] font-bold text-gray-900 dark:text-dk-text">
            {t('leadFormConfig.formsTitle')}
            <span data-testid="forms-count" className="ml-2 text-[12px] font-normal text-gray-500 dark:text-dk-text2">
              ({rows.length})
            </span>
          </h4>
          <p className="mt-0.5 text-[12px] leading-relaxed text-gray-600 dark:text-dk-text2">
            {tf('leadFormConfig.formsDesc', { max: MAX_FORMS_PER_LANDING })}
          </p>
        </div>
        <button
          type="button"
          data-testid="add-form-toggle"
          aria-expanded={addOpen}
          onClick={() => setAddOpen((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/40 px-3 py-1.5 text-[13px] font-semibold text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-950/60 transition-colors shrink-0"
        >
          {addOpen ? <HiOutlineX className="h-4 w-4" /> : <HiOutlinePlus className="h-4 w-4" />}
          {addOpen ? t('leadFormConfig.formAddClose') : t('leadFormConfig.formAdd')}
        </button>
      </div>

      {rows.length === 0 ? (
        <p
          data-testid="forms-empty"
          className="rounded-lg border border-dashed border-gray-200 dark:border-dk-border bg-white/60 dark:bg-dk-raised/50 px-4 py-3 text-[13px] text-gray-500 dark:text-dk-text2"
        >
          {t('leadFormConfig.formsEmpty')}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const hasBlock = row.blockIndex != null;
            const title = rowTitle(row);
            return (
              <li
                key={row.id}
                data-testid="form-row"
                data-source={row.source}
                data-kind={row.kind || ''}
                className={`rounded-xl border bg-white dark:bg-dk-surface p-3 ${
                  row.needsPaymentSetup || (row.source === 'new' && !row.valid)
                    ? 'border-amber-300 dark:border-amber-700'
                    : 'border-gray-200 dark:border-dk-border'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 shrink-0">
                      <HiOutlineClipboardList className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-gray-900 dark:text-dk-text break-words">{title}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {row.source === 'new' && !row.valid ? null : (
                          <span
                            data-testid="form-kind-badge"
                            className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                              KIND_BADGE_CLASS[row.kind] || 'bg-gray-100 dark:bg-dk-raised text-gray-700 dark:text-dk-text2'
                            }`}
                          >
                            {row.kind ? kindLabel(row.kind) : t('leadFormConfig.formKindExisting')}
                          </span>
                        )}
                        {row.source === 'new' ? (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-950/40 text-orange-800 dark:text-orange-300">
                            {t('leadFormConfig.formBadgeNew')}
                          </span>
                        ) : null}
                        {row.source === 'pending' ? (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-950/40 text-orange-800 dark:text-orange-300">
                            {t('leadFormConfig.formBadgePending')}
                          </span>
                        ) : null}
                        {row.source === 'saved' && !row.isPublished ? (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300">
                            {t('leadFormConfig.linkedDraft')}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto">
                    {row.formId != null ? (
                      <a
                        href={`/app/forms/${row.formId}/edit`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${t('leadFormConfig.linkedOpenEdit')}: ${title}`}
                        title={t('leadFormConfig.linkedOpenEdit')}
                        className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg"
                      >
                        <HiOutlineExternalLink className="h-4 w-4" />
                      </a>
                    ) : null}
                    {hasBlock ? (
                      <>
                        <button
                          type="button"
                          aria-label={`${t('leadFormConfig.moveUp')}: ${title}`}
                          className="p-2 text-gray-400 dark:text-dk-muted hover:text-gray-700 dark:hover:text-dk-text hover:bg-gray-100 dark:hover:bg-dk-strong rounded-lg disabled:opacity-30"
                          disabled={row.blockIndex === 0}
                          onClick={() => handleMove(row, -1)}
                        >
                          <HiOutlineChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`${t('leadFormConfig.moveDown')}: ${title}`}
                          className="p-2 text-gray-400 dark:text-dk-muted hover:text-gray-700 dark:hover:text-dk-text hover:bg-gray-100 dark:hover:bg-dk-strong rounded-lg disabled:opacity-30"
                          disabled={row.blockIndex >= blockCount - 1}
                          onClick={() => handleMove(row, 1)}
                        >
                          <HiOutlineChevronDown className="h-4 w-4" />
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      aria-label={`${t('leadFormConfig.formRemove')}: ${title}`}
                      title={t('leadFormConfig.formRemove')}
                      className="p-2 text-red-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/60 rounded-lg"
                      onClick={() => handleRemove(row)}
                    >
                      <HiOutlineTrash className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {row.needsPaymentSetup ? (
                  <p
                    data-testid="needs-payment-setup"
                    className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-300"
                  >
                    <HiOutlineExclamation className="h-4 w-4 shrink-0 mt-px" />
                    <span>
                      {t('leadFormConfig.formNeedsPayment')}{' '}
                      <a
                        href={`/app/forms/${row.formId}/edit`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold underline"
                      >
                        {t('leadFormConfig.formOpenToFinish')}
                      </a>
                    </span>
                  </p>
                ) : null}
                {row.source === 'new' && !row.valid ? (
                  <p
                    data-testid="invalid-kind"
                    className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-300"
                  >
                    <HiOutlineExclamation className="h-4 w-4 shrink-0 mt-px" />
                    <span>{tf('leadFormConfig.formInvalidKind', { kind: row.rawKind })}</span>
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {limitReached ? (
        <p data-testid="forms-limit" className="text-[12px] font-medium text-amber-800 dark:text-amber-300">
          {tf('leadFormConfig.formLimit', { max: MAX_FORMS_PER_LANDING })}
        </p>
      ) : null}

      {addOpen ? (
        <div
          data-testid="add-form-panel"
          className="rounded-xl border border-gray-200 dark:border-dk-border bg-white dark:bg-dk-surface p-3 sm:p-4 space-y-4"
        >
          <div data-testid="add-existing" className="space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <label htmlFor="landing-forms-existing-select" className="text-[13px] font-semibold text-gray-800 dark:text-dk-text">
                {t('leadFormConfig.formAddExistingTitle')}
              </label>
              {canLink ? (
                <div className="flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    onClick={loadForms}
                    disabled={formsLoading}
                    className="inline-flex items-center gap-1 text-gray-500 dark:text-dk-text2 hover:text-indigo-600 dark:hover:text-indigo-400 transition disabled:opacity-50"
                  >
                    <HiOutlineRefresh className={`w-3.5 h-3.5 ${formsLoading ? 'animate-spin' : ''}`} />
                    <span>{t('leadFormConfig.pickerRefresh')}</span>
                  </button>
                  <a
                    href="/app/forms/new"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-semibold"
                  >
                    <span>{t('leadFormConfig.pickerCreate')}</span>
                    <HiOutlineExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ) : null}
            </div>
            {canLink ? (
              <>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    id="landing-forms-existing-select"
                    value={pickedId}
                    onChange={(e) => setPickedId(e.target.value)}
                    disabled={(formsLoading && formsList.length === 0) || limitReached}
                    className="w-full rounded-xl border border-gray-200 dark:border-dk-border bg-white dark:bg-dk-surface px-3 py-2 text-[13px] text-gray-800 dark:text-dk-text focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300 dark:focus:ring-indigo-700 disabled:bg-gray-50 dark:disabled:bg-dk-raised"
                  >
                    <option value="" disabled>
                      {formsLoading && formsList.length === 0
                        ? t('leadFormConfig.pickerLoading')
                        : pickerForms.length === 0
                        ? t('leadFormConfig.pickerNone')
                        : tf('leadFormConfig.pickerPlaceholderCount', { count: pickerForms.length })}
                    </option>
                    {pickerForms.map((f) => {
                      const baseTitle = f.title || tf('leadFormConfig.linkedFallbackTitle', { id: f.id });
                      let label = baseTitle;
                      if (f.adminDisabledAt) label = tf('leadFormConfig.optionAdminDisabled', { title: baseTitle });
                      else if (f.isPublished === false) label = tf('leadFormConfig.optionDraft', { title: baseTitle });
                      return (
                        <option key={f.id} value={String(f.id)} disabled={Boolean(f.adminDisabledAt)}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                  <button
                    type="button"
                    data-testid="add-existing-button"
                    onClick={handleAddExisting}
                    disabled={!pickedId || limitReached}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 text-[13px] font-semibold text-white transition-colors shrink-0"
                  >
                    <HiOutlinePlus className="h-4 w-4" />
                    {t('leadFormConfig.formAddExistingButton')}
                  </button>
                </div>
                {formsLoadFailed ? (
                  <p className="text-xs text-red-600 dark:text-red-400">{t('leadFormConfig.pickerLoadFailed')}</p>
                ) : null}
              </>
            ) : (
              <p data-testid="add-existing-need-save" className="text-[12px] text-gray-500 dark:text-dk-text2">
                {t('leadFormConfig.formAddExistingNeedSave')}
              </p>
            )}
          </div>

          <div data-testid="add-new" className="space-y-2">
            <p className="text-[13px] font-semibold text-gray-800 dark:text-dk-text">{t('leadFormConfig.formAddNewTitle')}</p>
            <p className="text-[12px] text-gray-500 dark:text-dk-text2">{t('leadFormConfig.formAddNewHint')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {FORM_SLOT_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  data-testid={`add-new-${kind}`}
                  disabled={limitReached}
                  onClick={() => handleAddNew(kind)}
                  className="text-left rounded-xl border border-gray-200 dark:border-dk-border bg-white dark:bg-dk-surface hover:border-orange-300 dark:hover:border-orange-700 hover:bg-orange-50/60 dark:hover:bg-orange-950/30 disabled:opacity-40 disabled:cursor-not-allowed p-3 transition-colors"
                >
                  <span className="block text-[13px] font-semibold text-gray-900 dark:text-dk-text">{kindLabel(kind)}</span>
                  <span className="mt-0.5 block text-[12px] leading-relaxed text-gray-500 dark:text-dk-text2">
                    {t(`leadFormConfig.formKindDescs.${kind}`)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <p className="text-[12px] leading-relaxed text-gray-500 dark:text-dk-text2">{t('leadFormConfig.formRemoveNote')}</p>
      <p className="text-xs text-indigo-900/80 dark:text-indigo-300 leading-relaxed">{t('leadFormConfig.linkedWhereNote')}</p>
    </section>
  );
}
