import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiOutlineArrowLeft } from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import { useChannelAvailability } from '../../../hooks/queries/useChannelAvailability';
import ChannelUnavailableModal from '../../../components/common/ChannelUnavailableModal';
import SimpleStepper from './SimpleStepper';
import ChannelStep from './ChannelStep';
import AudienceStep from './AudienceStep';
import ContentStep from './ContentStep';
import WhenStep from './WhenStep';
import ReviewStep from './ReviewStep';
import SimpleReadOnlyView from './SimpleReadOnlyView';
import { ApprovalScreen, DoneScreen, ScheduledScreen } from './ResultScreens';
import { getAvailableWhenOptions, isScheduleBased } from './simpleCampaign.helpers';

const PRIMARY_BUTTON =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-3 text-sm font-bold text-white shadow-md shadow-orange-500/20 hover:from-orange-600 hover:to-amber-600 disabled:cursor-not-allowed disabled:opacity-50';
const OUTLINE_BUTTON =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-orange-300 bg-white px-5 py-3 text-sm font-bold text-orange-700 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-orange-500/40 dark:bg-dk-surface dark:text-orange-300 dark:hover:bg-orange-950/30';

/**
 * Vỏ của trình "Tạo chiến dịch từng bước": thanh tiến trình, bước hiện tại, chân trang Quay lại / Tiếp tục
 * (bước cuối: Bắt đầu gửi) và hai màn kết quả. Logic nằm ở `useSimpleCampaignWizard` (trang gọi hook rồi truyền vào), từng bước ở tệp riêng.
 *
 * CHẾ ĐỘ SỬA (`wizard.isEdit`): chờ nạp từ server → điền sẵn; thanh bước nhảy tự do; bước cuối là "Lưu thay đổi" (+ hai nút phụ
 * "Lưu và gửi ngay" / "Lưu và tự động gửi cho người mới"); chiến dịch không sửa được ở đây thì chỉ xem (`SimpleReadOnlyView`).
 *
 * @param {object} props
 * @param {object} props.wizard kết quả `useSimpleCampaignWizard`
 * @param {{ canSave?: boolean, canRun?: boolean }} [props.permissions] chế độ sửa: có quyền lưu (campaigns_create) / chạy (campaigns_run)
 * @param {() => void} [props.onOpenBuilder] chế độ sửa: nút "Mở Sơ đồ khối để sửa" của màn chỉ xem
 */
