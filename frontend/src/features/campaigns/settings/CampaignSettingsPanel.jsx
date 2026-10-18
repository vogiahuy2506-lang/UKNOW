import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HiOutlineCalendar,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineExclamation,
  HiOutlinePencil,
  HiOutlineViewGrid,
} from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import { getCampaignTypeMeta } from '../../../utils/campaignTypeDisplay';
import { getAllNodeConfigs } from '../components/CampaignBuilderFlowNodes';
import CampaignEstimatePanel from '../components/CampaignEstimatePanel';
import { ConfirmModal } from '../components/CampaignBuilderLayout';
import NodeConfigForm from '../components/NodeConfigForm';
import { isNodeConfigFormUnchanged } from '../utils/nodeConfigUnchanged';
import useCampaignEstimate from '../hooks/useCampaignEstimate';
import { buildEstimateView, describeEstimateDuration, formatEstimateDateTime } from '../utils/campaignEstimate.helpers';
import { formatCampaignDateTime } from '../utils/campaignDateTime.helpers';
import buildSettingsChecklist from './buildSettingsChecklist';
import buildSettingsOrder from './buildSettingsOrder';
import describeNodeSettings from './describeNodeSettings';
import { formatVnDayMonthTime, formatVnResumeTime, getWaitReasonI18nKey } from '../utils/deliveryMonitor.helpers';
import useCampaignLatestRun from './useCampaignLatestRun';
import useRunRemainingEstimate from './useRunRemainingEstimate';
import useSettingsAccountLookups from './useSettingsAccountLookups';

const CARD = 'rounded-xl border border-gray-200 bg-white shadow-sm dark:border-dk-border dark:bg-dk-surface';
const MUTED = 'text-gray-500 dark:text-dk-text2';

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

