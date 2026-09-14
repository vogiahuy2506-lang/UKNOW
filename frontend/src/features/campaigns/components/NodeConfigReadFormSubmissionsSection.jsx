import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { HiOutlineDuplicate, HiOutlineExclamation } from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import {
  FORM_SUBMISSIONS_MAX_RECORDS,
  clampFormSubmissionsLimitUi,
} from '../constants/formSubmissionsNodeLimits.js';
import { FORM_SUBMISSION_COLUMN_OPTIONS } from '../constants/dataNodeColumnOptions.js';
import { NodeConfigDataColumnPicker } from './NodeConfigDataColumnPicker';
import campaignBuilderApiService from '../services/campaignBuilderApi.service';

/** Khoá cố định của item chiến dịch (khớp RESERVED_CAMPAIGN_ITEM_FIELD_KEYS phía backend). */
const FIXED_VARIABLE_ROWS = [
  { key: 'submissionId', label: 'submissionId' },
  { key: 'id', label: 'id' },
  { key: 'formId', label: 'formId' },
  { key: 'fullName', label: 'fullName' },
  { key: 'email', label: 'email' },
  { key: 'phone', label: 'phone' },
  { key: 'appointmentAt', label: 'appointmentAt' },
  { key: 'createdAt', label: 'createdAt' },
  { key: 'marketingConsent', label: 'marketingConsent' },
];

/**
 * Cấu hình node «Dữ liệu Biểu mẫu» (read_form_submissions, PR-6b): chọn form, ánh xạ trường
 * Họ tên/Email/SĐT, chọn cột giữ lại, xem bảng biến để dùng ở bước gửi sau, giới hạn số bản ghi.
 *
 * @param {object} props
 * @param {object} props.formData
 * @param {function} props.setFormData
 */