export default function SimpleCampaignWizard({ wizard, permissions = {}, onOpenBuilder }) {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const canSave = permissions.canSave !== false;
  const canRun = permissions.canRun !== false;
  // ignoreQuota: chỗ DỰNG chiến dịch không khoá vì hết lượt kỳ này (backend chặn lúc gửi) — như modal tạo chiến dịch.
  const availability = useChannelAvailability({ ignoreQuota: true });
  const [lockedChannel, setLockedChannel] = useState(null);
  const stepRef = useRef(null);
  const isFirstRenderRef = useRef(true);

  const { stepId, phase, state, canContinue, canStart, submitState, isEdit } = wizard;

  // Đổi bước thì đưa tiêu đề bước mới vào tầm nhìn/tiêu điểm (người dùng bàn phím và trình đọc màn hình không bị bỏ lại bước cũ).
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    stepRef.current?.focus?.({ preventScroll: false });
  }, [stepId, phase]);

  if (isEdit && wizard.editLoad.status === 'loading') {
    return (
      <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-dk-border dark:bg-dk-surface dark:text-dk-text2" role="status" data-testid="simple-edit-loading">
        {t('simpleCampaign.edit.loading')}
      </p>
    );
  }
  if (isEdit && wizard.editLoad.status === 'error') {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200" role="alert" data-testid="simple-edit-load-error">
        <p className="font-semibold">{wizard.editLoad.message || t('simpleCampaign.edit.loadFailed')}</p>
        <button type="button" onClick={() => wizard.loadEdit()} className="mt-2 font-semibold underline">{t('simpleCampaign.retry')}</button>
      </div>
    );
  }
  const onBackToCampaign = isEdit ? wizard.backToCampaign : undefined;
  if (phase === 'done' && wizard.result) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-dk-border dark:bg-dk-surface sm:p-8">
        <div ref={stepRef} tabIndex={-1} className="outline-none">
          <DoneScreen result={wizard.result} onCreateAnother={isEdit ? undefined : wizard.reset} onBackToCampaign={onBackToCampaign} t={t} />
        </div>
      </div>
    );
  }
  if (phase === 'scheduled' && wizard.result) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-dk-border dark:bg-dk-surface sm:p-8">
        <div ref={stepRef} tabIndex={-1} className="outline-none">
          <ScheduledScreen result={wizard.result} onCreateAnother={wizard.reset} t={t} />
        </div>
      </div>
    );
  }
  if (phase === 'approval' && wizard.result) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-dk-border dark:bg-dk-surface sm:p-8">
        <div ref={stepRef} tabIndex={-1} className="outline-none">
          <ApprovalScreen result={wizard.result} onCreateAnother={isEdit ? undefined : wizard.reset} onBackToCampaign={onBackToCampaign} t={t} />
        </div>
      </div>
    );
  }

  if (isEdit && (wizard.isReadOnly || !canSave)) {
    return <SimpleReadOnlyView wizard={wizard} canOpenBuilder={canSave} onOpenBuilder={onOpenBuilder} t={t} locale={locale} />;
  }

  const handleBack = () => {
    if (!wizard.goBack()) navigate('/app/campaigns');
  };

  const needsKey = stepId === 'audience' && state.channel === 'zalo_group' ? 'audienceGroups' : stepId;
  const isSubmitting = submitState.status === 'submitting';
  const scheduleBased = isScheduleBased(state.schedule);

  return (
    <div className="space-y-5">
      <SimpleStepper currentStepId={stepId} onSelectStep={wizard.goToStep} freeJump={isEdit} t={t} />

      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-dk-border dark:bg-dk-surface sm:p-6">
        <div ref={stepRef} tabIndex={-1} className="outline-none" data-testid={`simple-step-body-${stepId}`}>
          {stepId === 'channel' && (
            <ChannelStep wizard={wizard} availability={availability} onLockedClick={setLockedChannel} t={t} />
          )}
          {stepId === 'audience' && <AudienceStep wizard={wizard} t={t} locale={locale} />}
          {stepId === 'content' && <ContentStep wizard={wizard} t={t} />}
          {stepId === 'when' && <WhenStep wizard={wizard} t={t} />}
          {stepId === 'review' && <ReviewStep wizard={wizard} t={t} locale={locale} />}
        </div>

        <div className="mt-8 flex flex-col-reverse items-stretch gap-3 border-t border-slate-100 pt-5 dark:border-dk-border/80 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={handleBack}
            disabled={isSubmitting}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-dk-border dark:bg-dk-surface dark:text-dk-text dark:hover:bg-dk-raised"
            data-testid="simple-back"
          >
            <HiOutlineArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t('simpleCampaign.nav.back')}
          </button>

          <div className="flex flex-col items-stretch gap-1 sm:items-end">
            {stepId === 'review' && isEdit ? (
              <EditSaveActions wizard={wizard} canRun={canRun} t={t} isSubmitting={isSubmitting} />
            ) : stepId === 'review' ? (
              <button
                type="button"
                onClick={wizard.submit}
                disabled={!canStart}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-3 text-sm font-bold text-white shadow-md shadow-orange-500/20 hover:from-orange-600 hover:to-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="simple-start"
              >
                {isSubmitting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />}
                {isSubmitting
                  ? t(scheduleBased ? 'simpleCampaign.nav.scheduling' : 'simpleCampaign.nav.starting')
                  : t(scheduleBased ? 'simpleCampaign.nav.schedule' : 'simpleCampaign.nav.start')}
              </button>
            ) : (
              <button
                type="button"
                onClick={wizard.goNext}
                disabled={!canContinue}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-3 text-sm font-bold text-white shadow-md shadow-orange-500/20 hover:from-orange-600 hover:to-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="simple-next"
              >
                {t('simpleCampaign.nav.next')}
              </button>
            )}
            {isEdit && stepId === 'review' && wizard.incompleteStepId && (
              <p className="text-xs text-amber-700 dark:text-amber-300 sm:text-right" role="alert" data-testid="simple-edit-incomplete">
                {t('simpleCampaign.edit.stepIncomplete', { step: t(`simpleCampaign.steps.${wizard.incompleteStepId}`) })}
              </p>
            )}
            {isEdit && stepId === 'review' && !wizard.isDirty && !wizard.incompleteStepId && wizard.savedAt && (
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 sm:text-right" role="status" data-testid="simple-edit-saved">
                {t('simpleCampaign.edit.saved')}
              </p>
            )}
            {stepId !== 'review' && !canContinue && (
              <p className="text-xs text-slate-500 dark:text-dk-text2 sm:text-right" data-testid="simple-needs">
                {t(`simpleCampaign.needs.${needsKey}`)}
              </p>
            )}
          </div>
        </div>
      </div>

      {lockedChannel && (
        <ChannelUnavailableModal
          channel={lockedChannel}
          info={availability[lockedChannel]}
          onClose={() => setLockedChannel(null)}
        />
      )}
    </div>
  );
}

/**
 * Nút ở bước cuối của chế độ sửa: chính = "Lưu thay đổi" (chỉ khi có thay đổi); phụ = "Lưu và gửi ngay" /
 * "Lưu và tự động gửi cho người mới" (hành động chạy, cần quyền chạy chiến dịch; nút sau chỉ hiện khi nguồn người nhận cho phép).
 */
function EditSaveActions({ wizard, canRun, isSubmitting, t }) {
  const { canSaveEdit, isDirty, saveEdit } = wizard;
  const continuousOk = getAvailableWhenOptions(wizard.state).includes('continuous');
  return (
    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
      {canRun && continuousOk && (
        <button type="button" onClick={() => saveEdit('continuous')} disabled={!canSaveEdit} className={OUTLINE_BUTTON} data-testid="simple-edit-save-continuous">
          {t('simpleCampaign.edit.saveAndContinuous')}
        </button>
      )}
      {canRun && (
        <button type="button" onClick={() => saveEdit('run')} disabled={!canSaveEdit} className={OUTLINE_BUTTON} data-testid="simple-edit-save-run">
          {t('simpleCampaign.edit.saveAndRun')}
        </button>
      )}
      <button type="button" onClick={() => saveEdit('save')} disabled={!canSaveEdit || !isDirty} className={PRIMARY_BUTTON} data-testid="simple-edit-save">
        {isSubmitting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />}
        {isSubmitting ? t('simpleCampaign.edit.saving') : t('simpleCampaign.edit.save')}
      </button>
    </div>
  );
}
