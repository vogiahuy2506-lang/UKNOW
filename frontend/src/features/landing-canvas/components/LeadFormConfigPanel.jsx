import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineChevronUp,
  HiOutlineChevronDown,
  HiOutlineChevronDown as HiOutlineExpand,
  HiOutlineExclamation,
  HiOutlineExternalLink,
  HiOutlineClipboardList,
  HiOutlineDocumentDuplicate,
  HiOutlineCheckCircle,
  HiOutlineEye,
  HiOutlineEyeOff,
} from 'react-icons/hi';
import { FounderLeadFormCard } from '../../landing/components/FounderLeadFormCard.jsx';
// Cùng nguồn chữ với form công khai (EmbedLeadFormPage) — không viết cứng lại: bản viết cứng trước
// đây thiếu firstName/lastName nên xem trước "Họ / Tên" ra ô không nhãn, và có câu "tuyệt đối" (NĐ 248).
import { LANDING_COPY } from '../../landing/constants/landingCopy.js';
import { editLandingHtmlWithAi } from '../../landing-pages/services/landingPagesAdminApi.service.js';
import { fetchForms } from '../../forms/services/formAdminApi.service.js';
import {
  CUSTOM_FIELD_TYPES,
  defaultLeadFormConfig,
  generateCustomFieldKey,
  nextUnusedOptionValue,
  normalizeLeadFormConfig,
} from '../../landing-pages/utils/landingLeadFormConfig.js';
import { buildAddCustomFieldInstruction, buildAddFixedFieldInstruction } from '../utils/leadFormFieldInstructions.js';
import {
  customFieldOptionValues,
  fixedFieldOptionValues,
  htmlHasFieldName,
  htmlHasFieldOptions,
} from '../utils/leadFormHtmlChecks.js';

const emptyCustomField = () => ({
  key: generateCustomFieldKey('field'),
  type: 'text',
  labelVi: '',
  labelEn: '',
  placeholderVi: '',
  placeholderEn: '',
  required: false,
  options: [{ value: 'opt_a', labelVi: 'Lựa chọn 1', labelEn: 'Option 1' }],
});

/**
 * Điền `{tham_số}` vào chuỗi i18n. `t` của panel là prop (test truyền bản không nhận tham số), nên tự
 * thay ở đây thay vì trông vào `t(key, params)`.
 */
function fmt(template, params = {}) {
  return String(template ?? '').replace(/\{(\w+)\}/g, (match, name) =>
    params[name] === undefined ? match : String(params[name])
  );
}

/**
 * PLAN_LEAD_FORM_TRUONG_THEM_2026-09-08.md PR-2d-3 việc 3: form.htmlContent có thật sự chứa
 * ô name="<khoá>" của trường này chưa — cảnh báo "trang chưa có ô này" + nút "Nhờ AI thêm ô
 * này". Sửa 09/09: thêm mức 2 — ô có nhưng mã lựa chọn không khớp cấu hình (sự cố slug-test,
 * xem leadFormHtmlChecks.js) → cảnh báo "không khớp mã" + nút "Nhờ AI sửa ô này". Cả hai KHÔNG
 * chặn lưu (chỉ cảnh báo).
 *
 * @returns {'missing'|'mismatch'|null}
 */
function fieldHtmlIssue(html, key, optionValues) {
  if (!htmlHasFieldName(html, key)) return 'missing';
  if (!htmlHasFieldOptions(html, key, optionValues)) return 'mismatch';
  return null;
}

