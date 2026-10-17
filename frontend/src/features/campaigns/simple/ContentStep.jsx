import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { HiOutlineEye, HiOutlinePencilAlt, HiOutlinePlus, HiOutlineTemplate, HiOutlineTrash } from 'react-icons/hi';
import SimpleChoiceCard from './SimpleChoiceCard';
import TemplateSearchSelect from '../components/TemplateSearchSelect';
import NodeConfigTemplatePreviewModal from '../components/NodeConfigTemplatePreviewModal';
import emailTemplateApiService from '../../templates/services/emailTemplateApi.service';
import zaloTemplateApiService from '../../templates/services/zaloTemplateApi.service';
import useAsyncResource from './useAsyncResource';
import { FOLLOW_UP_DELAY_UNITS, MAX_FOLLOW_UPS, isValidFollowUpDelay, templateKindOf } from './simpleCampaign.helpers';

const INPUT_CLASS =
  'w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 hover:bg-white focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 dark:border-dk-border dark:bg-dk-inset dark:text-dk-text dark:placeholder:text-dk-muted dark:hover:bg-dk-surface dark:focus:bg-dk-inset';

const serviceFor = (kind) => (kind === 'email' ? emailTemplateApiService : zaloTemplateApiService);

const loadTemplates = async (kind) => {
  const response = await serviceFor(kind).getTemplates({ page: 1, limit: 100 });
  return Array.isArray(response?.data?.data?.items) ? response.data.data.items : [];
};

