import { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  MAX_READ_FORM_SUBMISSIONS_FORM_IDS,
  getFormIdsFromConfig,
  previewFormSubmissionsForIds,
} from '../utils/readFormSubmissionsFormIds.js';
import NumberInput from '../../../components/common/NumberInput';

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
 * Cấu hình node «Dữ liệu Biểu mẫu» (read_form_submissions, PR-6b): chọn MỘT HOẶC NHIỀU form (PR-7b; có lối tắt «mọi biểu
 * mẫu của landing X»), ánh xạ trường Họ tên/Email/SĐT, chọn cột giữ lại, xem bảng biến để dùng ở bước gửi sau, giới hạn số bản ghi.
 * Lựa chọn lưu ở `formData.formIds` (số[]); `formData.formId` chỉ còn là dạng cũ được đổi sang `formIds` lúc mở khung.
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

  // Lối tắt «mọi biểu mẫu của landing X» — lỗi/không quyền thì chỉ ẩn lối tắt, không chặn việc chọn biểu mẫu.
  const [landingGroups, setLandingGroups] = useState([]);

  const [isLoadingColumns, setIsLoadingColumns] = useState(false);
  const [columnsLoadError, setColumnsLoadError] = useState('');
  // Tick liên tiếp nhiều biểu mẫu → nhiều lượt tải cột chồng nhau; chỉ lượt MỚI NHẤT được ghi vào formData.
  const columnsRequestSeq = useRef(0);

  const selectedIds = useMemo(
    () => getFormIdsFromConfig(formData),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [formData.formIds, formData.formId]
  );
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const hasSelection = selectedIds.length > 0;
  const formsById = useMemo(() => new Map(forms.map((f) => [Number(f.id), f])), [forms]);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await campaignBuilderApiService.listLandingFormGroups();
        const groups = Array.isArray(response?.data?.data) ? response.data.data : [];
        if (!cancelled) setLandingGroups(groups.filter((g) => Array.isArray(g?.formIds) && g.formIds.length > 0));
      } catch {
        // Lối tắt là tiện ích — không báo lỗi, người dùng vẫn tick từng biểu mẫu được.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Tải cột (nhãn dễ đọc cho khung ánh xạ + bảng biến) của các biểu mẫu đang chọn. Chỉ lượt gọi MỚI NHẤT được ghi lại.
  const refreshColumns = async (ids) => {
    columnsRequestSeq.current += 1;
    const seq = columnsRequestSeq.current;
    if (ids.length === 0) {
      setFormData((prev) => ({ ...prev, formColumnsSnapshot: [] }));
      setColumnsLoadError('');
      setIsLoadingColumns(false);
      return;
    }
    setIsLoadingColumns(true);
    setColumnsLoadError('');
    try {
      const response = await previewFormSubmissionsForIds(campaignBuilderApiService, ids, { limit: 1 });
      if (seq !== columnsRequestSeq.current) return;
      const columns = Array.isArray(response.data?.data?.columns) ? response.data.data.columns : [];
      setFormData((prev) => ({ ...prev, formColumnsSnapshot: columns }));
    } catch (error) {
      if (seq !== columnsRequestSeq.current) return;
      if (error?.response?.status === 404) {
        setColumnsLoadError(t('nodeConfigFormSubmissions.formDeletedError'));
      } else {
        const msg = error.response?.data?.message || error.message || t('nodeConfigFormSubmissions.loadFormsError');
        setColumnsLoadError(typeof msg === 'string' ? msg : t('nodeConfigFormSubmissions.loadFormsError'));
      }
    } finally {
      if (seq === columnsRequestSeq.current) setIsLoadingColumns(false);
    }
  };

  // Biểu mẫu đã chọn từ trước (đang sửa node) nhưng chưa có formColumnsSnapshot (config cũ) hoặc
  // biểu mẫu đã bị xoá sau khi lưu -> tải lại cột ngay khi mở khung, để phát hiện lỗi sớm.
  useEffect(() => {
    if (!hasSelection || columnsSnapshot.length > 0) return undefined;
    refreshColumns(selectedIds);
    return () => {
      // Đóng khung giữa chừng: vô hiệu lượt đang bay để không ghi vào formData đã huỷ.
      columnsRequestSeq.current += 1;
    };
    // Chỉ chạy lúc mở khung: đổi lựa chọn đã có handler tải cột riêng (applySelection).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Áp danh sách biểu mẫu mới: ghi `formIds` (bỏ `formId` cũ), cờ đồng ý (TẤT CẢ biểu mẫu đã chọn đều bật hỏi đồng ý), rồi tải cột.
   * @param {number[]} nextIds
   */
  const applySelection = (nextIds) => {
    const ids = nextIds.slice(0, MAX_READ_FORM_SUBMISSIONS_FORM_IDS);
    const allConsent = ids.length > 0
      && ids.every((id) => Boolean(formsById.get(id)?.settings?.consentEnabled));
    setFormData((prev) => {
      const next = { ...prev, formIds: ids, formConsentEnabled: allConsent };
      delete next.formId;
      return next;
    });
    refreshColumns(ids);
  };

  const handleToggleForm = (formId) => {
    const id = Number(formId);
    applySelection(selectedIdSet.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  // Lối tắt: THÊM mọi biểu mẫu của landing vào lựa chọn hiện có (không thay thế), bỏ qua id không còn trong danh sách biểu mẫu.
  const handleAddLandingForms = (slug) => {
    if (!slug) return;
    const group = landingGroups.find((g) => g.slug === slug);
    if (!group) return;
    const merged = [...selectedIds];
    for (const raw of group.formIds) {
      const id = Number(raw);
      if (Number.isFinite(id) && id > 0 && !merged.includes(id)) merged.push(id);
    }
    applySelection(merged);
  };

  const handleClearSelection = () => applySelection([]);

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

  // Cảnh báo "không lấy được ai": theo từng biểu mẫu đã chọn khi đã có danh sách biểu mẫu; chưa có thì dùng cờ đã lưu trong node.
  const consentWarningText = useMemo(() => {
    if (!hasSelection) return '';
    if (formsById.size === 0) {
      return formData.formConsentEnabled ? '' : t('nodeConfigFormSubmissions.consentWarning');
    }
    const noConsent = selectedIds
      .map((id) => formsById.get(id))
      .filter((form) => form && !form.settings?.consentEnabled);
    if (noConsent.length === 0) return '';
    if (selectedIds.length === 1) return t('nodeConfigFormSubmissions.consentWarning');
    return t('nodeConfigFormSubmissions.consentWarningNamed', { titles: noConsent.map((f) => f.title).join(', ') });
  }, [hasSelection, formsById, selectedIds, formData.formConsentEnabled, t]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600 dark:text-dk-text2">{t('nodeConfigFormSubmissions.pageDescription')}</p>

      <fieldset className="space-y-3">
        <legend className="mb-1 block text-sm font-medium text-gray-700 dark:text-dk-text">
          {t('nodeConfigFormSubmissions.selectFormLabel')}
        </legend>
        {isLoadingForms ? (
          <p className="text-sm text-gray-500 dark:text-dk-text2">{t('nodeConfigFormSubmissions.loadingForms')}</p>
        ) : formsForbidden ? (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:border-red-800 dark:text-red-300">
            {t('nodeConfigFormSubmissions.forbiddenError')}
          </p>
        ) : formsLoadError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:border-red-800 dark:text-red-300">{formsLoadError}</p>
        ) : forms.length === 0 ? (
          <p className="rounded-lg border border-amber-100 bg-amber-50/90 p-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300">
            {t('nodeConfigFormSubmissions.noFormsYet')}{' '}
            <Link to="/app/forms/new" className="font-medium underline">
              {t('nodeConfigFormSubmissions.createFormLink')}
            </Link>
          </p>
        ) : (
          <>
            <p className="text-xs text-gray-500 dark:text-dk-text2">{t('nodeConfigFormSubmissions.selectFormHint')}</p>

            {landingGroups.length > 0 ? (
              <div>
                <label
                  htmlFor="form-submissions-landing-shortcut"
                  className="mb-1 block text-xs font-medium text-gray-700 dark:text-dk-text"
                >
                  {t('nodeConfigFormSubmissions.landingShortcutLabel')}
                </label>
                <select
                  id="form-submissions-landing-shortcut"
                  value=""
                  onChange={(e) => handleAddLandingForms(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-dk-border-strong dark:bg-dk-inset dark:text-dk-text"
                >
                  <option value="">{t('nodeConfigFormSubmissions.landingShortcutPlaceholder')}</option>
                  {landingGroups.map((group) => (
                    <option key={group.slug} value={group.slug}>
                      {t('nodeConfigFormSubmissions.landingShortcutOption', {
                        title: group.title || group.slug,
                        count: group.formIds.length,
                      })}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-gray-200 p-1.5 dark:border-dk-border">
              {forms.map((form) => {
                const id = Number(form.id);
                return (
                  <label
                    key={form.id}
                    className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-dk-raised"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIdSet.has(id)}
                      onChange={() => handleToggleForm(id)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-dk-border-strong dark:bg-dk-inset"
                    />
                    <span className="min-w-0 text-sm text-gray-800 dark:text-dk-text">
                      {form.title} ({t('nodeConfigFormSubmissions.submissionCount', { count: form.submissionCount || 0 })})
                    </span>
                  </label>
                );
              })}
            </div>

            {hasSelection ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600 dark:text-dk-text2">
                <span>{t('nodeConfigFormSubmissions.selectedCount', { count: selectedIds.length })}</span>
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="font-medium text-primary-700 underline hover:text-primary-800 dark:text-primary-300"
                >
                  {t('nodeConfigFormSubmissions.clearSelection')}
                </button>
              </div>
            ) : null}
          </>
        )}
      </fieldset>

      {columnsLoadError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:border-red-800 dark:text-red-300">{columnsLoadError}</p>
      ) : null}

      {consentWarningText ? (
        <p className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50/90 p-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300">
          <HiOutlineExclamation className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>{consentWarningText}</span>
        </p>
      ) : null}
      <p className="text-xs text-gray-500 dark:text-dk-text2">{t('nodeConfigFormSubmissions.consentInfo')}</p>

      {hasSelection ? (
        <div className="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-dk-border">
          <span className="text-sm font-medium text-gray-700 dark:text-dk-text">{t('nodeConfigFormSubmissions.fieldMapTitle')}</span>
          {selectedIds.length > 1 ? (
            <p className="text-xs text-gray-500 dark:text-dk-text2">{t('nodeConfigFormSubmissions.multiFieldMapHint')}</p>
          ) : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { field: 'nameKey', label: t('nodeConfigFormSubmissions.nameFieldLabel') },
              { field: 'emailKey', label: t('nodeConfigFormSubmissions.emailFieldLabel') },
              { field: 'phoneKey', label: t('nodeConfigFormSubmissions.phoneFieldLabel') },
            ].map(({ field, label }) => (
              <div key={field}>
                <label
                  htmlFor={`form-submissions-field-map-${field}`}
                  className="mb-1 block text-xs font-medium text-gray-700 dark:text-dk-text"
                >
                  {label}
                </label>
                <select
                  id={`form-submissions-field-map-${field}`}
                  value={fieldMap[field] || ''}
                  onChange={(e) => handleFieldMapChange(field, e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-dk-border-strong dark:bg-dk-inset dark:text-dk-text"
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

      {hasSelection ? (
        <div className="space-y-2 rounded-lg border border-gray-200 p-4 dark:border-dk-border">
          <div>
            <span className="text-sm font-medium text-gray-700 dark:text-dk-text">
              {t('nodeConfigFormSubmissions.variablesTableTitle')}
            </span>
            <p className="text-xs text-gray-500 dark:text-dk-text2">{t('nodeConfigFormSubmissions.variablesTableHint')}</p>
          </div>
          <div className="max-h-56 space-y-1.5 overflow-y-auto">
            {variableRows.map((row) => (
              <div
                key={row.key}
                className="flex items-center justify-between gap-2 rounded-md border border-gray-100 bg-gray-50 px-2.5 py-1.5 dark:bg-dk-raised dark:border-dk-border"
              >
                <span className="min-w-0 truncate text-xs text-gray-700 dark:text-dk-text" title={row.label}>
                  {row.label}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyVariable(row.key)}
                  className="inline-flex shrink-0 items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 font-mono text-[11px] text-primary-700 hover:bg-primary-50 dark:bg-dk-raised dark:border-dk-border-strong dark:text-primary-300 dark:hover:bg-primary-900/40"
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
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-dk-text">
          {t('nodeConfigFormSubmissions.maxRecords', { max: FORM_SUBMISSIONS_MAX_RECORDS.toLocaleString('vi-VN') })}
        </label>
        <NumberInput
          min={1}
          max={FORM_SUBMISSIONS_MAX_RECORDS}
          value={formData.formSubmissionsLimit || 1000}
          onChange={(v) =>
            setFormData((prev) => ({
              ...prev,
              formSubmissionsLimit: clampFormSubmissionsLimitUi(v, 1000),
            }))
          }
          className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-dk-border-strong dark:bg-dk-inset dark:text-dk-text dark:placeholder-dk-muted"
        />
      </div>
    </div>
  );
}