/**
 * Cấu hình form thu khách của landing (PLAN_DON_GIAN_CAI_DAT_LANDING_VA_BIEU_MAU 03/10/2026):
 * "Form cơ bản" — Họ tên / Email / SĐT cố định + 2 ô tích Nghề nghiệp / Lĩnh vực + câu hỏi thêm (trường tuỳ
 * chỉnh); xem trước form thu vào nút, mặc định đóng.
 *
 * KHÔNG còn lựa chọn "Dùng biểu mẫu đã tạo" (gỡ 03/10/2026): `linkedFormId` là trường chỉ-đọc suy từ
 * `forms.landing_page_id` — editor không có đường lưu nó (landingPageAdmin.service.js: lúc lưu, chỗ trống
 * `data-founderai-form-slot` luôn dùng form đã gắn hoặc TẠO form mới từ leadFormConfig, bỏ qua biểu mẫu khách
 * chọn). Trang ĐÃ có biểu mẫu gắn (`linkedFormId`) vẫn hiện thông tin biểu mẫu đó, chỉ đọc.
 */
export default function LeadFormConfigPanel({ form, setForm, t, nameMode = 'split' }) {
  const config = normalizeLeadFormConfig(form.leadFormConfig || defaultLeadFormConfig());
  const persistedKeys = new Set(form.leadFormPersistedMeta?.keys || []);
  const persistedOptionValuesByKey = form.leadFormPersistedMeta?.optionValuesByKey || {};
  const fieldErrors = form.leadFormFieldErrors || {};
  const htmlContent = form.htmlContent || '';
  const hasHtml = Boolean(htmlContent.trim());
  const tf = (key, params) => fmt(t(key), params);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());
  // Khoá đang chờ AI thêm ô (Nhờ AI thêm ô này) — theo dõi riêng từng field để chỉ khoá đúng
  // nút đang gọi, không khoá cả panel.
  const [askingKeys, setAskingKeys] = useState(() => new Set());

  // Biểu mẫu (module Forms) đã gắn vào trang — chỉ để HIỂN THỊ tên / trạng thái / mã nhúng.
  const [formsList, setFormsList] = useState([]);

  // Danh sách biểu mẫu chỉ cần khi trang ĐÃ có biểu mẫu gắn (hiện 0/69 trang): trang khác không gọi API này.
  useEffect(() => {
    if (!form?.linkedFormId) return;
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') return;
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchForms();
        if (!cancelled && Array.isArray(list)) setFormsList(list);
      } catch {
        // chỉ là thông tin phụ: lỗi thì card vẫn hiện "Biểu mẫu #id"
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form?.linkedFormId]);

  const activeLinkedForm = formsList.find((f) => String(f.id) === String(form?.linkedFormId));

  const handleCopyEmbedCode = (target) => {
    if (!target || !target.publicKey) {
      toast.error(t('leadFormConfig.toastNoPublicKey'));
      return;
    }
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const embedHtml = `<div data-founderai-form="${target.publicKey}">\n  <iframe src="${origin}/f/${target.publicKey}?embed=1" style="width:100%;border:0;min-height:500px" title="${target.title}"></iframe>\n</div>\n<script src="${origin}/form-embed.js" defer></script>`;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(embedHtml);
      toast.success(t('leadFormConfig.toastEmbedCopied'));
    } else {
      toast.success(t('leadFormConfig.toastEmbedCreated'));
    }
  };

  const patch = (next) => {
    setForm((prev) => ({ ...prev, leadFormConfig: normalizeLeadFormConfig(next) }));
  };

  /**
   * PLAN_LEAD_FORM_TRUONG_THEM_2026-09-08.md PR-2d-3 việc 3: gọi đường sửa AI (editHtml, rule
   * 2b — việc 2) với câu lệnh dựng sẵn, cập nhật form.htmlContent khi thành công. Không chặn
   * lưu nếu lỗi — chỉ toast, admin tự thử lại hoặc tự sửa HTML.
   */
  const handleAskAiToAddField = async (key, instruction, optionValues = []) => {
    if (askingKeys.has(key)) return;
    setAskingKeys((prev) => new Set(prev).add(key));
    try {
      const result = await editLandingHtmlWithAi({
        currentHtml: htmlContent,
        instruction,
        locale: 'vi',
      });
      const nextHtml = result?.data?.html || result?.html;
      if (!nextHtml) {
        throw new Error(result?.message || t('leadFormConfig.aiNoHtml'));
      }
      setForm((prev) => ({ ...prev, htmlContent: nextHtml }));
      // Vẫn nhận HTML (admin có Hoàn tác) nhưng báo đúng sự thật: AI có thể thêm ô mà ghi sai mã
      // lựa chọn — khi đó cảnh báo "không khớp mã" sẽ còn nguyên trên panel.
      const issue = fieldHtmlIssue(nextHtml, key, optionValues);
      if (issue === 'missing') {
        toast.error(t('leadFormConfig.aiStillMissing'));
      } else if (issue === 'mismatch') {
        toast.error(t('leadFormConfig.aiMismatch'));
      } else {
        toast.success(t('leadFormConfig.aiAdded'));
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || t('leadFormConfig.aiFailed'));
    } finally {
      setAskingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const setFixedVisible = (field, visible) => {
    patch({
      ...config,
      fixedFields: {
        ...config.fixedFields,
        [field]: { visible },
      },
    });
  };

  const updateField = (index, partial) => {
    const customFields = config.customFields.map((f, i) => (i === index ? { ...f, ...partial } : f));
    const nextConfig = normalizeLeadFormConfig({ ...config, customFields });
    setForm((prev) => {
      const next = { ...prev, leadFormConfig: nextConfig };
      const key = config.customFields[index]?.key;
      if (key && Object.prototype.hasOwnProperty.call(partial, 'labelVi')) {
        const nextErrors = { ...(prev.leadFormFieldErrors || {}) };
        delete nextErrors[key];
        next.leadFormFieldErrors = nextErrors;
      }
      return next;
    });
  };

  const moveField = (index, dir) => {
    const next = [...config.customFields];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    patch({ ...config, customFields: next });
  };

  const removeField = (index) => {
    patch({ ...config, customFields: config.customFields.filter((_, i) => i !== index) });
  };

  const toggleExpand = (key) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const previewForm = {
    fullName: '',
    email: '',
    phone: '',
    occupation: '',
    interestArea: '',
    marketingConsent: true,
    customFields: {},
  };

  const fixedFieldRows = [
    { key: 'occupation', label: t('leadFormConfig.occupationLabel'), visible: config.fixedFields.occupation.visible },
    { key: 'interestArea', label: t('leadFormConfig.interestLabel'), visible: config.fixedFields.interestArea.visible },
  ];

  return (
    <div className="space-y-5">
      {/* Biểu mẫu (module Forms) ĐÃ gắn vào trang — CHỈ ĐỌC (xem chú thích đầu component) */}
      {form?.linkedFormId ? (
        <div
          data-testid="linked-form-readonly"
          className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/90 to-indigo-50/40 p-5 space-y-4 shadow-2xs"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-blue-100 text-blue-700 shrink-0 mt-0.5 shadow-2xs">
                <HiOutlineClipboardList className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-bold text-blue-950">{t('leadFormConfig.linkedTitle')}</h4>
                  <span className="text-[11px] font-semibold bg-blue-200/80 text-blue-800 px-2.5 py-0.5 rounded-full">
                    #{form.linkedFormId}
                  </span>
                  {activeLinkedForm?.isPublished !== undefined && (
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        activeLinkedForm.isPublished
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {activeLinkedForm.isPublished
                        ? t('leadFormConfig.linkedPublished')
                        : t('leadFormConfig.linkedDraft')}
                    </span>
                  )}
                </div>
                <p className="text-xs font-medium text-blue-900">
                  {activeLinkedForm?.fields?.length
                    ? tf('leadFormConfig.linkedTitleWithFields', {
                        title:
                          activeLinkedForm?.title ||
                          tf('leadFormConfig.linkedFallbackTitle', { id: form.linkedFormId }),
                        count: activeLinkedForm.fields.length,
                      })
                    : activeLinkedForm?.title || tf('leadFormConfig.linkedFallbackTitle', { id: form.linkedFormId })}
                </p>
                <p className="text-xs text-blue-800/80 leading-relaxed">{t('leadFormConfig.linkedDesc')}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto flex-wrap">
              <a
                href={`/app/forms/${form.linkedFormId}/edit`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition"
              >
                <span>{t('leadFormConfig.linkedOpenEdit')}</span>
                <HiOutlineExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Trạng thái vị trí hiển thị trong HTML (chỉ báo, không có nút ghi) */}
          <div className="pt-3 border-t border-blue-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            {htmlContent.includes('data-founderai-form-slot') || htmlContent.includes('data-founderai-form') ? (
              <div className="flex items-center gap-1.5 text-emerald-700 font-medium">
                <HiOutlineCheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{t('leadFormConfig.slotOk')}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-amber-800 bg-amber-50/90 border border-amber-200 px-3 py-1.5 rounded-lg flex-1">
                <span className="font-medium">⚠️ {t('leadFormConfig.slotMissing')}</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => handleCopyEmbedCode(activeLinkedForm)}
              className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900 font-medium self-end sm:self-auto py-1"
            >
              <HiOutlineDocumentDuplicate className="w-3.5 h-3.5" />
              <span>{t('leadFormConfig.copyEmbed')}</span>
            </button>
          </div>
        </div>
      ) : null}

      <p className="text-[13px] text-gray-500 leading-relaxed">{t('leadFormConfig.help')}</p>

      {/* Fixed fields toggle — inline card */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <p className="text-[14px] font-semibold text-gray-900 mb-1">{t('leadFormConfig.fixedFieldsTitle')}</p>
        <p className="text-[12px] text-gray-500">{t('leadFormConfig.fixedFieldsAlways')}</p>
        <p className="text-[12px] text-gray-500 mb-3">{t('leadFormConfig.fixedFieldsHint')}</p>
        <div className="flex flex-wrap gap-2">
          <InlineChip
            checked={config.fixedFields.occupation.visible}
            onChange={(v) => setFixedVisible('occupation', v)}
            label={t('leadFormConfig.showOccupation')}
          />
          <InlineChip
            checked={config.fixedFields.interestArea.visible}
            onChange={(v) => setFixedVisible('interestArea', v)}
            label={t('leadFormConfig.showInterest')}
          />
        </div>
        {fixedFieldRows.map(({ key, label, visible }) => {
          if (!hasHtml || !visible) return null;
          const optionValues = fixedFieldOptionValues(key);
          const issue = fieldHtmlIssue(htmlContent, key, optionValues);
          if (!issue) return null;
          return (
            <MissingFieldWarning
              key={key}
              fieldLabel={label}
              issue={issue}
              asking={askingKeys.has(key)}
              onAskAi={() => handleAskAiToAddField(key, buildAddFixedFieldInstruction(key), optionValues)}
              t={t}
            />
          );
        })}
      </section>

      {/* Custom fields card — danh sách chỉ hiện khi có câu hỏi thêm */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between mb-3 gap-3">
          <div>
            <p className="text-[14px] font-semibold text-gray-900">
              {t('leadFormConfig.customFields')}
              <span className="ml-2 text-[12px] font-normal text-gray-500">
                ({config.customFields.length}/20)
              </span>
            </p>
            <p className="text-[12px] text-gray-500 mt-0.5">{t('leadFormConfig.customFieldsHint')}</p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-orange-300 bg-orange-50 px-3 py-1.5 text-[13px] font-semibold text-orange-700 hover:bg-orange-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            onClick={() => {
              if (config.customFields.length >= 20) return;
              const next = [...config.customFields, emptyCustomField()];
              patch({ ...config, customFields: next });
              // auto-expand field mới để user điền label ngay
              setExpanded((prev) => new Set(prev).add(next[next.length - 1].key));
            }}
            disabled={config.customFields.length >= 20}
          >
            <HiOutlinePlus className="h-4 w-4" />
            {t('leadFormConfig.addField')}
          </button>
        </div>

        {config.customFields.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 px-4 py-3 text-[13px] text-gray-500">
            {t('leadFormConfig.customFieldsEmpty')}
          </p>
        ) : (
          <div className="space-y-2">
            {config.customFields.map((field, index) => {
              const isPersisted = persistedKeys.has(field.key);
              const persistedOptionValues = new Set(persistedOptionValuesByKey[field.key] || []);
              const labelError = fieldErrors[field.key];
              const isExpanded = expanded.has(field.key);
              return (
                <CustomFieldRow
                  key={field.key}
                  index={index}
                  field={field}
                  isPersisted={isPersisted}
                  persistedOptionValues={persistedOptionValues}
                  persistedOptionValuesByKey={persistedOptionValuesByKey}
                  labelError={labelError}
                  isExpanded={isExpanded}
                  onToggleExpand={() => toggleExpand(field.key)}
                  onUpdate={(partial) => updateField(index, partial)}
                  onMoveUp={() => moveField(index, -1)}
                  onMoveDown={() => moveField(index, 1)}
                  onRemove={() => removeField(index)}
                  t={t}
                  htmlIssue={hasHtml ? fieldHtmlIssue(htmlContent, field.key, customFieldOptionValues(field)) : null}
                  asking={askingKeys.has(field.key)}
                  onAskAiToAdd={() =>
                    handleAskAiToAddField(field.key, buildAddCustomFieldInstruction(field), customFieldOptionValues(field))
                  }
                />
              );
            })}
          </div>
        )}
      </section>

      {/* Xem trước form — thu vào nút, mặc định đóng */}
      <div>
        <button
          type="button"
          aria-expanded={previewOpen}
          onClick={() => setPreviewOpen((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          {previewOpen ? <HiOutlineEyeOff className="h-4 w-4" /> : <HiOutlineEye className="h-4 w-4" />}
          {previewOpen ? t('leadFormConfig.previewHide') : t('leadFormConfig.previewShow')}
        </button>
        {previewOpen ? (
          <section className="mt-3 rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60">
              <p className="text-[12px] text-gray-500">{t('leadFormConfig.previewHint')}</p>
            </div>
            <div className="px-5 py-5 bg-gray-50/40 max-h-[520px] overflow-auto">
              <FounderLeadFormCard
                variant="embed"
                locale="vi"
                theme={config.theme}
                nameMode={nameMode}
                formCopy={LANDING_COPY.vi.form}
                form={previewForm}
                setField={() => {}}
                submitting={false}
                error=""
                success={false}
                onSubmit={(e) => e?.preventDefault?.()}
                leadFormConfig={config}
                previewMode
              />
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

/* ─────────────── Cảnh báo thiếu ô trong HTML + nút nhờ AI thêm ─────────────── */

/**
 * PLAN_LEAD_FORM_TRUONG_THEM_2026-09-08.md PR-2d-3 việc 3: hiện khi form.htmlContent
 * chưa có ô này (theo name="<khoá>") dù cấu hình yêu cầu, hoặc (09/09) có ô nhưng mã lựa chọn
 * không khớp cấu hình. KHÔNG chặn lưu — chỉ cảnh báo + nút gọi đường sửa AI (editHtml rule 2b,
 * việc 2). Cùng một câu lệnh cho cả hai: câu lệnh đã dặn THAY ô cũ nếu trang có sẵn.
 *
 * @param {{ fieldLabel: string, issue?: 'missing'|'mismatch', asking: boolean, onAskAi: () => void, t: (key: string) => string }} props
 */
function MissingFieldWarning({ fieldLabel, issue = 'missing', asking, onAskAi, t }) {
  const isMismatch = issue === 'mismatch';
  return (
    <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[12px] text-amber-800">
        <HiOutlineExclamation className="h-4 w-4 flex-shrink-0" />
        <span>{fmt(t(isMismatch ? 'leadFormConfig.mismatchField' : 'leadFormConfig.missingField'), { label: fieldLabel })}</span>
      </div>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[12px] font-semibold text-amber-800 hover:bg-amber-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={onAskAi}
        disabled={asking}
      >
        {asking ? t('leadFormConfig.askingAi') : isMismatch ? t('leadFormConfig.askAiFix') : t('leadFormConfig.askAiAdd')}
      </button>
    </div>
  );
}

/* ───────────────── Inline chip toggle ───────────────── */

function InlineChip({ checked, onChange, label }) {
  return (
    <label
      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] cursor-pointer select-none transition-colors ${
        checked
          ? 'bg-orange-50 border-orange-300 text-orange-700'
          : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-gray-300 text-orange-600 focus:ring-orange-500 w-4 h-4"
      />
      {label}
    </label>
  );
}

/* ───────────────── Custom field row (inline card) ───────────────── */

function CustomFieldRow({
  index,
  field,
  isPersisted,
  persistedOptionValues,
  persistedOptionValuesByKey,
  labelError,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onMoveUp,
  onMoveDown,
  onRemove,
  t,
  htmlIssue,
  asking,
  onAskAiToAdd,
}) {
  const summary = String(field.labelVi || '').trim() || (
    <span className="italic text-gray-400">{t('leadFormConfig.noLabel')}</span>
  );
  return (
    <div
      className={`rounded-lg border bg-white transition-colors ${
        labelError ? 'border-red-300' : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      {/* Inline row */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggleExpand}
          className={`p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          title={isExpanded ? t('leadFormConfig.collapse') : t('leadFormConfig.expand')}
        >
          <HiOutlineExpand className="h-4 w-4" />
        </button>

        <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto_auto_auto] items-center gap-3">
          <div className="min-w-0">
            <span className="text-[14px] text-gray-900 truncate block">{summary}</span>
            <code className="text-[11px] text-gray-400 truncate block">{field.key}</code>
          </div>

          <select
            className="rounded-md border border-gray-200 px-2 py-1 text-[12px] disabled:bg-gray-100 disabled:text-gray-500"
            value={field.type}
            disabled={isPersisted}
            title={isPersisted ? t('leadFormConfig.typeLocked') : undefined}
            onChange={(e) => {
              const type = e.target.value;
              const options =
                type === 'select' || type === 'radio'
                  ? field.options?.length
                    ? field.options
                    : [{ value: 'opt_a', labelVi: 'Lựa chọn 1', labelEn: 'Option 1' }]
                  : [];
              onUpdate({ type, options });
            }}
          >
            {CUSTOM_FIELD_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`leadFormConfig.types.${type}`)}
              </option>
            ))}
          </select>

          <label
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] cursor-pointer border transition-colors ${
              field.required
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            <input
              type="checkbox"
              checked={Boolean(field.required)}
              onChange={(e) => onUpdate({ required: e.target.checked })}
              className="w-3.5 h-3.5"
            />
            {t('leadFormConfig.required')}
          </label>

          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={t('leadFormConfig.moveUp')}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-30"
              onClick={onMoveUp}
              disabled={index === 0}
            >
              <HiOutlineChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={t('leadFormConfig.moveDown')}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-30"
              onClick={onMoveDown}
            >
              <HiOutlineChevronDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={t('leadFormConfig.removeField')}
              className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
              onClick={onRemove}
            >
              <HiOutlineTrash className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {htmlIssue ? (
        <div className="px-3 pb-2">
          <MissingFieldWarning
            fieldLabel={String(field.labelVi || '').trim() || field.key}
            issue={htmlIssue}
            asking={asking}
            onAskAi={onAskAiToAdd}
            t={t}
          />
        </div>
      ) : null}

      {/* Expanded editor */}
      {isExpanded ? (
        <div className="border-t border-gray-100 px-3 py-2.5 space-y-2 bg-gray-50/40">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <input
                className={`w-full rounded border px-3 py-2 text-[13px] ${labelError ? 'border-red-400' : 'border-gray-300'}`}
                placeholder={t('leadFormConfig.labelVi')}
                value={field.labelVi}
                onChange={(e) => onUpdate({ labelVi: e.target.value })}
              />
              {labelError ? <p className="mt-1 text-[12px] text-red-600">{labelError}</p> : null}
            </div>
            <input
              className="rounded border border-gray-300 px-3 py-2 text-[13px]"
              placeholder={t('leadFormConfig.labelEn')}
              value={field.labelEn || ''}
              onChange={(e) => onUpdate({ labelEn: e.target.value })}
            />
          </div>

          {field.type === 'text' || field.type === 'textarea' ? (
            <div className="grid grid-cols-2 gap-3">
              <input
                className="rounded border border-gray-300 px-3 py-2 text-[13px]"
                placeholder={t('leadFormConfig.placeholderVi')}
                value={field.placeholderVi || ''}
                onChange={(e) => onUpdate({ placeholderVi: e.target.value })}
              />
              <input
                className="rounded border border-gray-300 px-3 py-2 text-[13px]"
                placeholder={t('leadFormConfig.placeholderEn')}
                value={field.placeholderEn || ''}
                onChange={(e) => onUpdate({ placeholderEn: e.target.value })}
              />
            </div>
          ) : null}

          {field.type === 'select' || field.type === 'radio' ? (
            <div className="space-y-1.5">
              {(field.options || []).map((opt, oi) => {
                const valueLocked = persistedOptionValues.has(opt.value);
                return (
                  <div key={`${field.key}-${oi}`} className="flex gap-2">
                    <input
                      className="w-28 rounded border border-gray-300 px-2.5 py-1.5 text-[12px] disabled:bg-gray-100 disabled:text-gray-500"
                      placeholder="value"
                      value={opt.value}
                      disabled={valueLocked}
                      title={valueLocked ? t('leadFormConfig.optionValueLocked') : undefined}
                      onChange={(e) => {
                        const options = [...(field.options || [])];
                        options[oi] = { ...opt, value: e.target.value };
                        onUpdate({ options });
                      }}
                    />
                    <input
                      className="flex-1 rounded border border-gray-300 px-2.5 py-1.5 text-[12px]"
                      placeholder="VI"
                      value={opt.labelVi}
                      onChange={(e) => {
                        const options = [...(field.options || [])];
                        options[oi] = { ...opt, labelVi: e.target.value };
                        onUpdate({ options });
                      }}
                    />
                    <input
                      className="flex-1 rounded border border-gray-300 px-2.5 py-1.5 text-[12px]"
                      placeholder="EN"
                      value={opt.labelEn || ''}
                      onChange={(e) => {
                        const options = [...(field.options || [])];
                        options[oi] = { ...opt, labelEn: e.target.value };
                        onUpdate({ options });
                      }}
                    />
                    <button
                      type="button"
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-30"
                      disabled={(field.options || []).length <= 1}
                      title={t('leadFormConfig.removeOption')}
                      onClick={() => {
                        const options = (field.options || []).filter((_, i) => i !== oi);
                        onUpdate({ options });
                      }}
                    >
                      <HiOutlineTrash className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                className="text-[12px] font-medium text-orange-700 hover:underline"
                onClick={() =>
                  onUpdate({
                    options: [
                      ...(field.options || []),
                      {
                        value: nextUnusedOptionValue(field.options, persistedOptionValuesByKey[field.key]),
                        labelVi: '',
                        labelEn: '',
                      },
                    ],
                  })
                }
              >
                + {t('leadFormConfig.addOption')}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
