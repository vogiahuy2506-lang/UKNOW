import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiOutlineArrowLeft } from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import { useChannelAvailability } from '../../../hooks/queries/useChannelAvailability';
import campaignApiService from '../services/campaignApi.service';
import ChannelUnavailableModal from '../../../components/common/ChannelUnavailableModal';
import SimpleStepper from './SimpleStepper';
import ChannelStep from './ChannelStep';
import AudienceStep from './AudienceStep';
import ContentStep from './ContentStep';
import WhenStep from './WhenStep';
import ReviewStep from './ReviewStep';
import { ApprovalScreen, DoneScreen, ScheduledScreen } from './ResultScreens';
import { isGroupAudienceType, isScheduleBased } from './simpleCampaign.helpers';

/**
 * Vỏ của trình "Tạo chiến dịch từng bước": thanh tiến trình, bước hiện tại, chân trang Quay lại / Tiếp tục
 * (bước cuối: Bắt đầu gửi) và hai màn kết quả. Logic nằm ở `useSimpleCampaignWizard` (trang gọi hook rồi truyền vào), từng bước ở tệp riêng.
 *
 * @param {object} props
 * @param {object} props.wizard kết quả `useSimpleCampaignWizard`
 */
export default function SimpleCampaignWizard({ wizard }) {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  // ignoreQuota: chỗ DỰNG chiến dịch không khoá vì hết lượt kỳ này (backend chặn lúc gửi) — như modal tạo chiến dịch.
  // fetchAdapterChannels: đường dự phòng khi backend cũ chưa trả danh sách kênh adapter (Telegram/WhatsApp) đang bật — như trang Chiến dịch.
  const availability = useChannelAvailability({ ignoreQuota: true, fetchAdapterChannels: () => campaignApiService.getChannels() });
  const [lockedChannel, setLockedChannel] = useState(null);
  const stepRef = useRef(null);
  const isFirstRenderRef = useRef(true);

  const { stepId, phase, state, canContinue, canStart, submitState } = wizard;

  // Đổi bước thì đưa tiêu đề bước mới vào tầm nhìn/tiêu điểm (người dùng bàn phím và trình đọc màn hình không bị bỏ lại bước cũ).
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    stepRef.current?.focus?.({ preventScroll: false });
  }, [stepId, phase]);

  if (phase === 'done' && wizard.result) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-dk-border dark:bg-dk-surface sm:p-8">
        <div ref={stepRef} tabIndex={-1} className="outline-none focus:outline-none focus-visible:outline-none">
          <DoneScreen result={wizard.result} onCreateAnother={wizard.reset} t={t} />
        </div>
      </div>
    );
  }
  if (phase === 'scheduled' && wizard.result) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-dk-border dark:bg-dk-surface sm:p-8">
        <div ref={stepRef} tabIndex={-1} className="outline-none focus:outline-none focus-visible:outline-none">
          <ScheduledScreen result={wizard.result} onCreateAnother={wizard.reset} t={t} />
        </div>
      </div>
    );
  }
  if (phase === 'approval' && wizard.result) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-dk-border dark:bg-dk-surface sm:p-8">
        <div ref={stepRef} tabIndex={-1} className="outline-none focus:outline-none focus-visible:outline-none">
          <ApprovalScreen result={wizard.result} onCreateAnother={wizard.reset} t={t} />
        </div>
      </div>
    );
  }

  const handleBack = () => {
    if (!wizard.goBack()) navigate('/app/campaigns');
  };

  const needsKey = stepId === 'audience' && isGroupAudienceType(state.audience.type) ? 'audienceGroups' : stepId;
  const isSubmitting = submitState.status === 'submitting';
  const scheduleBased = isScheduleBased(state.schedule);

  return (
    <div className="space-y-5">
      <SimpleStepper currentStepId={stepId} onSelectStep={wizard.goToStep} t={t} />

      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-dk-border dark:bg-dk-surface sm:p-6">
        <div ref={stepRef} tabIndex={-1} className="outline-none focus:outline-none focus-visible:outline-none" data-testid={`simple-step-body-${stepId}`}>
          {stepId === 'channel' && (
            <ChannelStep wizard={wizard} availability={availability} onLockedClick={setLockedChannel} t={t} locale={locale} />
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
            {stepId === 'review' ? (
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