export function NodeConfigReadFormSubmissionsSection({ formData, setFormData }) {
  const { t } = useI18n();

  const [forms, setForms] = useState([]);
  const [isLoadingForms, setIsLoadingForms] = useState(true);
  const [formsLoadError, setFormsLoadError] = useState('');
  const [formsForbidden, setFormsForbidden] = useState(false);

  const [isLoadingColumns, setIsLoadingColumns] = useState(false);
  const [columnsLoadError, setColumnsLoadError] = useState('');

  const fieldMap = formData.fieldMap || {};
  const columnsSnapshot = useMemo(
    () => (Array.isArray(formData.formColumnsSnapshot) ? formData.formColumnsSnapshot : []),
    [formData.formColumnsSnapshot]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoadingForms(true);
      setFormsLoadError('');
      setFormsForbidden(false);
      try {
        const response = await campaignBuilderApiService.listForms();
        const items = Array.isArray(response.data?.data) ? response.data.data : [];
        if (!cancelled) setForms(items);
      } catch (error) {
        if (cancelled) return;
        if (error?.response?.status === 403) {
          setFormsForbidden(true);
        } else {
          const msg = error.response?.data?.message || error.message || t('nodeConfigFormSubmissions.loadFormsError');
          setFormsLoadError(typeof msg === 'string' ? msg : t('nodeConfigFormSubmissions.loadFormsError'));
        }
      } finally {
        if (!cancelled) setIsLoadingForms(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Form đã chọn từ trước (đang sửa node) nhưng chưa có formColumnsSnapshot (config cũ) hoặc
  // form đã bị xoá sau khi lưu -> tải lại cột ngay khi mở khung, để phát hiện lỗi sớm.
  useEffect(() => {
    if (!formData.formId || columnsSnapshot.length > 0) return;
    let cancelled = false;
    (async () => {
      setIsLoadingColumns(true);
      setColumnsLoadError('');
      try {
        const response = await campaignBuilderApiService.previewFormSubmissions(formData.formId, { limit: 1 });
        const columns = Array.isArray(response.data?.data?.columns) ? response.data.data.columns : [];
        if (!cancelled) {
          setFormData((prev) => ({ ...prev, formColumnsSnapshot: columns }));
        }
      } catch (error) {
        if (cancelled) return;
        if (error?.response?.status === 404) {
          setColumnsLoadError(t('nodeConfigFormSubmissions.formDeletedError'));
        } else {
          const msg = error.response?.data?.message || error.message || t('nodeConfigFormSubmissions.loadFormsError');
          setColumnsLoadError(typeof msg === 'string' ? msg : t('nodeConfigFormSubmissions.loadFormsError'));
        }
      } finally {
        if (!cancelled) setIsLoadingColumns(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.formId]);

  const handleSelectForm = async (formId) => {
    if (!formId) {
      setFormData((prev) => ({ ...prev, formId: '', formColumnsSnapshot: [], formConsentEnabled: false }));
      setColumnsLoadError('');
      return;
    }
    const form = forms.find((f) => String(f.id) === String(formId));
    setFormData((prev) => ({
      ...prev,
      formId,
      formConsentEnabled: Boolean(form?.settings?.consentEnabled),
    }));

    setIsLoadingColumns(true);
    setColumnsLoadError('');
    try {
      const response = await campaignBuilderApiService.previewFormSubmissions(formId, { limit: 1 });
      const columns = Array.isArray(response.data?.data?.columns) ? response.data.data.columns : [];
      setFormData((prev) => ({ ...prev, formColumnsSnapshot: columns }));
    } catch (error) {
      if (error?.response?.status === 404) {
        setColumnsLoadError(t('nodeConfigFormSubmissions.formDeletedError'));
      } else {
        const msg = error.response?.data?.message || error.message || t('nodeConfigFormSubmissions.loadFormsError');
        setColumnsLoadError(typeof msg === 'string' ? msg : t('nodeConfigFormSubmissions.loadFormsError'));
      }
    } finally {
      setIsLoadingColumns(false);
    }
  };

  const handleFieldMapChange = (key, value) => {
    setFormData((prev) => ({
      ...prev,
      fieldMap: { ...(prev.fieldMap || {}), [key]: value },
    }));
  };

  const handleCopyVariable = async (key) => {
    const text = `{{${key}}}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('nodeConfigFormSubmissions.copiedToast', { variable: text }));
    } catch {
      toast.error(t('nodeConfigFormSubmissions.copyError'));
    }
  };

  const columnPickerOptions = useMemo(
    () => [
      ...FORM_SUBMISSION_COLUMN_OPTIONS,
      ...columnsSnapshot.map((c) => ({ key: c.key, label: c.label || c.key })),
    ],
    [columnsSnapshot]
  );

  const variableRows = useMemo(
    () => [
      ...FIXED_VARIABLE_ROWS,
      ...columnsSnapshot.map((c) => ({ key: c.key, label: c.label || c.key })),
    ],
    [columnsSnapshot]
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">{t('nodeConfigFormSubmissions.pageDescription')}</p>

      <div>
        <label htmlFor="form-submissions-select-form" className="mb-1 block text-sm font-medium text-gray-700">
          {t('nodeConfigFormSubmissions.selectFormLabel')}
        </label>
        {isLoadingForms ? (
          <p className="text-sm text-gray-500">{t('nodeConfigFormSubmissions.loadingForms')}</p>
        ) : formsForbidden ? (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {t('nodeConfigFormSubmissions.forbiddenError')}
          </p>
        ) : formsLoadError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formsLoadError}</p>
        ) : forms.length === 0 ? (
          <p className="rounded-lg border border-amber-100 bg-amber-50/90 p-3 text-sm text-amber-950">
            {t('nodeConfigFormSubmissions.noFormsYet')}{' '}
            <Link to="/app/forms/new" className="font-medium underline">
              {t('nodeConfigFormSubmissions.createFormLink')}
            </Link>
          </p>
        ) : (
          <select
            id="form-submissions-select-form"
            value={formData.formId || ''}
            onChange={(e) => handleSelectForm(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">{t('nodeConfigFormSubmissions.selectFormPlaceholder')}</option>
            {forms.map((form) => (
              <option key={form.id} value={form.id}>
                {form.title} ({t('nodeConfigFormSubmissions.submissionCount', { count: form.submissionCount || 0 })})
              </option>
            ))}
          </select>
        )}
      </div>

      {columnsLoadError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{columnsLoadError}</p>
      ) : null}

      {formData.formId && !formData.formConsentEnabled ? (
        <p className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50/90 p-3 text-sm text-amber-950">
          <HiOutlineExclamation className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <span>{t('nodeConfigFormSubmissions.consentWarning')}</span>
        </p>
      ) : null}
      <p className="text-xs text-gray-500">{t('nodeConfigFormSubmissions.consentInfo')}</p>

      {formData.formId ? (
        <div className="space-y-3 rounded-lg border border-gray-200 p-4">
          <span className="text-sm font-medium text-gray-700">{t('nodeConfigFormSubmissions.fieldMapTitle')}</span>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { field: 'nameKey', label: t('nodeConfigFormSubmissions.nameFieldLabel') },
              { field: 'emailKey', label: t('nodeConfigFormSubmissions.emailFieldLabel') },
              { field: 'phoneKey', label: t('nodeConfigFormSubmissions.phoneFieldLabel') },
            ].map(({ field, label }) => (
              <div key={field}>
                <label
                  htmlFor={`form-submissions-field-map-${field}`}
                  className="mb-1 block text-xs font-medium text-gray-700"
                >
                  {label}
                </label>
                <select
                  id={`form-submissions-field-map-${field}`}
                  value={fieldMap[field] || ''}
                  onChange={(e) => handleFieldMapChange(field, e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">{t('nodeConfigFormSubmissions.byRoleOption')}</option>
                  {columnsSnapshot.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label || c.key}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <NodeConfigDataColumnPicker
        title={t('nodeConfigFormSubmissions.keepFields')}
        options={columnPickerOptions}
        selectedKeys={Array.isArray(formData.dataSelectedColumns) ? formData.dataSelectedColumns : []}
        setFormData={setFormData}
        formField="dataSelectedColumns"
        hint={t('nodeConfigFormSubmissions.keepFieldsHint')}
      />

      {formData.formId ? (
        <div className="space-y-2 rounded-lg border border-gray-200 p-4">
          <div>
            <span className="text-sm font-medium text-gray-700">
              {t('nodeConfigFormSubmissions.variablesTableTitle')}
            </span>
            <p className="text-xs text-gray-500">{t('nodeConfigFormSubmissions.variablesTableHint')}</p>
          </div>
          <div className="max-h-56 space-y-1.5 overflow-y-auto">
            {variableRows.map((row) => (
              <div
                key={row.key}
                className="flex items-center justify-between gap-2 rounded-md border border-gray-100 bg-gray-50 px-2.5 py-1.5"
              >
                <span className="min-w-0 truncate text-xs text-gray-700" title={row.label}>
                  {row.label}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyVariable(row.key)}
                  className="inline-flex shrink-0 items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 font-mono text-[11px] text-primary-700 hover:bg-primary-50"
                  title={t('nodeConfigFormSubmissions.copyButton')}
                >
                  <HiOutlineDuplicate className="h-3.5 w-3.5" />
                  {`{{${row.key}}}`}
                </button>
              </div>
            ))}
          </div>
          {isLoadingColumns ? (
            <p className="text-xs text-gray-400">{t('nodeConfigFormSubmissions.loadingForms')}</p>
          ) : null}
        </div>
      ) : null}

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          {t('nodeConfigFormSubmissions.maxRecords', { max: FORM_SUBMISSIONS_MAX_RECORDS.toLocaleString('vi-VN') })}
        </label>
        <input
          type="number"
          min={1}
          max={FORM_SUBMISSIONS_MAX_RECORDS}
          value={formData.formSubmissionsLimit || 1000}
          onChange={(e) =>
            setFormData((prev) => ({
              ...prev,
              formSubmissionsLimit: clampFormSubmissionsLimitUi(e.target.value, 1000),
            }))
          }
          className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
    </div>
  );
}
