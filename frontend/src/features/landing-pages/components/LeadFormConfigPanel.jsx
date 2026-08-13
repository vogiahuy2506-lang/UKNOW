import { HiOutlinePlus, HiOutlineTrash, HiOutlineChevronUp, HiOutlineChevronDown } from 'react-icons/hi';
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
 * Cấu hình field form lead: toggle occupation/interest + custom fields + preview local (disable submit).
 */
export default function LeadFormConfigPanel({ form, setForm, t }) {
  const config = normalizeLeadFormConfig(form.leadFormConfig || defaultLeadFormConfig());
  const persistedKeys = new Set(form.leadFormPersistedMeta?.keys || []);
  const persistedOptionValuesByKey = form.leadFormPersistedMeta?.optionValuesByKey || {};
  const fieldErrors = form.leadFormFieldErrors || {};

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

  const previewForm = {
    lastName: '',
    firstName: '',
    email: '',
    phone: '',
    occupation: '',
    interestArea: '',
    marketingConsent: true,
    customFields: {},
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">{t('leadFormConfig.help')}</p>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={config.fixedFields.occupation.visible}
          onChange={(e) => setFixedVisible('occupation', e.target.checked)}
          className="rounded border-gray-300 text-blue-600"
        />
        {t('leadFormConfig.showOccupation')}
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={config.fixedFields.interestArea.visible}
          onChange={(e) => setFixedVisible('interestArea', e.target.checked)}
          className="rounded border-gray-300 text-blue-600"
        />
        {t('leadFormConfig.showInterest')}
      </label>

      <div className="flex items-center justify-between pt-1">
        <span className="text-sm font-medium text-gray-800">{t('leadFormConfig.customFields')}</span>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          onClick={() => {
            if (config.customFields.length >= 20) return;
            patch({ ...config, customFields: [...config.customFields, emptyCustomField()] });
          }}
        >
          <HiOutlinePlus className="h-3.5 w-3.5" />
          {t('leadFormConfig.addField')}
        </button>
      </div>

      <div className="space-y-3">
        {config.customFields.map((field, index) => {
          const isPersisted = persistedKeys.has(field.key);
          const persistedOptionValues = new Set(persistedOptionValuesByKey[field.key] || []);
          const labelError = fieldErrors[field.key];
          return (
          <div key={field.key} className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <code className="text-[11px] text-gray-500">{field.key}</code>
              <div className="flex items-center gap-1">
                <button type="button" className="p-1 text-gray-500 hover:text-gray-800" onClick={() => moveField(index, -1)}>
                  <HiOutlineChevronUp className="h-4 w-4" />
                </button>
                <button type="button" className="p-1 text-gray-500 hover:text-gray-800" onClick={() => moveField(index, 1)}>
                  <HiOutlineChevronDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="p-1 text-red-500 hover:text-red-700"
                  onClick={() => patch({ ...config, customFields: config.customFields.filter((_, i) => i !== index) })}
                >
                  <HiOutlineTrash className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <input
                  className={`w-full rounded border px-2 py-1.5 text-sm ${labelError ? 'border-red-400' : 'border-gray-300'}`}
                  placeholder={t('leadFormConfig.labelVi')}
                  value={field.labelVi}
                  onChange={(e) => updateField(index, { labelVi: e.target.value })}
                />
                {labelError ? (
                  <p className="mt-1 text-xs text-red-600">{labelError}</p>
                ) : null}
              </div>
              <input
                className="rounded border border-gray-300 px-2 py-1.5 text-sm"
                placeholder={t('leadFormConfig.labelEn')}
                value={field.labelEn || ''}
                onChange={(e) => updateField(index, { labelEn: e.target.value })}
              />
              <select
                className="rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100 disabled:text-gray-500"
                value={field.type}
                disabled={isPersisted}
                title={isPersisted ? t('leadFormConfig.typeLocked') : undefined}
                onChange={(e) => {
                  const type = e.target.value;
                  const options = type === 'select' || type === 'radio'
                    ? (field.options?.length ? field.options : [{ value: 'opt_a', labelVi: 'Lựa chọn 1', labelEn: 'Option 1' }])
                    : [];
                  updateField(index, { type, options });
                }}
              >
                {CUSTOM_FIELD_TYPES.map((type) => (
                  <option key={type} value={type}>{t(`leadFormConfig.types.${type}`)}</option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={Boolean(field.required)}
                  onChange={(e) => updateField(index, { required: e.target.checked })}
                />
                {t('leadFormConfig.required')}
              </label>
            </div>
            {(field.type === 'text' || field.type === 'textarea') ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  className="rounded border border-gray-300 px-2 py-1.5 text-sm"
                  placeholder={t('leadFormConfig.placeholderVi')}
                  value={field.placeholderVi || ''}
                  onChange={(e) => updateField(index, { placeholderVi: e.target.value })}
                />
                <input
                  className="rounded border border-gray-300 px-2 py-1.5 text-sm"
                  placeholder={t('leadFormConfig.placeholderEn')}
                  value={field.placeholderEn || ''}
                  onChange={(e) => updateField(index, { placeholderEn: e.target.value })}
                />
              </div>
            ) : null}
            {(field.type === 'select' || field.type === 'radio') ? (
              <div className="space-y-1">
                {(field.options || []).map((opt, oi) => {
                  const valueLocked = persistedOptionValues.has(opt.value);
                  return (
                  <div key={`${field.key}-${oi}`} className="flex gap-2">
                    <input
                      className="w-28 rounded border border-gray-300 px-2 py-1 text-xs disabled:bg-gray-100 disabled:text-gray-500"
                      placeholder="value"
                      value={opt.value}
                      disabled={valueLocked}
                      title={valueLocked ? t('leadFormConfig.optionValueLocked') : undefined}
                      onChange={(e) => {
                        const options = [...(field.options || [])];
                        options[oi] = { ...opt, value: e.target.value };
                        updateField(index, { options });
                      }}
                    />
                    <input
                      className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
                      placeholder="VI"
                      value={opt.labelVi}
                      onChange={(e) => {
                        const options = [...(field.options || [])];
                        options[oi] = { ...opt, labelVi: e.target.value };
                        updateField(index, { options });
                      }}
                    />
                    <input
                      className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
                      placeholder="EN"
                      value={opt.labelEn || ''}
                      onChange={(e) => {
                        const options = [...(field.options || [])];
                        options[oi] = { ...opt, labelEn: e.target.value };
                        updateField(index, { options });
                      }}
                    />
                    <button
                      type="button"
                      className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-30"
                      disabled={(field.options || []).length <= 1}
                      title={t('leadFormConfig.removeOption')}
                      onClick={() => {
                        const options = (field.options || []).filter((_, i) => i !== oi);
                        updateField(index, { options });
                      }}
                    >
                      <HiOutlineTrash className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  );
                })}
                <button
                  type="button"
                  className="text-xs text-blue-700 hover:underline"
                  onClick={() => updateField(index, {
                    options: [...(field.options || []), {
                      value: nextUnusedOptionValue(
                        field.options,
                        persistedOptionValuesByKey[field.key],
                      ),
                      labelVi: '',
                      labelEn: '',
                    }],
                  })}
                >
                  {t('leadFormConfig.addOption')}
                </button>
              </div>
            ) : null}
          </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-3">
        <p className="mb-2 text-xs font-medium text-gray-500">{t('leadFormConfig.localPreview')}</p>
        <div className="pointer-events-none origin-top scale-90">
          <FounderLeadFormCard
            variant="embed"
            locale="vi"
            formCopy={{
              embedTitle: 'Đăng ký',
              lastName: 'Họ',
              firstName: 'Tên',
              email: 'Email',
              phone: 'SĐT',
              occupation: 'Nghề nghiệp',
              interest: 'Lĩnh vực',
              selectOccupation: 'Chọn nghề',
              selectInterest: 'Chọn lĩnh vực',
              consentPrefix: 'Tôi đồng ý với',
              privacyLink: 'chính sách',
              submit: 'Gửi',
              submitting: 'Đang gửi',
              secureNote: 'Bảo mật',
              successTitle: 'OK',
              placeholders: { lastName: '', firstName: '', email: '', phone: '' },
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
      </div>
    </div>
  );
}
