import { Link } from 'react-router-dom';
import campaignBuilderApiService from '../../services/campaignBuilderApi.service';
import { MAX_FORM_IDS } from '../simpleCampaign.helpers';
import useAsyncResource from '../useAsyncResource';

const loadForms = async () => {
  const response = await campaignBuilderApiService.listForms();
  return Array.isArray(response?.data?.data) ? response.data.data : [];
};

/**
 * "Người điền biểu mẫu": chọn một hoặc nhiều biểu mẫu. Biểu mẫu chưa hỏi đồng ý nhận tin thì không lấy được ai
 * (cùng cảnh báo với node "Dữ liệu Biểu mẫu") nên nhắc ngay dưới tên.
 *
 * @param {object} props
 * @param {number[]} props.formIds
 * @param {string[]} props.formTitles song song với `formIds`
 * @param {(patch: object) => void} props.patchAudience
 * @param {(key: string, params?: object) => string} props.t
 */
export default function FormPanel({ formIds, formTitles, patchAudience, t }) {
  const resource = useAsyncResource(loadForms, []);

  const toggle = (form) => {
    const id = Number(form.id);
    const index = formIds.indexOf(id);
    if (index >= 0) {
      patchAudience({
        formIds: formIds.filter((_, i) => i !== index),
        formTitles: formTitles.filter((_, i) => i !== index),
      });
      return;
    }
    if (formIds.length >= MAX_FORM_IDS) return;
    patchAudience({ formIds: [...formIds, id], formTitles: [...formTitles, String(form.title || `#${id}`)] });
  };

  if (resource.status === 'loading') {
    return <p className="text-sm text-slate-500 dark:text-dk-text2" role="status">{t('simpleCampaign.audience.loading')}</p>;
  }
  if (resource.status === 'error') {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300" role="alert">
        <p>{resource.error || t('simpleCampaign.audience.form.loadFailed')}</p>
        <button type="button" onClick={resource.reload} className="mt-2 font-semibold underline">{t('simpleCampaign.retry')}</button>
      </div>
    );
  }
  const forms = resource.data || [];
  if (forms.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200" data-testid="simple-forms-empty">
        <p>{t('simpleCampaign.audience.form.empty')}</p>
        <Link to="/app/forms/new" className="mt-1 inline-block font-semibold underline">{t('simpleCampaign.audience.form.create')}</Link>
      </div>
    );
  }
  return (
    <div>
      <p className="mb-2 text-sm text-slate-600 dark:text-dk-text2">{t('simpleCampaign.audience.form.hint')}</p>
      <ul className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-1.5 dark:border-dk-border">
        {forms.map((form) => {
          const id = Number(form.id);
          const checked = formIds.includes(id);
          const atLimit = !checked && formIds.length >= MAX_FORM_IDS;
          const noConsent = !form.settings?.consentEnabled;
          return (
            <li key={form.id}>
              <label className={`flex min-h-[44px] items-start gap-3 rounded-lg px-2.5 py-2 hover:bg-slate-50 dark:hover:bg-dk-raised ${atLimit ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={atLimit}
                  onChange={() => toggle(form)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-orange-500 focus:ring-orange-500 dark:border-dk-border-strong dark:bg-dk-inset"
                />
                <span className="min-w-0 text-sm text-slate-800 dark:text-dk-text">
                  <span className="block break-words font-medium">{form.title}</span>
                  <span className="block text-xs text-slate-500 dark:text-dk-text2">
                    {t('simpleCampaign.audience.form.responses', { count: Number(form.submissionCount) || 0 })}
                  </span>
                  {noConsent && (
                    <span className="mt-0.5 block text-xs text-amber-700 dark:text-amber-300" data-testid={`simple-form-noconsent-${id}`}>
                      {t('simpleCampaign.audience.form.noConsent')}
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {formIds.length > 0 && (
        <p className="mt-2 text-xs text-slate-500 dark:text-dk-text2">{t('simpleCampaign.audience.form.selected', { count: formIds.length })}</p>
      )}
    </div>
  );
}