/** Chọn một mẫu có sẵn + nút Xem trước (dùng lại modal xem trước của trình dựng). */
function TemplatePanel({ kind, content, patchContent, t, idPrefix }) {
  const resource = useAsyncResource(() => loadTemplates(kind), [kind]);
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const templates = useMemo(() => (resource.status === 'ready' ? resource.data : []), [resource.status, resource.data]);
  const options = useMemo(() => {
    const list = templates.map((item) => ({
      id: item.id,
      label: String(item.templateName || `#${item.id}`),
      description: String(item.category || '').trim(),
    }));
    // Mẫu đang chọn không nằm trong danh sách (danh sách chỉ tải 100 mẫu đầu): vẫn hiện đúng tên, không để ô chọn trống.
    const currentId = Number(content.templateId);
    if (currentId > 0 && !list.some((item) => Number(item.id) === currentId)) {
      list.unshift({ id: currentId, label: content.templateName || t('simpleCampaign.content.selectedTemplate'), description: '' });
    }
    return list;
  }, [templates, content.templateId, content.templateName, t]);

  // Chế độ sửa: GET chỉ trả id mẫu → điền tên mẫu khi danh sách đã tải (câu tóm tắt ở bước Xem lại nêu tên, không nêu số).
  useEffect(() => {
    if (!content.templateId || content.templateName) return;
    const picked = templates.find((item) => Number(item.id) === Number(content.templateId));
    if (picked) patchContent({ templateName: String(picked.templateName || '') });
    // patchContent ổn định (useCallback); chỉ phản ứng khi danh sách mẫu tải xong hoặc đổi mẫu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, content.templateId, content.templateName]);

  const handleChange = (value) => {
    const id = Number(value);
    const picked = templates.find((item) => Number(item.id) === id);
    patchContent({ templateId: id > 0 ? id : null, templateName: picked ? String(picked.templateName || '') : '' });
  };

  const handlePreview = async () => {
    if (!content.templateId) return;
    setIsPreviewLoading(true);
    setPreviewError('');
    try {
      const response = await serviceFor(kind).getTemplateById(content.templateId);
      const detail = response?.data?.data || null;
      if (detail) setPreviewTemplate(detail);
      else setPreviewError(t('simpleCampaign.content.previewFailed'));
    } catch {
      setPreviewError(t('simpleCampaign.content.previewFailed'));
    } finally {
      setIsPreviewLoading(false);
    }
  };

  if (resource.status === 'loading') {
    return <p className="text-sm text-slate-500 dark:text-dk-text2" role="status">{t('simpleCampaign.content.loadingTemplates')}</p>;
  }
  if (resource.status === 'error') {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300" role="alert">
        <p>{resource.error || t('simpleCampaign.content.loadTemplatesFailed')}</p>
        <button type="button" onClick={resource.reload} className="mt-2 font-semibold underline">{t('simpleCampaign.retry')}</button>
      </div>
    );
  }
  if (templates.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200" data-testid="simple-templates-empty">
        <p>{t('simpleCampaign.content.noTemplates')}</p>
        <Link to="/app/settings/templates" className="mt-1 inline-block font-semibold underline">{t('simpleCampaign.content.createTemplate')}</Link>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-slate-800 dark:text-dk-text">{t('simpleCampaign.content.templateLabel')}</label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1" data-testid={`${idPrefix}-template-select`}>
          <TemplateSearchSelect
            value={content.templateId || ''}
            options={options}
            onChange={handleChange}
            placeholder={t('simpleCampaign.content.selectTemplate')}
            searchPlaceholder={t('simpleCampaign.content.searchTemplate')}
            emptyText={t('simpleCampaign.content.noTemplateFound')}
          />
        </div>
        {/* Nút xem trước riêng: nút sẵn trong TemplateSearchSelect ghi cứng chữ tiếng Việt, không theo ngôn ngữ. */}
        <button
          type="button"
          onClick={handlePreview}
          disabled={!content.templateId || isPreviewLoading}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-dk-raised dark:text-dk-text dark:hover:bg-dk-strong"
        >
          <HiOutlineEye className="h-4 w-4" aria-hidden="true" />
          {t('simpleCampaign.content.preview')}
        </button>
      </div>
      {previewError && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{previewError}</p>}
      <NodeConfigTemplatePreviewModal
        isOpen={Boolean(previewTemplate)}
        onClose={() => setPreviewTemplate(null)}
        template={previewTemplate}
        subjectLabel={t('simpleCampaign.content.subjectLabel')}
      />
    </div>
  );
}

/** Tự soạn: Email = Tiêu đề + Nội dung; Zalo = Nội dung. */
function CustomPanel({ isEmail, content, patchContent, t, idPrefix }) {
  return (
    <div className="space-y-4">
      {isEmail && (
        <div>
          <label htmlFor={`${idPrefix}-subject`} className="block text-sm font-semibold text-slate-800 dark:text-dk-text">
            {t('simpleCampaign.content.subjectLabel')}
          </label>
          <input
            id={`${idPrefix}-subject`}
            type="text"
            maxLength={200}
            value={content.subject}
            onChange={(event) => patchContent({ subject: event.target.value })}
            placeholder={t('simpleCampaign.content.subjectPlaceholder')}
            className={`mt-2 ${INPUT_CLASS}`}
          />
        </div>
      )}
      <div>
        <label htmlFor={`${idPrefix}-body`} className="block text-sm font-semibold text-slate-800 dark:text-dk-text">
          {t('simpleCampaign.content.bodyLabel')}
        </label>
        <textarea
          id={`${idPrefix}-body`}
          rows={8}
          maxLength={10000}
          value={content.body}
          onChange={(event) => patchContent({ body: event.target.value })}
          placeholder={isEmail ? t('simpleCampaign.content.bodyPlaceholderEmail') : t('simpleCampaign.content.bodyPlaceholderZalo')}
          className={`mt-2 resize-y ${INPUT_CLASS}`}
        />
      </div>
    </div>
  );
}

/**
 * Chọn cách soạn + ô nhập của MỘT tin. Dùng cho tin 1 (`idPrefix` 'simple-content') và từng tin sau (`simple-followup-<id>`),
 * nên tin 1 giữ nguyên mọi id/testid cũ.
 */
function MessageEditor({ channel, content, patchContent, t, idPrefix, cardTestIdPrefix }) {
  const isEmail = channel === 'email';
  return (
    <>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SimpleChoiceCard
          testId={`${cardTestIdPrefix}-template`}
          icon={HiOutlineTemplate}
          tone="rose"
          title={t('simpleCampaign.content.template.title')}
          description={t('simpleCampaign.content.template.desc')}
          selected={content.mode === 'template'}
          onClick={() => patchContent({ mode: 'template' })}
        />
        <SimpleChoiceCard
          testId={`${cardTestIdPrefix}-custom`}
          icon={HiOutlinePencilAlt}
          tone="blue"
          title={t('simpleCampaign.content.custom.title')}
          description={t('simpleCampaign.content.custom.desc')}
          selected={content.mode === 'custom'}
          onClick={() => patchContent({ mode: 'custom' })}
        />
      </div>

      {content.mode && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-dk-border dark:bg-dk-bg/40" data-testid={`${idPrefix}-panel`}>
          {content.mode === 'template' ? (
            <TemplatePanel kind={templateKindOf(channel)} content={content} patchContent={patchContent} t={t} idPrefix={idPrefix} />
          ) : (
            <CustomPanel isEmail={isEmail} content={content} patchContent={patchContent} t={t} idPrefix={idPrefix} />
          )}
        </div>
      )}
    </>
  );
}

