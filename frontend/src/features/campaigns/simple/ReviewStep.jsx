import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { HiOutlineExclamationCircle } from 'react-icons/hi';
import CampaignEstimatePanel from '../components/CampaignEstimatePanel';
import { describeIssue } from './simpleCampaign.helpers';
import { buildReviewSummary } from './simpleCampaign.summary';

/** Ghép chuỗi có `**in đậm**` thành các phần tử — không dùng dangerouslySetInnerHTML vì có tên do người dùng đặt. */
function RichSummary({ text }) {
  return (
    <>
      {String(text).split('**').map((part, index) => (
        index % 2 === 1
          ? <strong key={index} className="font-bold text-slate-900 dark:text-dk-text">{part}</strong>
          : <span key={index}>{part}</span>
      ))}
    </>
  );
}

/**
 * Bước 5 — "Xem lại": một câu tóm tắt, rồi kết quả kiểm tra của server (`preview`: lỗi cần sửa, ước tính, số người nhận),
 * ô tên chiến dịch. Nút "Bắt đầu gửi" nằm ở chân trang (SimpleCampaignWizard) và bị khoá khi server nói `readyToCreate=false`.
 *
 * @param {object} props
 * @param {object} props.wizard kết quả `useSimpleCampaignWizard`
 * @param {(key: string, params?: object) => string} props.t
 * @param {string} props.locale
 */
export default function ReviewStep({ wizard, t, locale }) {
  const { state, preview, submitState, loadPreview, invalidatePreview, setCampaignName } = wizard;

  useEffect(() => {
    loadPreview();
    return () => invalidatePreview();
  }, [loadPreview, invalidatePreview]);

  const data = preview.status === 'ready' ? preview.data : null;
  // Server gắn `severity` cho từng issue ('blocking' | 'warning'); issue không có nhãn coi là chặn khi chiến dịch chưa gửi được.
  const isWarning = (issue) => typeof issue === 'object' && issue?.severity === 'warning';
  const blockingIssues = data && !data.readyToCreate ? data.issues.filter((issue) => !isWarning(issue)) : [];
  const warnings = data ? data.issues.filter((issue) => (data.readyToCreate ? true : isWarning(issue))) : [];
  const summary = buildReviewSummary({ state, preview: data, t, locale });
  // Hết hạn mức tạo chiến dịch: "quay lại sửa" không giải quyết được — gợi ý xoá bớt chiến dịch cũ hoặc nâng cấp gói.
  const limitReached = blockingIssues.some((issue) => issue?.code === 'campaign_limit_reached');

  return (
    <div>
      <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-dk-text sm:text-2xl">{t('simpleCampaign.review.title')}</h2>

      <p className="mt-4 rounded-2xl border border-orange-200 bg-orange-50/70 p-4 text-base leading-relaxed text-slate-700 dark:border-orange-500/30 dark:bg-orange-950/30 dark:text-dk-text" data-testid="simple-summary">
        <RichSummary text={summary} />
      </p>

      <div className="mt-4 space-y-3" aria-live="polite">
        {preview.status === 'loading' && (
          <p className="text-sm text-slate-500 dark:text-dk-text2" role="status" data-testid="simple-preview-loading">{t('simpleCampaign.review.checking')}</p>
        )}

        {preview.status === 'error' && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200" role="alert" data-testid="simple-preview-error">
            <p className="flex items-start gap-2 font-semibold">
              <HiOutlineExclamationCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <span>{preview.message || t('simpleCampaign.review.checkFailed')}</span>
            </p>
            <button type="button" onClick={loadPreview} className="mt-2 font-semibold underline">{t('simpleCampaign.review.checkAgain')}</button>
          </div>
        )}

        {data && !data.readyToCreate && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200" role="alert" data-testid="simple-preview-blocked">
            <p className="font-semibold">{t('simpleCampaign.review.cannotSend')}</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {blockingIssues.length > 0
                ? blockingIssues.map((issue, index) => <li key={index}>{describeIssue(issue, t)}</li>)
                : <li>{t('simpleCampaign.review.notReady')}</li>}
            </ul>
            {limitReached ? (
              <p className="mt-2 text-xs" data-testid="simple-limit-hint">
                {t('simpleCampaign.review.limitHint')}{' '}
                <Link to="/app/campaigns" className="font-semibold underline">{t('simpleCampaign.review.openCampaignList')}</Link>
              </p>
            ) : (
              <p className="mt-2 text-xs">{t('simpleCampaign.review.fixHint')}</p>
            )}
          </div>
        )}

        {warnings.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200" data-testid="simple-preview-warnings">
            <p className="font-semibold">{t('simpleCampaign.review.notes')}</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {warnings.map((issue, index) => (
                <li key={index}>{describeIssue(issue, t)}</li>
              ))}
            </ul>
          </div>
        )}

        {data && data.readyToCreate && data.recipientCount === 0 && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200" data-testid="simple-preview-empty">
            {t('simpleCampaign.review.emptyList')}
          </p>
        )}

        {data?.estimate && <CampaignEstimatePanel status="ready" estimate={data.estimate} t={t} />}
      </div>

      <div className="mt-5">
        <label htmlFor="simple-campaign-name" className="block text-sm font-semibold text-slate-800 dark:text-dk-text">
          {t('simpleCampaign.review.nameLabel')}
        </label>
        <input
          id="simple-campaign-name"
          type="text"
          maxLength={200}
          value={state.campaignName}
          onChange={(event) => setCampaignName(event.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 hover:bg-white focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 dark:border-dk-border dark:bg-dk-inset dark:text-dk-text dark:placeholder:text-dk-muted dark:hover:bg-dk-surface dark:focus:bg-dk-inset"
        />
      </div>

      {submitState.status === 'error' && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200" role="alert" data-testid="simple-submit-error">
          <p className="flex items-start gap-2 font-semibold">
            <HiOutlineExclamationCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <span>{submitState.message}</span>
          </p>
          {submitState.stage === 'run' && <p className="mt-2 text-xs">{t('simpleCampaign.review.runHint')}</p>}
        </div>
      )}
    </div>
  );
}
