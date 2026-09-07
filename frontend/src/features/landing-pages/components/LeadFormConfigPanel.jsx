import { useState } from 'react';
import {
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineChevronUp,
  HiOutlineChevronDown,
  HiOutlineChevronDown as HiOutlineExpand,
} from 'react-icons/hi';
import { FounderLeadFormCard } from '../../landing/components/FounderLeadFormCard.jsx';
import {
  CUSTOM_FIELD_TYPES,
  defaultLeadFormConfig,
  generateCustomFieldKey,
  nextUnusedOptionValue,
  normalizeLeadFormConfig,
} from '../utils/landingLeadFormConfig.js';

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
 * Cấu hình field form lead — Phase 6+ UI gọn:
 *  - Toggle occupation/interest dạng inline-card.
 *  - Custom fields dạng **inline-card** mặc định (1 hàng ngang), bấm caret để mở rộng.
 *  - Xem trước form ở cuối (nameMode đến từ LeadFormSettingsPanel).
 */
export default function LeadFormConfigPanel({ form, setForm, t, nameMode = 'split' }) {
  const config = normalizeLeadFormConfig(form.leadFormConfig || defaultLeadFormConfig());
  const persistedKeys = new Set(form.leadFormPersistedMeta?.keys || []);
  const persistedOptionValuesByKey = form.leadFormPersistedMeta?.optionValuesByKey || {};
  const fieldErrors = form.leadFormFieldErrors || {};

  const [expanded, setExpanded] = useState(() => new Set());

  const patch = (next) => {
    setForm((prev) => ({ ...prev, leadFormConfig: normalizeLeadFormConfig(next) }));
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

  return (
    <div className="space-y-6">
      <p className="text-[13px] text-gray-500 leading-relaxed">
        {t('leadFormConfig.help')}
      </p>

      {/* Fixed fields toggle — inline card */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <p className="text-[14px] font-semibold text-gray-900 mb-1">Các trường mặc định</p>
        <p className="text-[12px] text-gray-500 mb-3">
          Bật/tắt các trường bạn muốn hiển thị trên form.
        </p>
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
      </section>

      {/* Custom fields card */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[14px] font-semibold text-gray-900">
              {t('leadFormConfig.customFields')}
              <span className="ml-2 text-[12px] font-normal text-gray-500">
                ({config.customFields.length}/20)
              </span>
            </p>
            <p className="text-[12px] text-gray-500 mt-0.5">
              Thêm các trường tuỳ chỉnh cho form lead.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-orange-300 bg-orange-50 px-3 py-1.5 text-[13px] font-semibold text-orange-700 hover:bg-orange-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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

        {/* Custom fields list — inline cards */}
        {config.customFields.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 px-4 py-6 text-center">
            <p className="text-[13px] text-gray-500">
              Chưa có trường tuỳ chỉnh. Bấm <b>+ Thêm trường</b> để tạo trường email, họ tên, SĐT hoặc tuỳ ý.
            </p>
          </div>
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
                />
              );
            })}
          </div>
        )}
      </section>

      {/* Xem trước form */}
      <section className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/60">
          <div>
            <p className="text-[14px] font-semibold text-gray-900">
              {t('leadFormConfig.localPreview') || 'Xem trước'}
            </p>
            <p className="text-[12px] text-gray-500 mt-0.5">
              Form sẽ hiển thị như thế này trên landing page của bạn.
            </p>
          </div>
        </div>
        <div className="px-5 py-5 bg-gray-50/40 max-h-[520px] overflow-auto">
          <FounderLeadFormCard
            variant="embed"
            locale="vi"
            theme={config.theme}
            nameMode={nameMode}
            formCopy={{
              embedTitle: 'Đăng ký nhận thông tin',
              fullName: 'Họ và tên',
              email: 'Email',
              phone: 'Số điện thoại',
              occupation: 'Nghề nghiệp',
              interest: 'Lĩnh vực quan tâm',
              selectOccupation: '-- Chọn nghề --',
              selectInterest: '-- Chọn lĩnh vực --',
              consentPrefix: 'Tôi đồng ý nhận thông tin',
              privacyLink: 'chính sách bảo mật',
              submit: 'Gửi',
              submitting: 'Đang gửi',
              secureNote: 'Bảo mật tuyệt đối',
              successTitle: 'Thành công!',
              placeholders: { fullName: 'Nguyễn Văn A', email: 'email@gmail.com', phone: '0901 234 567' },
            }}
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
}) {
  const summary = String(field.labelVi || '').trim() || <span className="italic text-gray-400">(chưa có nhãn)</span>;
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
          title={isExpanded ? 'Thu gọn' : 'Mở rộng'}
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
            Bắt buộc
          </label>

          <div className="flex items-center gap-1">
            <button
              type="button"
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-30"
              onClick={onMoveUp}
              disabled={index === 0}
            >
              <HiOutlineChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-30"
              onClick={onMoveDown}
            >
              <HiOutlineChevronDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
              onClick={onRemove}
            >
              <HiOutlineTrash className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

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
                + Thêm lựa chọn
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
