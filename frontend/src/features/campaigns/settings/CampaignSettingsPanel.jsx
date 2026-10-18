import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineCalendar,
  HiOutlineClock,
  HiOutlinePencil,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineViewGrid,
} from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import { getCampaignTypeMeta } from '../../../utils/campaignTypeDisplay';
import { getAllNodeConfigs } from '../components/CampaignBuilderFlowNodes';
import CampaignEstimatePanel from '../components/CampaignEstimatePanel';
import { ConfirmModal } from '../components/CampaignBuilderLayout';
import NodeConfigModal from '../components/NodeConfigModal';
import { isNodeConfigFormUnchanged } from '../utils/nodeConfigUnchanged';
import { getAllowedDataNodeTypesByCampaignType } from '../utils/campaignBuilderFlow';
import SenderAccountList from '../simple/SenderAccountList';
import { AUDIENCE_TYPES_BY_CHANNEL } from '../simple/simpleCampaign.helpers';
import useCampaignEstimate from '../hooks/useCampaignEstimate';
import { buildEstimateView, describeEstimateDuration, formatEstimateDateTime } from '../utils/campaignEstimate.helpers';
import { formatCampaignDateTime } from '../utils/campaignDateTime.helpers';
import buildSettingsOrder from './buildSettingsOrder';
import { emailAccountText, pickDefaultEmailAccount } from './describeNodeSettings';
import { resolveSectionForRole } from './resolveEditSection';
import { formatVnDayMonthTime, formatVnResumeTime, getWaitReasonI18nKey } from '../utils/deliveryMonitor.helpers';
import useCampaignLatestRun from './useCampaignLatestRun';
import useRunRemainingEstimate from './useRunRemainingEstimate';
import useSettingsAccountLookups from './useSettingsAccountLookups';
import SettingsSectionCard, { CARD, MUTED } from './SettingsSectionCard';
import SenderSectionForm, { SENDER_LOAD_OPTIONS } from './SenderSectionForm';
import AudienceSectionForm from './AudienceSectionForm';
import ContentSectionForm from './ContentSectionForm';
import TagStepForm from './TagStepForm';
import { buildAudienceGraph, countMissingSections, readSettingsSections, writeAudience, writeContent, writeSender, writeTagStep } from './sections';
import { resolveCustomSteps } from './sections/contentTemplates';
import {
  ADDABLE_SIDE_STEP_SUBTYPES,
  analyzeSettingsGraph,
  appendSideStep,
  findChainRoles,
  getSendSubtypeFor,
  getSkeletonAudienceTypes,
  removeSideStep,
  resolveCampaignChannel,
} from './settingsGraph';

const STATUS_CLASS = {
  active: 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-300',
  paused: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/60 dark:text-yellow-300',
};
const STATUS_DEFAULT_CLASS = 'bg-gray-100 text-gray-700 dark:bg-dk-raised dark:text-dk-text';

const subtypeOf = (node) => String(node?.data?.nodeType || node?.type || '');

/** Dòng "Còn lại" của lượt đang chạy (hoặc "tự chạy liên tục" với chế độ continuous). */
const RunningEstimate = ({ runId, t }) => {
  const { status, continuous, view } = useRunRemainingEstimate(runId);
  if (status === 'loading') {
    return <p className={`text-sm ${MUTED}`} data-testid="settings-run-estimate-loading">{t('campaignEstimate.loading')}</p>;
  }
  if (continuous) {
    return <p className="text-sm text-gray-800 dark:text-dk-text" data-testid="settings-run-estimate-continuous">{t('userDeliveryMonitor.estimate.continuous')}</p>;
  }
  if (!view || !view.finishAtLatest) {
    return <p className={`text-sm ${MUTED}`} data-testid="settings-run-estimate-unavailable">{t('campaignEstimate.unavailable')}</p>;
  }
  const duration = describeEstimateDuration(new Date(), view.finishAtLatest);
  return (
    <p className="text-sm text-gray-800 dark:text-dk-text" data-testid="settings-run-estimate">
      {t('userDeliveryMonitor.estimate.finish', {
        time: formatEstimateDateTime(view.finishAtLatest),
        duration: duration ? t(`campaignEstimate.duration.${duration.unit}`, { value: duration.value }) : '',
      })}
    </p>
  );
};

const KNOWN_RUN_STATUSES = ['running', 'completed', 'stopped', 'failed'];

/**
 * Mục "Lần chạy gần nhất": trạng thái, lúc bắt đầu, đã gửi / chưa gửi được / dự kiến. Số lấy từ
 * `GET /delivery-monitor/campaigns/:id/latest-run` (backend đếm qua sendStats) — KHÔNG đọc campaign_runs.successful_sends/failed_sends.
 */
const LatestRun = ({ campaignId, refreshKey, onOpenDeliveryMonitor, t }) => {
  const { status, run } = useCampaignLatestRun(campaignId, refreshKey);
  if (status === 'idle' || status === 'loading') {
    return <p className={`text-sm ${MUTED}`} data-testid="settings-latest-run-loading">{t('campaignSettings.latestRun.loading')}</p>;
  }
  if (status === 'error') {
    return <p className={`text-sm ${MUTED}`} data-testid="settings-latest-run-error">{t('campaignSettings.latestRun.unavailable')}</p>;
  }
  if (!run) {
    return <p className="text-sm text-gray-800 dark:text-dk-text" data-testid="settings-latest-run-none">{t('campaignSettings.latestRun.none')}</p>;
  }
  const runStatus = String(run.status || '').toLowerCase();
  const statusText = run.waitingUntil
    ? t('userDeliveryMonitor.runStatus.waiting', {
      reason: t(getWaitReasonI18nKey(run.waitingReason)),
      time: formatVnResumeTime(run.waitingUntil),
    })
    : (KNOWN_RUN_STATUSES.includes(runStatus) ? t(`userDeliveryMonitor.runStatus.${runStatus}`) : (run.status || '-'));
  return (
    <div className="space-y-1" data-testid="settings-latest-run">
      <p className="font-medium text-gray-900 dark:text-dk-text" data-testid="settings-latest-run-status">{statusText}</p>
      <p className={`text-xs ${MUTED}`}>{t('campaignSettings.latestRun.startedAt', { time: formatVnDayMonthTime(run.startedAt) })}</p>
      <p className="text-sm text-gray-800 dark:text-dk-text" data-testid="settings-latest-run-counts">
        {run.planned != null
          ? t('campaignSettings.latestRun.sentOfPlanned', { sent: run.sent, planned: run.planned })
          : t('campaignSettings.latestRun.sentOnly', { sent: run.sent })}
        {' · '}
        {t('campaignSettings.latestRun.failed', { failed: run.failed })}
      </p>
      <a
        href="/app/delivery-monitor"
        onClick={(event) => {
          event.preventDefault();
          onOpenDeliveryMonitor();
        }}
        data-testid="settings-latest-run-link"
        className="inline-block text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
      >
        {t('campaignSettings.latestRun.viewDetail')}
      </a>
    </div>
  );
};