/** Thẻ một tin sau: "Gửi sau [N] [ngày|giờ] kể từ tin trước" + nội dung + nút xoá. */
function FollowUpCard({ wizard, channel, item, index, t }) {
  const { removeFollowUp, patchFollowUp, patchFollowUpContent } = wizard;
  const delayInvalid = !isValidFollowUpDelay(item.delayValue);
  const idPrefix = `simple-followup-${item.id}`;
  return (
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 dark:border-dk-border dark:bg-dk-surface" data-testid={`simple-followup-${index}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-bold text-slate-900 dark:text-dk-text">{t('simpleCampaign.content.followUp.title', { n: index + 2 })}</h3>
        <button
          type="button"
          onClick={() => removeFollowUp(item.id)}
          aria-label={t('simpleCampaign.content.followUp.removeAria', { n: index + 2 })}
          data-testid={`simple-followup-remove-${index}`}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
        >
          <HiOutlineTrash className="h-4 w-4" aria-hidden="true" />
          {t('simpleCampaign.content.followUp.remove')}
        </button>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <label htmlFor={`${idPrefix}-delay`} className="text-sm font-semibold text-slate-800 dark:text-dk-text">{t('simpleCampaign.content.followUp.sendAfter')}</label>
        <div className="flex items-center gap-2">
          <input
            id={`${idPrefix}-delay`}
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={item.delayValue}
            onChange={(event) => patchFollowUp(item.id, { delayValue: event.target.value })}
            aria-invalid={delayInvalid}
            data-testid={`simple-followup-delay-${index}`}
            className={`w-24 ${INPUT_CLASS}`}
          />
          <select
            value={item.delayUnit}
            onChange={(event) => patchFollowUp(item.id, { delayUnit: event.target.value })}
            aria-label={t('simpleCampaign.content.followUp.unitAria')}
            data-testid={`simple-followup-unit-${index}`}
            className={`w-28 ${INPUT_CLASS}`}
          >
            {FOLLOW_UP_DELAY_UNITS.map((unit) => (
              <option key={unit} value={unit}>{t(`simpleCampaign.content.followUp.unit.${unit}`)}</option>
            ))}
          </select>
        </div>
        <span className="text-sm text-slate-600 dark:text-dk-text2">{t('simpleCampaign.content.followUp.afterPrev')}</span>
      </div>
      {delayInvalid && (
        <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400" data-testid={`simple-followup-delay-error-${index}`}>
          {t('simpleCampaign.content.followUp.delayInvalid')}
        </p>
      )}
      <MessageEditor
        channel={channel}
        content={item.content}
        patchContent={(patch) => patchFollowUpContent(item.id, patch)}
        t={t}
        idPrefix={idPrefix}
        cardTestIdPrefix={`simple-followup-${index}-content`}
      />
    </section>
  );
}

/**
 * Bước 3 — "Bạn muốn gửi nội dung gì?": dùng mẫu có sẵn hoặc tự soạn.
 * Chữ tự soạn được server lưu thành mẫu tin (bộ chạy chỉ gửi bước có `templateId` số). v1 chưa có "Nhờ AI viết".
 *
 * @param {object} props
 * @param {object} props.wizard kết quả `useSimpleCampaignWizard`
 * @param {(key: string, params?: object) => string} props.t
 */
export default function ContentStep({ wizard, t }) {
  const { state, patchContent, addFollowUp } = wizard;
  const { channel, content } = state;
  const followUps = Array.isArray(state.followUps) ? state.followUps : [];
  const canAdd = followUps.length < MAX_FOLLOW_UPS;

  return (
    <div>
      <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-dk-text sm:text-2xl">{t('simpleCampaign.content.title')}</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-dk-text2">{t('simpleCampaign.content.hint')}</p>

      {followUps.length > 0 && (
        <h3 className="mt-5 text-base font-bold text-slate-900 dark:text-dk-text">{t('simpleCampaign.content.followUp.firstTitle')}</h3>
      )}
      <MessageEditor
        channel={channel}
        content={content}
        patchContent={patchContent}
        t={t}
        idPrefix="simple-content"
        cardTestIdPrefix="simple-content"
      />

      {followUps.map((item, index) => (
        <FollowUpCard key={item.id} wizard={wizard} channel={channel} item={item} index={index} t={t} />
      ))}

      <div className="mt-5">
        <button
          type="button"
          onClick={addFollowUp}
          disabled={!canAdd}
          data-testid="simple-followup-add"
          className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-orange-400 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dk-border dark:text-dk-text dark:hover:border-orange-400"
        >
          <HiOutlinePlus className="h-4 w-4" aria-hidden="true" />
          {t('simpleCampaign.content.followUp.add')}
        </button>
        {!canAdd && (
          <p className="mt-1 text-xs text-slate-500 dark:text-dk-text2" data-testid="simple-followup-max">{t('simpleCampaign.content.followUp.max', { max: MAX_FOLLOW_UPS + 1 })}</p>
        )}
      </div>
    </div>
  );
}