const NodeCard = ({
  entry,
  nodes,
  edges,
  lookups,
  registry,
  canEdit,
  isEditing,
  editLocked,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onFormChange,
  formProps,
  cardRef,
  nodeTitleOf,
  t,
  locale,
}) => {
  const { node, step, branch } = entry;
  const subtype = subtypeOf(node);
  const config = registry.find((item) => item.type === subtype);
  const Icon = config?.icon;
  const typeName = config ? (locale === 'vi' ? (config.nameVi || config.name) : (config.name || config.nameVi)) : subtype;
  const title = String(node?.data?.label || '').trim() || typeName;
  const lines = describeNodeSettings(node, { ...lookups, nodes }, t);
  const branchFrom = branch ? nodes.find((item) => String(item.id) === branch.fromId) : null;
  const hasMissing = lines.some((item) => item.tone === 'missing');

  return (
    <li
      ref={cardRef}
      className={`${CARD} min-w-0 scroll-mt-4 p-4 ${isEditing ? 'ring-2 ring-primary-400 dark:ring-primary-500' : hasMissing ? 'border-amber-300 dark:border-amber-500/60' : ''}`}
      data-testid="settings-node-card"
      data-node-id={node.id}
      data-node-type={subtype}
      data-editing={isEditing ? 'true' : 'false'}
      data-missing={hasMissing ? 'true' : 'false'}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold tabular-nums text-gray-600 dark:bg-dk-raised dark:text-dk-text2">
          {step ?? '–'}
        </span>
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: config?.bgColor || '#E8EAF6' }}
        >
          {Icon && <Icon className="h-5 w-5" style={{ color: config?.iconColor || '#5C6BC0' }} aria-hidden="true" />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-sm font-semibold text-gray-900 dark:text-dk-text">{title}</h3>
          {title !== typeName && <p className={`text-xs ${MUTED}`}>{typeName}</p>}
          {hasMissing && (
            <p
              className="mt-1 inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
              data-testid="settings-card-missing"
            >
              <HiOutlineExclamation className="h-3.5 w-3.5" aria-hidden="true" />
              {t('campaignSettings.needsAttention')}
            </p>
          )}
          {branch && (
            <p className="mt-1 inline-block rounded bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-950/40 dark:text-sky-300" data-testid="settings-branch-label">
              {t('campaignSettings.branch', { label: branch.label, node: branchFrom ? nodeTitleOf(branchFrom) : '' })}
            </p>
          )}
        </div>
        {canEdit && !isEditing && (
          <button
            type="button"
            onClick={() => onStartEdit(node.id)}
            disabled={editLocked}
            title={editLocked ? t('campaignSettings.editBusy') : undefined}
            data-testid={`settings-edit-${node.id}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent dark:border-dk-border dark:text-dk-text dark:hover:bg-dk-raised"
          >
            <HiOutlinePencil className="h-4 w-4" aria-hidden="true" />
            {t('campaignSettings.edit')}
          </button>
        )}
      </div>
      {isEditing ? (
        <div className="mt-3 min-w-0 overflow-x-auto border-t border-gray-100 dark:border-dk-border" data-testid="settings-inline-form">
          {/* Form email/Zalo có cột mục lục w-64 bên trái: ở màn hẹp cho cuộn ngang TRONG thẻ thay vì ép nội dung còn ~60px. */}
          <div className="min-w-[34rem] md:min-w-0">
          <NodeConfigForm
            key={node.id}
            variant="inline"
            node={node}
            nodes={nodes}
            edges={edges}
            campaignType={formProps.campaignType}
            campaignId={formProps.campaignId}
            emailTemplates={formProps.emailTemplates}
            zaloTemplates={formProps.zaloTemplates}
            emailSettings={formProps.emailSettings}
            runLogs={formProps.runLogs}
            onCheckSheetConnection={formProps.onCheckSheetConnection}
            onSave={(formData) => onSaveEdit(node, formData)}
            onCancel={onCancelEdit}
            onFormChange={onFormChange}
          />
          </div>
        </div>
      ) : (
      <dl className="mt-3 space-y-1.5 border-t border-gray-100 pt-3 text-sm dark:border-dk-border">
        {lines.map((item, index) => (
          <div key={`${item.label}-${index}`} className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:gap-3" data-testid="settings-line" data-tone={item.tone}>
            <dt className={`shrink-0 sm:w-36 ${MUTED}`}>{item.label}</dt>
            <dd className={`min-w-0 break-words ${item.tone === 'missing' ? 'font-medium text-rose-600 dark:text-rose-400' : 'text-gray-900 dark:text-dk-text'}`}>
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
      )}
    </li>
  );
};

/** Checklist "Trước khi chạy": 4 dòng (Gửi từ · Gửi cho ai · Nội dung · Thời điểm), ✓ đủ / ⚠ thiếu, nút Sửa mở đúng thẻ. */
const Checklist = ({ rows, canEdit, canOpenSchedule, onEditRow, onOpenSchedule, t }) => {
  const missingCount = rows.filter((row) => row.status === 'missing').length;
  return (
    <section className={`${CARD} order-1 min-w-0 p-4 sm:p-5 lg:order-none`} data-testid="settings-checklist" data-missing-count={missingCount} aria-label={t('campaignSettings.checklist.title')}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-base font-bold text-gray-900 dark:text-dk-text">{t('campaignSettings.checklist.title')}</h2>
        <p
          className={`text-sm font-medium ${missingCount > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-green-700 dark:text-green-400'}`}
          data-testid="settings-checklist-summary"
        >
          {missingCount > 0 ? t('campaignSettings.checklist.remaining', { n: missingCount }) : t('campaignSettings.checklist.ready')}
        </p>
      </div>
      <ul className="mt-3 divide-y divide-gray-100 dark:divide-dk-border">
        {rows.map((row) => {
          const ok = row.status === 'ok';
          const isTiming = row.key === 'timing';
          const canClick = canEdit && (isTiming ? canOpenSchedule : Boolean(row.targetNodeId));
          return (
            <li
              key={row.key}
              className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 py-2.5"
              data-testid={`settings-checklist-row-${row.key}`}
              data-status={row.status}
            >
              <span className="flex shrink-0 items-center gap-1.5" aria-label={ok ? t('campaignSettings.checklist.okBadge') : t('campaignSettings.checklist.missingBadge')}>
                {ok
                  ? <HiOutlineCheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" aria-hidden="true" />
                  : <HiOutlineExclamation className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />}
              </span>
              <span className="w-24 shrink-0 text-sm font-semibold text-gray-900 dark:text-dk-text">{t(`campaignSettings.checklist.row.${row.key}`)}</span>
              <span
                className={`min-w-0 flex-1 basis-40 break-words text-sm ${ok ? 'text-gray-700 dark:text-dk-text' : 'font-medium text-rose-600 dark:text-rose-400'}`}
                data-testid={`settings-checklist-summary-${row.key}`}
              >
                {row.summary}
              </span>
              {canClick && (
                <button
                  type="button"
                  onClick={() => (isTiming ? onOpenSchedule() : onEditRow(row.targetNodeId))}
                  data-testid={`settings-checklist-edit-${row.key}`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-dk-border dark:text-dk-text dark:hover:bg-dk-raised"
                >
                  <HiOutlinePencil className="h-4 w-4" aria-hidden="true" />
                  {t('campaignSettings.checklist.edit')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

/**
 * Tab "Thiết lập" của chi tiết chiến dịch (PLAN_THIET_LAP_VA_SO_DO_2026-10-17): tổng quan (tên, kênh, trạng thái, lịch chạy,
 * ước tính) + mọi khối theo thứ tự chạy với cài đặt viết TƯỜNG MINH. Dùng CHUNG `nodes/edges` của trình dựng — sửa ở đây
 * (qua hộp cấu hình của trình dựng) thì Sơ đồ khối thấy ngay, và ngược lại.
 *
 * @param {object} props
 * Sửa khối TẠI CHỖ (PLAN_THIET_LAP_CAU_HINH_TRUC_TIEP PR-A): bấm Sửa → thẻ mở `NodeConfigForm variant="inline"`, mỗi lúc một thẻ;
 * Lưu ở thẻ gọi `onSaveNode` (trang áp cấu hình + lưu chiến dịch). Không còn mở `NodeConfigModal` từ tab này.
 *
 * @param {(node: object, formData: object) => Promise<void>|void} props.onSaveNode áp cấu hình khối vào sơ đồ VÀ lưu chiến dịch
 * @param {(isDirty: boolean) => void} [props.onInlineDirtyChange] báo trang biết thẻ đang mở có thay đổi chưa lưu (để hỏi khi đổi tab)
 * @param {Array<object>} [props.runLogs] log lần chạy thử (form khối dùng để gợi ý cột)
 * @param {Function} [props.onCheckSheetConnection] kiểm tra kết nối Google Sheet của khối đọc sheet
 * @param {string|number|null} [props.latestRunKey] đổi giá trị (vd id + trạng thái lượt mới nhất) → mục "Lần chạy gần nhất" tải lại
 * @param {() => void} props.onOpenDeliveryMonitor mở trang Giám sát gửi tin
 * @param {() => void} props.onGoFlow chuyển sang tab Sơ đồ khối (nút ở trạng thái rỗng)
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
  onInlineDirtyChange = () => {},
  runLogs = [],
  onCheckSheetConnection = undefined,
  onGoFlow = () => {},
  canEdit = true,
}) {
  const { t, locale } = useI18n();
  const accountLookups = useSettingsAccountLookups(nodes);
  const registry = useMemo(() => getAllNodeConfigs(), []);
  const lookups = useMemo(
    () => ({ emailTemplates, zaloTemplates, emailSettings, ...accountLookups }),
    [emailTemplates, zaloTemplates, emailSettings, accountLookups],
  );
  const { ordered, unconnected } = useMemo(() => buildSettingsOrder(nodes, edges), [nodes, edges]);

  const nodeTitleOf = (node) => String(node?.data?.label || '').trim() || subtypeOf(node);
  const hasNodes = ordered.length + unconnected.length > 0;
  // Khối khởi chạy thủ công không hiện thành thẻ bước: thông tin của nó nằm ở dòng "Thời điểm" của checklist.
  const visibleOrdered = useMemo(
    () => ordered.filter((entry) => subtypeOf(entry.node) !== 'manual_trigger').map((entry, index) => ({ ...entry, step: index + 1 })),
    [ordered],
  );
  const visibleUnconnected = useMemo(() => unconnected.filter((node) => subtypeOf(node) !== 'manual_trigger'), [unconnected]);
  const hasCards = visibleOrdered.length + visibleUnconnected.length > 0;

  const scheduleSummary = useMemo(() => {
    if (!Array.isArray(schedules) || schedules.length === 0) return '';
    const first = describeSchedule(schedules[0])?.pattern || '';
    return schedules.length > 1 ? `${first} +${schedules.length - 1}` : first;
  }, [schedules, describeSchedule]);
  const checklist = useMemo(
    () => buildSettingsChecklist(nodes, edges, lookups, t, { scheduleSummary }),
    [nodes, edges, lookups, t, scheduleSummary],
  );

  // ── Sửa tại chỗ: mỗi lúc một thẻ ─────────────────────────────────────────────────────────────────────────────
  const [editingNodeId, setEditingNodeId] = useState(null);
  const [formDirty, setFormDirty] = useState(false);
  const formDirtyRef = useRef(false);
  const [pendingEditId, setPendingEditId] = useState(null);
  const cardRefs = useRef(new Map());

  const setDirty = useCallback((value) => {
    formDirtyRef.current = value;
    setFormDirty(value);
  }, []);

  const handleFormChange = useCallback((_formData, isDirty) => {
    if (formDirtyRef.current !== isDirty) setDirty(isDirty);
  }, [setDirty]);

  const beginEdit = useCallback((nodeId) => {
    setDirty(false);
    setEditingNodeId(String(nodeId));
  }, [setDirty]);

  /** Mở thẻ của `nodeId`; đang có thẻ khác mở với thay đổi dở → hỏi trước (hộp xác nhận của trang). */
  const requestEdit = useCallback((nodeId) => {
    if (!canEdit) return;
    const id = String(nodeId);
    if (editingNodeId === id) return;
    if (editingNodeId && formDirtyRef.current) {
      setPendingEditId(id);
      return;
    }
    beginEdit(id);
  }, [beginEdit, canEdit, editingNodeId]);

  const closeEdit = useCallback(() => {
    setEditingNodeId(null);
    setDirty(false);
  }, [setDirty]);

  const handleSaveEdit = useCallback(async (node, formData) => {
    const changed = formDirtyRef.current && !isNodeConfigFormUnchanged(node, formData, campaignType);
    closeEdit();
    if (!changed) return;
    await onSaveNode(node, formData);
  }, [campaignType, closeEdit, onSaveNode]);

  // Callback đọc qua ref: chỉ báo khi trạng thái đổi, và báo "sạch" đúng một lần khi tab Thiết lập bị gỡ.
  const dirtyCallbackRef = useRef(onInlineDirtyChange);
  dirtyCallbackRef.current = onInlineDirtyChange;
  useEffect(() => {
    dirtyCallbackRef.current(Boolean(editingNodeId) && formDirty);
  }, [editingNodeId, formDirty]);
  useEffect(() => () => dirtyCallbackRef.current(false), []);

  // Khối đang sửa biến mất (bị xoá ở nơi khác) → đóng thẻ.
  useEffect(() => {
    if (editingNodeId && !nodes.some((node) => String(node.id) === editingNodeId)) closeEdit();
  }, [closeEdit, editingNodeId, nodes]);

  useEffect(() => {
    if (!editingNodeId) return;
    cardRefs.current.get(editingNodeId)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [editingNodeId]);

  const formProps = { campaignType, campaignId, emailTemplates, zaloTemplates, emailSettings, runLogs, onCheckSheetConnection };

  const renderCard = (entry) => (
    <NodeCard
      key={entry.node.id}
      entry={entry}
      nodes={nodes}
      edges={edges}
      lookups={lookups}
      registry={registry}
      canEdit={canEdit}
      isEditing={editingNodeId === String(entry.node.id)}
      editLocked={Boolean(editingNodeId) && editingNodeId !== String(entry.node.id)}
      onStartEdit={requestEdit}
      onCancelEdit={closeEdit}
      onSaveEdit={handleSaveEdit}
      onFormChange={handleFormChange}
      formProps={formProps}
      cardRef={(element) => {
        if (element) cardRefs.current.set(String(entry.node.id), element);
        else cardRefs.current.delete(String(entry.node.id));
      }}
      nodeTitleOf={nodeTitleOf}
      t={t}
      locale={locale}
    />
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

        {/* <lg: wrapper `contents` → Checklist, Tổng quan, Các khối là ba ô của cùng một lưới, xếp bằng `order` (Checklist lên đầu);
            ≥lg: cột phải như cũ (Checklist + các khối), Tổng quan nằm cột trái. Checklist chỉ render MỘT lần. */}
        <div className="contents lg:block lg:min-w-0 lg:space-y-4">
        <Checklist
          rows={checklist}
          canEdit={canEdit}
          canOpenSchedule={!isNewCampaign}
          onEditRow={requestEdit}
          onOpenSchedule={onOpenSchedule}
          t={t}
        />
        <div className="order-3 min-w-0 space-y-4 lg:order-none">
        {!hasCards ? (
          <section className={`${CARD} flex flex-col items-center gap-3 px-4 py-10 text-center`} data-testid="settings-empty">
            <HiOutlineViewGrid className={`h-10 w-10 ${MUTED}`} aria-hidden="true" />
            <p className="text-sm font-semibold text-gray-900 dark:text-dk-text">{t('campaignSettings.emptyTitle')}</p>
            <p className={`max-w-md text-sm ${MUTED}`}>{t('campaignSettings.emptyHint')}</p>
            <button
              type="button"
              onClick={onGoFlow}
              data-testid="settings-go-flow"
              className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600"
            >
              {t('campaignSettings.goFlow')}
            </button>
          </section>
        ) : (
          <>
            <section aria-label={t('campaignSettings.blocksTitle')}>
              <h2 className="mb-2 text-base font-bold text-gray-900 dark:text-dk-text">{t('campaignSettings.blocksTitle')}</h2>
              <p className={`mb-3 text-sm ${MUTED}`}>{t('campaignSettings.blocksHint')}</p>
              <ol className="space-y-3" data-testid="settings-ordered-list">{visibleOrdered.map(renderCard)}</ol>
            </section>
            {visibleUnconnected.length > 0 && (
              <section aria-label={t('campaignSettings.unconnectedTitle')} data-testid="settings-unconnected">
                <h2 className="mb-2 text-base font-bold text-gray-900 dark:text-dk-text">{t('campaignSettings.unconnectedTitle')}</h2>
                <p className={`mb-3 text-sm ${MUTED}`}>{t('campaignSettings.unconnectedHint')}</p>
                <ul className="space-y-3">
                  {visibleUnconnected.map((node) => renderCard({ node, step: null, branch: null }))}
                </ul>
              </section>
            )}
          </>
        )}
        </div>
        </div>
        <ConfirmModal
          isOpen={Boolean(pendingEditId)}
          onClose={() => setPendingEditId(null)}
          onConfirm={() => {
            const next = pendingEditId;
            setPendingEditId(null);
            beginEdit(next);
          }}
          title={t('campaignSettings.discard.title')}
          message={t('campaignSettings.discard.message')}
          confirmLabel={t('campaignSettings.discard.confirm')}
          cancelLabel={t('campaignSettings.discard.stay')}
          confirmButtonClassName="bg-primary-500 text-white hover:bg-primary-600"
          iconClassName="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0"
          iconColorClassName="w-6 h-6 text-amber-600"
        />
      </div>
    </div>
  );
}