/** Ước tính của bản ĐÃ LƯU (chiến dịch không chạy) + dòng cảnh báo khi đang có thay đổi chưa lưu. */
const SavedEstimate = ({ campaignId, isDirty, refreshKey, t }) => {
  const { status, estimate } = useCampaignEstimate({ campaignId, enabled: true, refreshKey });
  // Ước tính có hình dạng đúng nhưng không có gì để nói (không đếm được người nhận, không cảnh báo) thì CampaignEstimatePanel chỉ
  // còn mỗi tiêu đề — nói thẳng "chưa ước tính được" thay vì một khung trống.
  const view = status === 'ready' ? buildEstimateView(estimate) : null;
  const hasContent = Boolean(view) && ((Boolean(view.finishAtLatest) && view.totalActions > 0) || view.warnings.length > 0);
  const panelStatus = status === 'ready' && !hasContent ? 'error' : status;
  return (
    <div className="space-y-2">
      {isDirty && (
        <p className="text-xs text-amber-700 dark:text-amber-300" data-testid="settings-estimate-dirty">
          {t('campaignSettings.estimateDirty')}
        </p>
      )}
      <CampaignEstimatePanel status={panelStatus} estimate={estimate} t={t} />
    </div>
  );
};

const OverviewCard = ({
  campaignId,
  campaignName,
  campaignType,
  campaignStatus,
  isNewCampaign,
  isDirty,
  lastSavedTime,
  hasNodes,
  runningRunId,
  latestRunKey,
  onOpenDeliveryMonitor,
  schedules,
  describeSchedule,
  onOpenSchedule,
  onManageSchedules,
  canEdit,
  t,
}) => {
  const typeMeta = getCampaignTypeMeta(campaignType);
  const statusKey = campaignStatus === 'active' ? 'active' : campaignStatus === 'paused' ? 'paused' : 'draft';
  return (
    <section className={`${CARD} order-2 p-4 sm:p-5 lg:order-none lg:sticky lg:top-0`} data-testid="settings-overview">
      <h2 className="text-base font-bold text-gray-900 dark:text-dk-text">{t('campaignSettings.overview')}</h2>
      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-y-2">
        <dt className={MUTED}>{t('campaignSettings.label.name')}</dt>
        <dd className="min-w-0 break-words font-medium text-gray-900 dark:text-dk-text" data-testid="settings-overview-name">
          {campaignName || t('campaignBuilder.newCampaign')}
        </dd>
        <dt className={MUTED}>{t('campaignSettings.label.channel')}</dt>
        <dd>
          <span className={`rounded border px-2 py-0.5 text-xs font-medium ${typeMeta.className}`}>{typeMeta.label}</span>
        </dd>
        <dt className={MUTED}>{t('campaignSettings.label.status')}</dt>
        <dd className="flex flex-wrap items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[statusKey] || STATUS_DEFAULT_CLASS}`}>
            {t(`campaignBuilder.${statusKey}`)}
          </span>
          {isDirty ? (
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">{t('campaignBuilder.unsaved')}</span>
          ) : lastSavedTime ? (
            <span className={`text-xs ${MUTED}`}>{t('campaignSettings.savedAt', { time: formatCampaignDateTime(lastSavedTime) })}</span>
          ) : null}
        </dd>

        <dt className={MUTED}>{t('campaignSettings.label.schedule')}</dt>
        <dd className="min-w-0 space-y-2" data-testid="settings-overview-schedule">
          {isNewCampaign ? (
            <p className={MUTED}>{t('campaignBuilder.saveCampaignFirst')}</p>
          ) : (
            <>
              {schedules.length === 0 ? (
                <p className="text-gray-800 dark:text-dk-text" data-testid="settings-no-schedule">{t('campaignSettings.noSchedule')}</p>
              ) : (
                <ul className="space-y-1.5">
                  {schedules.map((schedule) => {
                    const info = describeSchedule(schedule);
                    return (
                      <li key={schedule.id} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1" data-testid="settings-schedule-item">
                        <HiOutlineCalendar className={`h-4 w-4 shrink-0 ${MUTED}`} aria-hidden="true" />
                        <span className="min-w-0 break-words text-gray-900 dark:text-dk-text">{info.pattern}</span>
                        {info.nextRun && (
                          <span className={`text-xs ${MUTED}`}>{t('campaignSettings.nextRun', { time: formatCampaignDateTime(info.nextRun) })}</span>
                        )}
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:bg-dk-raised dark:text-dk-text">{info.statusLabel}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                {canEdit && (
                  <button
                    type="button"
                    onClick={onOpenSchedule}
                    data-testid="settings-open-schedule"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary-50 px-3 py-1.5 text-sm font-medium text-primary-700 hover:bg-primary-100 dark:bg-primary-950/40 dark:text-primary-300 dark:hover:bg-primary-950/70"
                  >
                    <HiOutlineClock className="h-4 w-4" aria-hidden="true" />
                    {t('campaignSettings.scheduleAction')}
                  </button>
                )}
                {schedules.length > 0 && (
                  <button
                    type="button"
                    onClick={onManageSchedules}
                    data-testid="settings-manage-schedules"
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-dk-border dark:text-dk-text dark:hover:bg-dk-raised"
                  >
                    {t('campaignSettings.manageSchedules')}
                  </button>
                )}
              </div>
            </>
          )}
        </dd>

        {!isNewCampaign && (
          <>
            <dt className={MUTED}>{t('campaignSettings.label.latestRun')}</dt>
            <dd className="min-w-0" data-testid="settings-overview-latest-run">
              <LatestRun campaignId={campaignId} refreshKey={latestRunKey} onOpenDeliveryMonitor={onOpenDeliveryMonitor} t={t} />
            </dd>
          </>
        )}

        {!isNewCampaign && hasNodes && (
          <>
            <dt className={MUTED}>{runningRunId ? t('campaignSettings.label.remaining') : t('campaignSettings.label.estimate')}</dt>
            <dd className="min-w-0" data-testid="settings-overview-estimate">
              {runningRunId
                ? <RunningEstimate runId={runningRunId} t={t} />
                : <SavedEstimate campaignId={campaignId} isDirty={isDirty} refreshKey={lastSavedTime} t={t} />}
            </dd>
          </>
        )}
      </dl>
    </section>
  );
};

/** Dòng trạng thái đầu cột phải: còn bao nhiêu mục cần điền trước khi chạy. */
const StatusLine = ({ missingCount, t }) => (
  <section className={`${CARD} min-w-0 p-4 sm:p-5`} data-testid="settings-status" data-missing-count={missingCount} aria-label={t('campaignSettings.checklist.title')}>
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 className="text-base font-bold text-gray-900 dark:text-dk-text">{t('campaignSettings.checklist.title')}</h2>
      <p
        className={`text-sm font-medium ${missingCount > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-green-700 dark:text-green-400'}`}
        data-testid="settings-status-summary"
      >
        {missingCount > 0 ? t('campaignSettings.checklist.remaining', { n: missingCount }) : t('campaignSettings.checklist.ready')}
      </p>
    </div>
  </section>
);

/** Dải báo sơ đồ có rẽ nhánh: nội dung vẫn sửa ở đây, cách nối các bước sửa ở Sơ đồ khối. */
const BranchBanner = ({ onGoFlow, t }) => (
  <section
    className="flex min-w-0 flex-col gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-500/40 dark:bg-sky-950/30 sm:flex-row sm:items-center sm:justify-between"
    data-testid="settings-branch-banner"
  >
    <p className="min-w-0 text-sm text-sky-900 dark:text-sky-100">{t('campaignSettings.branched.banner')}</p>
    <button
      type="button"
      onClick={onGoFlow}
      data-testid="settings-branch-go-flow"
      className="shrink-0 rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-sm font-medium text-sky-800 hover:bg-sky-100 dark:border-sky-500/50 dark:bg-dk-surface dark:text-sky-200 dark:hover:bg-dk-raised"
    >
      {t('campaignSettings.branched.goFlow')}
    </button>
  </section>
);

const SMALL_BUTTON = 'inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent dark:border-dk-border dark:text-dk-text dark:hover:bg-dk-raised';

/**
 * Thân mục Nội dung: mỗi khối gửi một nhóm "Tin N: mẫu · nhịp chờ"; Sửa mở biểu mẫu riêng ngay tại nhóm (`renderForm`). Nhóm không sửa được
 * nhanh (chế độ lạ, chữ dựng tay…) chỉ tóm tắt + lý do + "Cài đặt nâng cao".
 */
const ContentBody = ({ items, canEdit, editingNodeId, editLocked, renderForm, onEdit, onAdvanced, t }) => (
  <ul className="space-y-4" data-testid="settings-content-list">
    {items.map((item) => {
      const editing = editingNodeId === item.nodeId && item.editable;
      return (
        <li key={item.nodeId} className="min-w-0" data-testid="settings-content-item" data-node-id={item.nodeId} data-status={item.status} data-editing={editing ? 'true' : 'false'}>
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {items.length > 1 && (
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-dk-text2">
                  {t(`campaignSettings.section.content.send.${item.subtype}`)}
                </p>
              )}
              {!editing && (
                <dl className="space-y-1.5 text-sm">
                  {item.lines.map((line, index) => (
                    <div key={`${line.label}-${index}`} className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:gap-3" data-testid="settings-content-line" data-tone={line.tone}>
                      <dt className={`shrink-0 sm:w-20 ${MUTED}`}>{line.label}</dt>
                      <dd className={`min-w-0 break-words ${line.tone === 'missing' ? 'font-medium text-rose-600 dark:text-rose-400' : 'text-gray-900 dark:text-dk-text'}`}>{line.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
            {canEdit && item.editable && !editing && (
              <button
                type="button"
                onClick={() => onEdit(item.nodeId)}
                disabled={editLocked}
                title={editLocked ? t('campaignSettings.editBusy') : undefined}
                data-testid={`settings-content-edit-${item.nodeId}`}
                className={SMALL_BUTTON}
              >
                <HiOutlinePencil className="h-4 w-4" aria-hidden="true" />
                {t('campaignSettings.section.edit')}
              </button>
            )}
          </div>
          {editing && <div className="mt-2 min-w-0">{renderForm(item)}</div>}
          {!editing && !item.editable && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="settings-content-not-editable">
              <p className={`text-xs ${MUTED}`}>{t(`campaignSettings.content.notEditable.${item.reasonIfNotEditable}`)}</p>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onAdvanced(item.nodeId)}
                  disabled={editLocked}
                  data-testid={`settings-content-advanced-${item.nodeId}`}
                  className="text-xs font-medium text-primary-600 hover:underline disabled:opacity-50 dark:text-primary-400"
                >
                  {t('campaignSettings.section.advanced')}
                </button>
              )}
            </div>
          )}
        </li>
      );
    })}
  </ul>
);

/** Thân mục Sau khi gửi: các bước phụ (Sửa tạm mở hộp cài đặt, Xoá) + "+ Thêm bước sau khi gửi". */
const AfterBody = ({ items, canEdit, canAdd, branched, locked, lockTitle, addMenuOpen, addOptions, onToggleAdd, onPickAdd, onEdit, onRemove, editingNodeId, renderTagForm, t }) => (
  <div className="space-y-3" data-testid="settings-after-body">
    {items.length > 0 && (
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.nodeId} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1" data-testid="settings-after-item" data-node-id={item.nodeId} data-status={item.status}>
            <span className="min-w-0 flex-1 basis-40 break-words text-sm">
              <span className="font-medium text-gray-900 dark:text-dk-text">{item.title}</span>
              <span className={`ml-2 ${item.status === 'missing' ? 'font-medium text-rose-600 dark:text-rose-400' : MUTED}`}>{item.summary}</span>
              {item.notRun && (
                <span className="mt-1 block text-xs text-amber-700 dark:text-amber-300" data-testid="settings-after-not-run">
                  {t('campaignSettings.section.after.notRun')}
                </span>
              )}
            </span>
            {canEdit && (
              <span className="flex shrink-0 gap-2">
                <button type="button" onClick={() => onEdit(item)} disabled={locked} title={locked ? lockTitle : undefined} data-testid={`settings-after-edit-${item.nodeId}`} className={SMALL_BUTTON}>
                  <HiOutlinePencil className="h-4 w-4" aria-hidden="true" />
                  {t('campaignSettings.section.edit')}
                </button>
                {item.removable && (
                  <button
                    type="button"
                    onClick={() => onRemove(item.nodeId)}
                    disabled={locked}
                    title={locked ? lockTitle : undefined}
                    data-testid={`settings-remove-${item.nodeId}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent dark:border-rose-500/40 dark:text-rose-400 dark:hover:bg-rose-950/30"
                  >
                    <HiOutlineTrash className="h-4 w-4" aria-hidden="true" />
                    {t('campaignSettings.removeStep.button')}
                  </button>
                )}
              </span>
            )}
            {item.tagValue && editingNodeId === item.nodeId && <div className="mt-1 w-full basis-full min-w-0">{renderTagForm(item)}</div>}
          </li>
        ))}
      </ul>
    )}
    {canEdit && (canAdd || branched) && (
      <div data-testid="settings-add-step">
        <button
          type="button"
          onClick={onToggleAdd}
          disabled={branched || locked}
          title={branched ? t('campaignSettings.addStep.branched') : (locked ? lockTitle : undefined)}
          aria-expanded={addMenuOpen}
          data-testid="settings-add-step-button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent dark:border-dk-border-strong dark:text-dk-text dark:hover:bg-dk-raised"
        >
          <HiOutlinePlus className="h-4 w-4" aria-hidden="true" />
          {t('campaignSettings.addStep.button')}
        </button>
        {branched && <p className={`mt-2 text-xs ${MUTED}`} data-testid="settings-add-step-hint">{t('campaignSettings.addStep.branched')}</p>}
        {addMenuOpen && !branched && !locked && (
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3" data-testid="settings-add-step-menu">
            {addOptions.map((option) => (
              <li key={option.type} className="min-w-0">
                <button
                  type="button"
                  onClick={() => onPickAdd(option.type)}
                  data-testid={`settings-add-step-${option.type}`}
                  className="h-full w-full rounded-lg border border-gray-200 p-3 text-left hover:border-primary-300 hover:bg-gray-50 dark:border-dk-border dark:hover:border-primary-500/60 dark:hover:bg-dk-raised"
                >
                  <span className="block text-sm font-semibold text-gray-900 dark:text-dk-text">{option.title}</span>
                  {option.description && <span className={`mt-0.5 block text-xs ${MUTED}`}>{option.description}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    )}
  </div>
);

/** Nhãn "Gửi từ" của chiến dịch trống: tài khoản đang chọn, hoặc tài khoản email mặc định (chạy thật tự dùng), hoặc nhắc chọn. */
const describeStartSender = ({ channel, sender, emailSettings, t }) => {
  const chosen = String(sender?.label || '').trim() || (sender?.id !== null && sender?.id !== undefined ? String(sender.id) : '');
  if (chosen) return { status: 'ok', summary: chosen };
  const fallback = channel === 'email' ? pickDefaultEmailAccount(emailSettings) : null;
  if (fallback) return { status: 'ok', summary: t('campaignSettings.defaultEmailSender', { sender: emailAccountText(fallback) }) };
  return { status: 'missing', summary: t('campaignSettings.section.sender.chooseBelow') };
};

/**
 * Tab "Thiết lập" của chi tiết chiến dịch: tổng quan (tên, kênh, trạng thái, lịch chạy, ước tính) + năm MỤC có biểu mẫu riêng
 * (Gửi từ · Gửi cho ai · Nội dung · Thời điểm · Sau khi gửi) — PLAN_THIET_LAP_BIEU_MAU_RIENG PR-E1. Mỗi mục đọc/ghi đúng các trường nó hiểu
 * (`sections/`) trên CHÍNH `nodes/edges` của trình dựng, nên Sơ đồ khối thấy ngay; mục không biểu diễn được thì chỉ tóm tắt + "Cài đặt nâng cao".
 * Không còn form khối nhúng, không còn danh sách thẻ khối.
 *
 * @param {object} props
 * @param {(node: object, formData: object) => Promise<void>|void} props.onSaveNode áp cấu hình khối (từ "Cài đặt nâng cao") vào sơ đồ VÀ lưu chiến dịch
 * @param {(nodes: Array<object>, edges: Array<object>) => Promise<void>|void} props.onApplyGraph áp đồ thị MỚI (Lưu ở một mục, thêm / xoá bước phụ)
 *   vào sơ đồ VÀ lưu chiến dịch — một đường lưu duy nhất, cùng đường với `onSaveNode`
 * @param {Set<string>|null} [props.allowedSendNodeTypes] khối gửi dùng được theo gói (kênh khoá → thẻ nguồn mờ + ổ khoá); null = không giới hạn
 * @param {(isDirty: boolean) => void} [props.onInlineDirtyChange] báo trang biết biểu mẫu đang mở có thay đổi chưa lưu (để hỏi khi đổi tab)
 * @param {Array<object>} [props.runLogs] log lần chạy thử (hộp cài đặt nâng cao dùng để gợi ý cột)
 * @param {Function} [props.onCheckSheetConnection] kiểm tra kết nối Google Sheet của hộp cài đặt nâng cao
 * @param {string|number|null} [props.latestRunKey] đổi giá trị (vd id + trạng thái lượt mới nhất) → mục "Lần chạy gần nhất" tải lại
 * @param {() => void} props.onOpenDeliveryMonitor mở trang Giám sát gửi tin
 * @param {() => void} props.onGoFlow chuyển sang tab Sơ đồ khối
 * @param {boolean} [props.canEdit=true] false (chỉ có quyền xem) → ẩn nút Sửa / Lên lịch
 */
export default function CampaignSettingsPanel({
  campaignId = null,
  campaignName = '',
  campaignType = 'email',
  campaignStatus = 'draft',
  isNewCampaign = false,
  isDirty = false,
  lastSavedTime = null,
  nodes = [],
  edges = [],
  emailTemplates = [],
  zaloTemplates = [],
  emailSettings = [],
  runningRunId = null,
  latestRunKey = null,
  onOpenDeliveryMonitor = () => {},
  schedules = [],
  describeSchedule = () => ({ pattern: '', nextRun: null, statusLabel: '' }),
  onOpenSchedule = () => {},
  onManageSchedules = () => {},
  onSaveNode = () => {},
  onApplyGraph = () => {},
  allowedSendNodeTypes = null,
  onInlineDirtyChange = () => {},
  runLogs = [],
  onCheckSheetConnection = undefined,
  onGoFlow = () => {},
  canEdit = true,
}) {
  const { t, locale } = useI18n();
  const accountLookups = useSettingsAccountLookups(nodes);
  const registry = useMemo(() => getAllNodeConfigs(), []);
  // Mẫu vừa tạo / vừa chọn ở mục Nội dung mà danh sách của trang (tải một lần lúc mở) chưa có: giữ ở đây để tóm tắt hiện TÊN mẫu, không hiện "Mẫu #12".
  const [extraTemplates, setExtraTemplates] = useState({ email: [], zalo: [] });
  const lookups = useMemo(() => {
    const merge = (base, extra) => {
      const known = new Set((Array.isArray(base) ? base : []).map((item) => String(item?.id)));
      return [...(Array.isArray(base) ? base : []), ...extra.filter((item) => !known.has(String(item.id)))];
    };
    return {
      emailTemplates: merge(emailTemplates, extraTemplates.email),
      zaloTemplates: merge(zaloTemplates, extraTemplates.zalo),
      emailSettings,
      ...accountLookups,
    };
  }, [emailTemplates, zaloTemplates, emailSettings, accountLookups, extraTemplates]);
  const { ordered, unconnected } = useMemo(() => buildSettingsOrder(nodes, edges), [nodes, edges]);
  const hasNodes = ordered.length + unconnected.length > 0;
  // "Trống" = chưa có khối nào ngoài khối khởi chạy thủ công: dựng khung khối từ "Gửi từ" + "Gửi cho ai".
  const blank = useMemo(() => nodes.every((node) => subtypeOf(node) === 'manual_trigger'), [nodes]);
  const hasUnconnected = useMemo(() => unconnected.some((node) => subtypeOf(node) !== 'manual_trigger'), [unconnected]);

  const scheduleSummary = useMemo(() => {
    if (!Array.isArray(schedules) || schedules.length === 0) return '';
    const first = describeSchedule(schedules[0])?.pattern || '';
    return schedules.length > 1 ? `${first} +${schedules.length - 1}` : first;
  }, [schedules, describeSchedule]);
  const channel = resolveCampaignChannel(campaignType);
  const startAudienceTypes = useMemo(() => getSkeletonAudienceTypes(campaignType), [campaignType]);
  const startMode = canEdit && blank && startAudienceTypes.length > 0;
  // Tài khoản "Gửi từ" chọn khi chiến dịch còn trống: giữ ở state trang tới khi chọn nguồn (lúc đó nằm vào khung khối).
  const [startSender, setStartSender] = useState(null);

  const sections = useMemo(
    () => readSettingsSections(nodes, edges, { campaignType, locale, lookups, t, scheduleSummary }),
    [nodes, edges, campaignType, locale, lookups, t, scheduleSummary],
  );
  const noSend = !blank && Boolean(sections.audience.empty);

  // ── Biểu mẫu mở tại thẻ: mỗi lúc một mục ─────────────────────────────────────────────────────────────────────────
  const [editingKey, setEditingKey] = useState(null);
  const [formDirty, setFormDirty] = useState(false);
  const formDirtyRef = useRef(false);
  const [advanced, setAdvanced] = useState(null);
  const [rebuildTarget, setRebuildTarget] = useState(null);

  const setDirty = useCallback((value) => {
    formDirtyRef.current = value;
    setFormDirty(value);
  }, []);
  const handleFormDirty = useCallback((value) => {
    if (formDirtyRef.current !== value) setDirty(value);
  }, [setDirty]);

  const openEdit = useCallback((key) => {
    setDirty(false);
    setEditingKey(key);
  }, [setDirty]);
  // Mỗi lúc một mục: nút Sửa của mục khác bị khoá khi đang mở biểu mẫu, nên không có chuyện chuyển mục lúc đang dở.
  const requestEdit = useCallback((key) => {
    if (!canEdit || editingKey) return;
    openEdit(key);
  }, [canEdit, editingKey, openEdit]);
  const closeEdit = useCallback(() => {
    setEditingKey(null);
    setDirty(false);
  }, [setDirty]);

  const dirtyCallbackRef = useRef(onInlineDirtyChange);
  dirtyCallbackRef.current = onInlineDirtyChange;
  useEffect(() => {
    dirtyCallbackRef.current((Boolean(editingKey) || startMode) && formDirty);
  }, [editingKey, formDirty, startMode]);
  useEffect(() => () => dirtyCallbackRef.current(false), []);

  const sectionRefs = useRef(new Map());
  useEffect(() => {
    if (!editingKey) return;
    sectionRefs.current.get(editingKey)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [editingKey]);

  // ── Ghi vào sơ đồ + lưu chiến dịch (một đường: `onApplyGraph`) ────────────────────────────────────────────────────
  const [structureBusy, setStructureBusy] = useState(false);
  const commitGraph = useCallback(async (result) => {
    if (!result) return;
    setStructureBusy(true);
    try {
      await onApplyGraph(result.nodes, result.edges);
    } finally {
      setStructureBusy(false);
    }
  }, [onApplyGraph]);

  const isAudienceLocked = useCallback((audienceType) => {
    if (!allowedSendNodeTypes || !channel) return false;
    return !allowedSendNodeTypes.has(getSendSubtypeFor(sections.audience.value?.channel || channel, audienceType));
  }, [allowedSendNodeTypes, channel, sections.audience.value]);

  const senderValue = startMode ? startSender : sections.sender.value;

  const handleSaveSender = useCallback(async (sender) => {
    const result = writeSender(nodes, edges, sender);
    closeEdit();
    if (!result || result.nodes === nodes) return;
    await commitGraph(result);
  }, [closeEdit, commitGraph, edges, nodes]);

  const handleSaveAudience = useCallback(async (audience) => {
    if (startMode) {
      await commitGraph(buildAudienceGraph({ campaignType, audience, sender: startSender, locale }));
      return;
    }
    const result = writeAudience(nodes, edges, audience, { campaignType, locale });
    if (!result) return;
    if (result.rebuild) {
      setRebuildTarget(audience);
      return;
    }
    closeEdit();
    if (result.nodes === nodes && result.edges === edges) return;
    await commitGraph(result);
  }, [campaignType, closeEdit, commitGraph, edges, locale, nodes, startMode, startSender]);

  const handleConfirmRebuild = useCallback(async () => {
    const audience = rebuildTarget;
    setRebuildTarget(null);
    if (!audience) return;
    closeEdit();
    await commitGraph(buildAudienceGraph({ campaignType, audience, sender: sections.sender.value, locale }));
  }, [campaignType, closeEdit, commitGraph, locale, rebuildTarget, sections.sender.value]);

  // ── Nội dung: tạo mẫu cho tin tự soạn (email / Zalo) rồi ghi chuỗi tin vào khối gửi ─────────────────────────────────────
  const [contentBusy, setContentBusy] = useState(false);
  const handleSaveContent = useCallback(async (nodeId, value) => {
    setContentBusy(true);
    try {
      let resolved;
      try {
        resolved = await resolveCustomSteps({
          value,
          campaignName,
          fallbackName: t('campaignSettings.content.form.templateNameFallback'),
          messageLabel: t('campaignSettings.content.form.templateNameStep'),
        });
      } catch (error) {
        // Không ghi gì vào sơ đồ; biểu mẫu vẫn mở để sửa / thử lại.
        toast.error(error?.message || t('campaignSettings.content.form.createFailed'));
        return;
      }
      const result = writeContent(nodes, edges, nodeId, resolved.value);
      if (!result) {
        toast.error(t('campaignSettings.content.form.saveFailed'));
        return;
      }
      const seen = resolved.value.steps
        .map((step) => step.content)
        .filter((content) => content.mode === 'template' && Number(content.templateId) > 0 && content.templateName)
        .map((content) => ({ id: content.templateId, templateName: content.templateName }));
      if (seen.length > 0) {
        const kind = value.kind === 'email' ? 'email' : 'zalo';
        setExtraTemplates((prev) => ({ ...prev, [kind]: [...prev[kind], ...seen] }));
      }
      closeEdit();
      if (result.nodes === nodes && result.edges === edges) return;
      await commitGraph(result);
    } finally {
      setContentBusy(false);
    }
  }, [campaignName, closeEdit, commitGraph, edges, nodes, t]);

  // ── Cài đặt nâng cao: hộp cấu hình của đúng khối (hộp của Sơ đồ khối) ─────────────────────────────────────────────
  // Chỉ nhớ id + vai; khối và mục form được tra lúc VẼ — bước phụ vừa thêm chưa nằm trong `nodes` của lần vẽ đang gọi.
  const openAdvanced = useCallback((nodeId, role = null) => {
    if (!canEdit) return;
    setAdvanced({ nodeId: String(nodeId), role });
  }, [canEdit]);
  const advancedNode = advanced ? nodes.find((item) => String(item.id) === advanced.nodeId) : null;
  const handleAdvancedSave = useCallback(async (formData) => {
    const node = advancedNode;
    setAdvanced(null);
    if (!node) return;
    if (isNodeConfigFormUnchanged(node, formData, campaignType)) return;
    await onSaveNode(node, formData);
  }, [advancedNode, campaignType, onSaveNode]);

  // ── Bước phụ sau khi gửi ─────────────────────────────────────────────────────────────────────────────────────────────
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [removeTargetId, setRemoveTargetId] = useState(null);
  const locked = Boolean(editingKey) || structureBusy;
  const lockTitle = editingKey ? t('campaignSettings.editBusy') : undefined;

  const sideStepOptions = useMemo(() => {
    const dataTypes = getAllowedDataNodeTypesByCampaignType(campaignType);
    // Gắn tag cần danh sách người để gắn: chỉ mời thêm khi chuỗi có khối nguồn (đọc khách / landing / biểu mẫu / Google Sheet / Zalo).
    const hasSource = Boolean(findChainRoles(nodes, analyzeSettingsGraph(nodes, edges).chain).sourceNode);
    return ADDABLE_SIDE_STEP_SUBTYPES
      .filter((type) => type !== 'save_customer' || !dataTypes || dataTypes.has('save_customer'))
      .filter((type) => type !== 'tag_contact' || hasSource)
      .map((type) => {
        const config = registry.find((item) => item.type === type) || {};
        return {
          type,
          title: locale === 'vi' ? (config.nameVi || config.name || type) : (config.name || config.nameVi || type),
          description: locale === 'vi' ? (config.descriptionVi || config.description || '') : (config.description || config.descriptionVi || ''),
        };
      });
  }, [campaignType, edges, locale, nodes, registry]);

  const handleAddSideStep = useCallback(async (subtype) => {
    setAddMenuOpen(false);
    const result = appendSideStep({ nodes, edges, subtype, locale });
    if (!result) return;
    await commitGraph(result);
    // Gắn tag có biểu mẫu riêng ngay trong mục; bước khác mở hộp cài đặt của đúng khối.
    if (subtype === 'tag_contact') openEdit(`after:${result.newNodeId}`);
    else openAdvanced(result.newNodeId);
  }, [commitGraph, edges, locale, nodes, openAdvanced, openEdit]);

  const tagEditingNodeId = !startMode && typeof editingKey === 'string' && editingKey.startsWith('after:') ? editingKey.slice('after:'.length) : null;
  const handleEditAfterStep = useCallback((item) => {
    if (item.tagValue) requestEdit(`after:${item.nodeId}`);
    else openAdvanced(item.nodeId);
  }, [openAdvanced, requestEdit]);
  const handleSaveTagStep = useCallback(async (nodeId, value) => {
    const result = writeTagStep(nodes, edges, nodeId, value);
    closeEdit();
    if (!result || result.nodes === nodes) return;
    await commitGraph(result);
  }, [closeEdit, commitGraph, edges, nodes]);

  const handleConfirmRemove = useCallback(() => {
    const nodeId = removeTargetId;
    setRemoveTargetId(null);
    return commitGraph(removeSideStep({ nodes, edges, nodeId }));
  }, [commitGraph, edges, nodes, removeTargetId]);

  const analysis = useMemo(() => analyzeSettingsGraph(nodes, edges), [nodes, edges]);
  const afterVisible = !startMode && !noSend && (sections.after.items.length > 0 || (canEdit && ((sections.after.canAdd && sideStepOptions.length > 0) || sections.after.branched)));

  // ── Hiển thị từng mục ─────────────────────────────────────────────────────────────────────────────────────────────────
  const startSenderView = startMode ? describeStartSender({ channel, sender: startSender, emailSettings, t }) : null;
  const senderView = startMode ? { ...startSenderView, editable: false } : sections.sender;
  const audienceView = startMode
    ? { status: 'missing', summary: t('campaignSettings.section.audience.chooseBelow'), editable: true, value: null }
    : sections.audience;
  const contentView = startMode
    ? { ...sections.content, status: 'idle', summary: t('campaignSettings.section.content.idle'), items: [] }
    : sections.content;
  const missingCount = startMode
    ? (senderView.status === 'missing' ? 1 : 0) + 1
    : countMissingSections({ sender: senderView, audience: audienceView, content: contentView });

  const reasonText = (view) => {
    if (view.editable || !view.reasonIfNotEditable) return '';
    if (view.reasonIfNotEditable === 'branched') return t('campaignSettings.section.notEditable.branched');
    if (view.reasonIfNotEditable === 'multiSend') return t('campaignSettings.section.notEditable.multiSend');
    return t('campaignSettings.section.notEditable.generic');
  };

  const contentEditingNodeId = !startMode && typeof editingKey === 'string' && editingKey.startsWith('content:') ? editingKey.slice('content:'.length) : null;
  const senderEditing = startMode || editingKey === 'sender';
  const audienceEditing = startMode || editingKey === 'audience';
  const audienceChannel = sections.audience.value?.channel || channel;
  const audienceTypes = startMode ? startAudienceTypes : (AUDIENCE_TYPES_BY_CHANNEL[audienceChannel] || []);

  const registerRef = (key) => (element) => {
    if (element) sectionRefs.current.set(key, element);
    else sectionRefs.current.delete(key);
  };

  const sectionsBlock = (
    <div className="min-w-0 space-y-4" data-testid="settings-sections">
      {analysis.branched && hasNodes && <BranchBanner onGoFlow={onGoFlow} t={t} />}
      {hasUnconnected && !analysis.branched && (
        <p className={`rounded-xl border border-gray-200 bg-white p-3 text-sm dark:border-dk-border dark:bg-dk-surface ${MUTED}`} data-testid="settings-unconnected">
          {t('campaignSettings.section.unconnected')}
        </p>
      )}

      {noSend ? (
        <section className={`${CARD} flex flex-col items-center gap-3 px-4 py-8 text-center`} data-testid="settings-no-send">
          <HiOutlineViewGrid className={`h-10 w-10 ${MUTED}`} aria-hidden="true" />
          <p className="text-sm font-semibold text-gray-900 dark:text-dk-text">{t('campaignSettings.section.noSend.title')}</p>
          <p className={`max-w-md text-sm ${MUTED}`}>{t('campaignSettings.section.noSend.hint')}</p>
          {canEdit && (
            <button type="button" onClick={onGoFlow} data-testid="settings-go-flow" className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600">
              {t('campaignSettings.goFlow')}
            </button>
          )}
        </section>
      ) : (
        <>
          <div ref={registerRef('sender')} className="scroll-mt-4">
            <SettingsSectionCard
              sectionKey="sender"
              status={senderView.status}
              title={t('campaignSettings.section.sender.title')}
              summary={senderView.summary}
              keepSummary={startMode}
              editing={senderEditing}
              onEdit={canEdit && !startMode && senderView.editable ? () => requestEdit('sender') : undefined}
              editDisabled={Boolean(editingKey) && editingKey !== 'sender'}
              editDisabledTitle={t('campaignSettings.editBusy')}
              reason={reasonText(senderView)}
              onAdvanced={canEdit && !startMode && !senderView.editable && senderView.nodeIds?.length ? () => openAdvanced(senderView.nodeIds[0], 'sender') : undefined}
              t={t}
            >
              {startMode && canEdit && (
                <SenderAccountList
                  channel={channel}
                  selected={startSender}
                  onSelect={setStartSender}
                  t={t}
                  locale={locale}
                  className="min-w-0"
                  loadOptions={SENDER_LOAD_OPTIONS}
                  titleClassName="sr-only"
                />
              )}
              {!startMode && editingKey === 'sender' && (
                <SenderSectionForm
                  channel={channel}
                  initial={sections.sender.value}
                  onSave={handleSaveSender}
                  onCancel={closeEdit}
                  onDirtyChange={handleFormDirty}
                  busy={structureBusy}
                  t={t}
                  locale={locale}
                />
              )}
            </SettingsSectionCard>
          </div>

          <div ref={registerRef('audience')} className="scroll-mt-4">
            <SettingsSectionCard
              sectionKey="audience"
              status={audienceView.status}
              title={t('campaignSettings.section.audience.title')}
              summary={audienceView.summary}
              keepSummary={startMode}
              editing={audienceEditing}
              onEdit={canEdit && !startMode && audienceView.editable ? () => requestEdit('audience') : undefined}
              editDisabled={Boolean(editingKey) && editingKey !== 'audience'}
              editDisabledTitle={t('campaignSettings.editBusy')}
              reason={reasonText(audienceView)}
              onAdvanced={canEdit && !startMode && audienceView.advancedNodeId && !audienceEditing ? () => openAdvanced(audienceView.advancedNodeId, 'audience') : undefined}
              t={t}
            >
              {audienceEditing && canEdit && (
                <>
                  {startMode && <p className={`mb-3 text-sm ${MUTED}`}>{t('campaignSettings.section.audience.startHint')}</p>}
                  <AudienceSectionForm
                    key={startMode ? 'start' : 'edit'}
                    channel={audienceChannel}
                    types={audienceTypes}
                    initial={startMode ? null : (sections.audience.value?.audience || null)}
                    sender={senderValue}
                    onSave={handleSaveAudience}
                    onCancel={startMode ? undefined : closeEdit}
                    onDirtyChange={handleFormDirty}
                    saveLabel={startMode ? t('campaignSettings.section.audience.create') : undefined}
                    busy={structureBusy}
                    isLocked={isAudienceLocked}
                    onLockedClick={() => toast.error(t('campaignSettings.start.locked'))}
                    t={t}
                    locale={locale}
                  />
                  {startMode && (
                    <button type="button" onClick={onGoFlow} data-testid="settings-go-flow" className="mt-3 text-sm font-medium text-primary-600 hover:underline dark:text-primary-400">
                      {t('campaignSettings.start.orFlow')}
                    </button>
                  )}
                </>
              )}
            </SettingsSectionCard>
          </div>

          <SettingsSectionCard
            sectionKey="content"
            status={contentView.status}
            title={t('campaignSettings.section.content.title')}
            summary={contentView.items.length === 0 ? contentView.summary : ''}
            editing={contentEditingNodeId !== null}
            t={t}
          >
            {contentView.items.length > 0 && (
              <ContentBody
                items={contentView.items}
                canEdit={canEdit}
                editingNodeId={contentEditingNodeId}
                editLocked={Boolean(editingKey) || structureBusy}
                onEdit={(nodeId) => requestEdit(`content:${nodeId}`)}
                onAdvanced={(nodeId) => openAdvanced(nodeId, 'content')}
                renderForm={(item) => (
                  <ContentSectionForm
                    key={item.nodeId}
                    value={item.value}
                    onSave={(value) => handleSaveContent(item.nodeId, value)}
                    onCancel={closeEdit}
                    onDirtyChange={handleFormDirty}
                    busy={contentBusy || structureBusy}
                    t={t}
                  />
                )}
                t={t}
              />
            )}
          </SettingsSectionCard>
        </>
      )}

      <SettingsSectionCard
        sectionKey="timing"
        status="ok"
        title={t('campaignSettings.section.timing.title')}
        summary={sections.timing.summary}
        onEdit={canEdit && !isNewCampaign ? onOpenSchedule : undefined}
        editLabel={t('campaignSettings.scheduleAction')}
        reason={isNewCampaign ? t('campaignBuilder.saveCampaignFirst') : ''}
        t={t}
      />

      {afterVisible && (
        <SettingsSectionCard
          sectionKey="after"
          status={sections.after.status}
          title={t('campaignSettings.section.after.title')}
          summary={sections.after.items.length === 0 ? t('campaignSettings.section.after.empty') : ''}
          t={t}
        >
          <AfterBody
            items={sections.after.items}
            canEdit={canEdit}
            canAdd={sections.after.canAdd && sideStepOptions.length > 0}
            branched={sections.after.branched}
            locked={locked}
            lockTitle={lockTitle}
            addMenuOpen={addMenuOpen}
            addOptions={sideStepOptions}
            onToggleAdd={() => setAddMenuOpen((value) => !value)}
            onPickAdd={handleAddSideStep}
            onEdit={handleEditAfterStep}
            onRemove={setRemoveTargetId}
            editingNodeId={tagEditingNodeId}
            renderTagForm={(item) => (
              <TagStepForm
                key={item.nodeId}
                nodeId={item.nodeId}
                value={item.tagValue}
                onSave={(value) => handleSaveTagStep(item.nodeId, value)}
                onCancel={closeEdit}
                onDirtyChange={handleFormDirty}
                busy={structureBusy}
                t={t}
              />
            )}
            t={t}
          />
        </SettingsSectionCard>
      )}
    </div>
  );

  return (
    <div className="min-h-0 w-full min-w-0 flex-1 overflow-y-auto bg-gray-50 dark:bg-dk-inset" data-testid="campaign-settings-panel">
      <div className="mx-auto grid w-full max-w-[1800px] grid-cols-1 items-start gap-4 px-4 py-4 sm:px-6 sm:py-6 lg:grid-cols-[minmax(22rem,28rem)_minmax(0,1fr)] lg:gap-6 lg:px-8">
        <OverviewCard
          campaignId={campaignId}
          campaignName={campaignName}
          campaignType={campaignType}
          campaignStatus={campaignStatus}
          isNewCampaign={isNewCampaign}
          isDirty={isDirty}
          lastSavedTime={lastSavedTime}
          hasNodes={hasNodes}
          runningRunId={runningRunId}
          latestRunKey={latestRunKey}
          onOpenDeliveryMonitor={onOpenDeliveryMonitor}
          schedules={schedules}
          describeSchedule={describeSchedule}
          onOpenSchedule={onOpenSchedule}
          onManageSchedules={onManageSchedules}
          canEdit={canEdit}
          t={t}
        />

        {/* <lg: các mục lên TRƯỚC Tổng quan (order); ≥lg: cột phải. */}
        <div className="order-1 min-w-0 space-y-4 lg:order-none">
          {blank && !startMode ? (
            <section className={`${CARD} flex flex-col items-center gap-3 px-4 py-10 text-center`} data-testid="settings-empty">
              <HiOutlineViewGrid className={`h-10 w-10 ${MUTED}`} aria-hidden="true" />
              <p className="text-sm font-semibold text-gray-900 dark:text-dk-text">{t('campaignSettings.section.noSend.title')}</p>
              <p className={`max-w-md text-sm ${MUTED}`}>{t('campaignSettings.section.noSend.hint')}</p>
              {canEdit && (
                <button type="button" onClick={onGoFlow} data-testid="settings-go-flow" className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600">
                  {t('campaignSettings.goFlow')}
                </button>
              )}
            </section>
          ) : (
            <>
              {!noSend && <StatusLine missingCount={missingCount} t={t} />}
              {sectionsBlock}
            </>
          )}
        </div>

        <ConfirmModal
          isOpen={Boolean(rebuildTarget)}
          onClose={() => setRebuildTarget(null)}
          onConfirm={handleConfirmRebuild}
          title={t('campaignSettings.changeSource.title')}
          message={t('campaignSettings.changeSource.confirmRebuild', { source: rebuildTarget ? t(`simpleCampaign.audience.types.${rebuildTarget.type}.title`) : '' })}
          confirmLabel={t('campaignSettings.changeSource.confirmRebuildButton')}
          cancelLabel={t('campaignSettings.changeSource.cancel')}
          confirmButtonClassName="bg-primary-500 text-white hover:bg-primary-600"
          iconClassName="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0"
          iconColorClassName="w-6 h-6 text-amber-600"
        />
        <ConfirmModal
          isOpen={Boolean(removeTargetId)}
          onClose={() => setRemoveTargetId(null)}
          onConfirm={handleConfirmRemove}
          title={t('campaignSettings.removeStep.title')}
          message={t('campaignSettings.removeStep.message', {
            name: String(nodes.find((item) => String(item.id) === String(removeTargetId))?.data?.label || '').trim(),
          })}
          confirmLabel={t('campaignSettings.removeStep.confirm')}
          cancelLabel={t('campaignSettings.changeSource.cancel')}
        />
        {advancedNode && (
          <NodeConfigModal
            key={advancedNode.id}
            isOpen
            node={advancedNode}
            nodes={nodes}
            edges={edges}
            campaignType={campaignType}
            campaignId={campaignId}
            emailTemplates={emailTemplates}
            zaloTemplates={zaloTemplates}
            emailSettings={emailSettings}
            runLogs={runLogs}
            onCheckSheetConnection={onCheckSheetConnection}
            onSave={handleAdvancedSave}
            onClose={() => setAdvanced(null)}
            initialSection={advanced.role ? resolveSectionForRole(subtypeOf(advancedNode), advanced.role) : null}
          />
        )}
      </div>
    </div>
  );
}
