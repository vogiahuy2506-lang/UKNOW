import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HiOutlineBeaker,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineExclamationCircle,
  HiOutlineLightningBolt,
  HiOutlineRefresh,
  HiOutlineX,
  HiOutlineDownload,
  HiOutlineShieldCheck,
} from 'react-icons/hi';
import diagnosticApiService from '../../features/admin/diagnostic/services/diagnosticApi.service';
import PageHeader from '../../components/common/PageHeader';
import zaloSettingsApiService from '../../features/settings/services/zaloSettingsApi.service';
import emailSettingsApiService from '../../features/settings/services/emailSettingsApi.service';
import { useI18n } from '../../i18n';

const fmtTime = (v, locale) => (v ? new Date(v).toLocaleTimeString(locale === 'en' ? 'en-US' : 'vi-VN') : '—');
const fmtDelay = (ms) => {
  if (ms == null || ms === '') return '—';
  const n = Number(ms);
  if (!Number.isFinite(n)) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`;
  return `${n}ms`;
};
const fmtDuration = (ms, t) => {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return t ? t('diagnostic.durationZero', '0 phút') : '0 phút';
  const totalMinutes = Math.ceil(n / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return t ? t('diagnostic.durationHoursMinutes', { hours, minutes }, `${hours} giờ ${minutes} phút`) : `${hours} giờ ${minutes} phút`;
  }
  return t ? t('diagnostic.durationMinutesOnly', { minutes }, `${minutes} phút`) : `${minutes} phút`;
};

const STATUS_ICON = {
  sent: <HiOutlineCheckCircle className="text-green-500 w-4 h-4" />,
  failed: <HiOutlineExclamationCircle className="text-red-500 w-4 h-4" />,
  skipped: <HiOutlineClock className="text-gray-400 w-4 h-4" />,
  sending: <HiOutlineLightningBolt className="text-yellow-500 w-4 h-4 animate-pulse" />,
  pending: <HiOutlineClock className="text-gray-400 w-4 h-4" />,
};
const STATUS_LABEL = {
  sent: 'Đã gửi',
  failed: 'Thất bại',
  skipped: 'Bỏ qua',
  sending: 'Đang gửi',
  pending: 'Chờ',
};
const CHANNEL_LABELS = {
  zalo_personal: 'Zalo Cá nhân',
  zalo_group: 'Zalo Nhóm',
  email: 'Email',
};
const WAIT_REASON_LABELS = {
  inter_message_delay: 'Chờ khoảng cách tin',
  rate_limited: 'Giới hạn/giờ',
  quiet_hours: 'Giờ im lặng',
  phone_lookup_cooldown: 'Tạm khoá tra số',
};
const ERROR_CATEGORY_LABELS = {
  PHONE_LOOKUP_RATE_LIMIT: 'Tra số quá nhiều — Zalo tạm khoá tra cứu tới 00:00 (giờ VN)',
  RECIPIENT_NOT_FOUND: 'Số chưa dùng Zalo hoặc sai số',
  TIMEOUT: 'Mạng/Zalo phản hồi chậm',
  ACCOUNT_DISCONNECTED: 'Tài khoản Zalo mất kết nối / hết phiên',
  NOT_FRIEND_OR_BLOCKED: 'Người nhận chặn / chưa là bạn / hạn chế',
  ZALO_GROUP_UNREACHABLE: 'Không gửi được tới nhóm Zalo',
  EMAIL_HARD_BOUNCE: 'Email nảy cứng — địa chỉ không tồn tại',
  EMAIL_SOFT_BOUNCE: 'Email nảy mềm — lỗi tạm thời',
  EMAIL_SMTP_AUTH_ERROR: 'Lỗi cấu hình / xác thực SMTP',
  EMAIL_RATE_LIMIT_PAUSE: 'Nhà cung cấp SMTP đang giới hạn gửi',
  QUIET_HOURS: 'Đang trong khung giờ im lặng Zalo',
  RATE_LIMITED: 'Đã đạt giới hạn gửi theo giờ',
};
const POLL_INTERVAL_MS = 1500;

const RECIPIENT_CONFIG = {
  zalo_personal: {
    label: 'Số điện thoại',
    shortLabel: 'số điện thoại',
    placeholder: '0901234567\n0907654321\n0912345678',
    note: 'mỗi số một dòng',
  },
  zalo_group: {
    label: 'ID nhóm',
    shortLabel: 'ID nhóm',
    placeholder: '1234567890123456789\n9876543210987654321',
    note: 'mỗi ID nhóm một dòng',
  },
  email: {
    label: 'Địa chỉ email',
    shortLabel: 'email',
    placeholder: 'customer@example.com\nlead@example.com',
    note: 'mỗi email một dòng',
  },
};

function getRecipientConfig(channel, t) {
  const base = RECIPIENT_CONFIG[channel] || RECIPIENT_CONFIG.zalo_personal;
  if (!t) return base;
  return {
    label: t(`diagnostic.recipientConfig.${channel}.label`, base.label),
    shortLabel: t(`diagnostic.recipientConfig.${channel}.shortLabel`, base.shortLabel),
    placeholder: t(`diagnostic.recipientConfig.${channel}.placeholder`, base.placeholder),
    note: t(`diagnostic.recipientConfig.${channel}.note`, base.note),
  };
}

function avg(values) {
  if (!values.length) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function formatPolicySummary(policy, quietHours, t) {
  if (!policy) return null;
  const minSec = Math.round((policy.minDelayMs || 0) / 1000);
  const maxSec = Math.round((policy.maxDelayMs || 0) / 1000);
  const limit = policy.limitPerWindow || 100;
  const qh = quietHours
    ? (t ? t('diagnostic.quietHoursInfo', { start: quietHours.start, end: quietHours.end }, ` · im lặng ${quietHours.start}h–${quietHours.end}h`) : ` · im lặng ${quietHours.start}h–${quietHours.end}h`)
    : '';
  return t
    ? t('diagnostic.policySummaryText', { minSec, maxSec, limit, qh }, `khoảng cách ngẫu nhiên ${minSec}–${maxSec} giây · ${limit} tin/giờ${qh}`)
    : `khoảng cách ngẫu nhiên ${minSec}–${maxSec} giây · ${limit} tin/giờ${qh}`;
}

function buildAnalysis(messages, t) {
  const waitVals = messages.map((m) => m.wait_ms).filter((v) => v != null && v > 0);
  const lookupVals = messages.map((m) => m.lookup_ms).filter((v) => v != null && v >= 0);
  const sendVals = messages.map((m) => m.send_ms).filter((v) => v != null && v >= 0);

  const errorCounts = {};
  messages.forEach((m) => {
    if (!m.error_category) return;
    errorCounts[m.error_category] = (errorCounts[m.error_category] || 0) + 1;
  });

  const avgLookup = avg(lookupVals);
  const avgSend = avg(sendVals);
  const avgWait = avg(waitVals);
  const p95Lookup = percentile(lookupVals, 95);

  let conclusion = t ? t('diagnostic.analysis.insufficientData', 'Chưa đủ dữ liệu thời gian để kết luận.') : 'Chưa đủ dữ liệu thời gian để kết luận.';
  const parts = [];
  if (avgLookup != null) parts.push(t ? t('diagnostic.analysis.lookupAvgPart', { delay: fmtDelay(avgLookup) }, `Tra số TB ${fmtDelay(avgLookup)}`) : `Tra số TB ${fmtDelay(avgLookup)}`);
  if (avgSend != null) parts.push(t ? t('diagnostic.analysis.sendAvgPart', { delay: fmtDelay(avgSend) }, `Gửi TB ${fmtDelay(avgSend)}`) : `Gửi TB ${fmtDelay(avgSend)}`);
  if (avgWait != null) parts.push(t ? t('diagnostic.analysis.waitAvgPart', { delay: fmtDelay(avgWait) }, `Chờ TB ${fmtDelay(avgWait)}`) : `Chờ TB ${fmtDelay(avgWait)}`);

  if (parts.length) {
    const slowest = [
      { label: t ? t('diagnostic.analysis.lookupStage', 'Tra số') : 'Tra số', value: avgLookup || 0 },
      { label: t ? t('diagnostic.analysis.sendStage', 'Gửi') : 'Gửi', value: avgSend || 0 },
      { label: t ? t('diagnostic.analysis.waitStage', 'Chờ') : 'Chờ', value: avgWait || 0 },
    ].sort((a, b) => b.value - a.value)[0];
    const stageText = t ? t('diagnostic.analysis.slowestStage', { stage: slowest.label }, `— chặng chậm nhất: ${slowest.label}.`) : `— chặng chậm nhất: ${slowest.label}.`;
    conclusion = `${parts.join(' · ')} ${stageText}`;
  }

  const errorEntries = Object.entries(errorCounts);
  if (errorEntries.length) {
    const top = errorEntries.sort((a, b) => b[1] - a[1])[0];
    const label = t ? t(`diagnostic.errorCategories.${top[0]}`, ERROR_CATEGORY_LABELS[top[0]] || top[0]) : (ERROR_CATEGORY_LABELS[top[0]] || top[0]);
    conclusion += t ? t('diagnostic.analysis.errorSummary', { count: top[1], error: label }, ` ${top[1]} tin lỗi "${label}".`) : ` ${top[1]} tin lỗi "${label}".`;
  }

  return {
    avgLookup,
    avgSend,
    avgWait,
    p95Lookup,
    errorCounts,
    conclusion,
  };
}

function TimingStackedBar({ waitMs, lookupMs, sendMs, t }) {
  const wait = Math.max(0, Number(waitMs) || 0);
  const lookup = Math.max(0, Number(lookupMs) || 0);
  const send = Math.max(0, Number(sendMs) || 0);
  const total = wait + lookup + send;
  if (total <= 0) return <span className="text-gray-300 dark:text-dk-muted text-xs">—</span>;

  const pct = (v) => `${Math.max(2, (v / total) * 100)}%`;
  const totalSuffix = t ? ` ${t('diagnostic.analysis.timingTotal', 'tổng')}` : ' tổng';
  return (
    <div className="space-y-1 min-w-[120px]">
      <div className="flex h-2 rounded-full overflow-hidden bg-gray-100 dark:bg-dk-raised">
        {wait > 0 && <div className="bg-amber-400" style={{ width: pct(wait) }} title={`Chờ ${fmtDelay(wait)}`} />}
        {lookup > 0 && <div className="bg-sky-500" style={{ width: pct(lookup) }} title={`Tra số ${fmtDelay(lookup)}`} />}
        {send > 0 && <div className="bg-emerald-500" style={{ width: pct(send) }} title={`Gửi ${fmtDelay(send)}`} />}
      </div>
      <div className="text-[10px] text-gray-400 dark:text-dk-muted tabular-nums">
        {fmtDelay(total)}{totalSuffix}
      </div>
    </div>
  );
}

function RunStatusBadge({ status, t }) {
  if (status === 'running') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 dark:border dark:border-amber-900/50">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        {t ? t('diagnostic.statusBadge.running', 'Đang chạy') : 'Đang chạy'}
      </span>
    );
  }
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300 dark:border dark:border-green-900/50">
        <HiOutlineCheckCircle className="w-3.5 h-3.5" />
        {t ? t('diagnostic.statusBadge.completed', 'Hoàn tất') : 'Hoàn tất'}
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 dark:border dark:border-red-900/50">
        <HiOutlineX className="w-3.5 h-3.5" />
        {t ? t('diagnostic.statusBadge.failed', 'Thất bại') : 'Thất bại'}
      </span>
    );
  }
  return null;
}

function AnalysisPanel({ messages, t }) {
  const analysis = useMemo(() => buildAnalysis(messages, t), [messages, t]);
  const errorEntries = Object.entries(analysis.errorCounts);

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4 space-y-3 dark:border-dk-border dark:bg-dk-raised">
      <h3 className="text-sm font-semibold text-gray-800 dark:text-dk-text">{t ? t('diagnostic.analysis.title', 'Phân tích') : 'Phân tích'}</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>
          <div className="text-xs text-gray-500 dark:text-dk-text2">{t ? t('diagnostic.analysis.lookupP95', 'Tra số TB / P95') : 'Tra số TB / P95'}</div>
          <div className="font-medium tabular-nums dark:text-dk-text">{fmtDelay(analysis.avgLookup)} / {fmtDelay(analysis.p95Lookup)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 dark:text-dk-text2">{t ? t('diagnostic.analysis.sendAvg', 'Gửi TB') : 'Gửi TB'}</div>
          <div className="font-medium tabular-nums dark:text-dk-text">{fmtDelay(analysis.avgSend)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 dark:text-dk-text2">{t ? t('diagnostic.analysis.waitAvg', 'Chờ TB') : 'Chờ TB'}</div>
          <div className="font-medium tabular-nums dark:text-dk-text">{fmtDelay(analysis.avgWait)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 dark:text-dk-text2">{t ? t('diagnostic.analysis.errorCategories', 'Lỗi theo nhóm') : 'Lỗi theo nhóm'}</div>
          <div className="font-medium dark:text-dk-text">{errorEntries.length ? (t ? t('diagnostic.analysis.categoriesCount', { count: errorEntries.length }, `${errorEntries.length} nhóm`) : `${errorEntries.length} nhóm`) : '—'}</div>
        </div>
      </div>
      {errorEntries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {errorEntries.map(([cat, count]) => (
            <span key={cat} className="badge badge-gray text-xs">
              {(t ? t(`diagnostic.errorCategories.${cat}`, ERROR_CATEGORY_LABELS[cat] || cat) : (ERROR_CATEGORY_LABELS[cat] || cat))}: {count}
            </span>
          ))}
        </div>
      )}
      <p className="text-sm text-gray-700 leading-relaxed dark:text-dk-text">{analysis.conclusion}</p>
    </div>
  );
}

function AccountLiveStatusPanel({ status, loading, error, onRefresh, t }) {
  const quota = status?.quota;
  const policy = status?.policy;
  const cooldown = status?.phoneLookupCooldown;
  const quiet = status?.quietHours;
  const quotaText = quota
    ? `${quota.attemptCount ?? quota.successCount}/${quota.limitPerWindow}`
    : '—';
  const resetText = quota?.windowResetInMs == null
    ? (t ? t('diagnostic.noWindow', 'chưa có khung giờ') : 'chưa có khung giờ')
    : (t ? t('diagnostic.resetsIn', { duration: fmtDuration(quota.windowResetInMs, t) }, `làm mới sau ${fmtDuration(quota.windowResetInMs, t)}`) : `làm mới sau ${fmtDuration(quota.windowResetInMs, t)}`);
  const cooldownText = cooldown?.remainingMs > 0
    ? (t ? t('diagnostic.cooldownRemaining', { duration: fmtDuration(cooldown.remainingMs, t) }, `còn ${fmtDuration(cooldown.remainingMs, t)}`) : `còn ${fmtDuration(cooldown.remainingMs, t)}`)
    : (t ? t('diagnostic.none', 'không') : 'không');
  const quietText = quiet?.inQuietHours
    ? (t ? t('diagnostic.quietPaused', { duration: fmtDuration(quiet.remainingMs, t) }, `đang tắt · mở lại sau ${fmtDuration(quiet.remainingMs, t)}`) : `đang tắt · mở lại sau ${fmtDuration(quiet.remainingMs, t)}`)
    : (t ? t('diagnostic.quietActive', { start: quiet?.start ?? 23 }, `đang gửi (tắt lúc ${quiet?.start ?? 23}:00)`) : `đang gửi (tắt lúc ${quiet?.start ?? 23}:00)`);

  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 dark:border-blue-900/50 dark:bg-blue-950/30">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-blue-900 dark:text-blue-300">
            {t ? t('diagnostic.liveStatusTitle', 'Trạng thái tài khoản trực tiếp') : 'Trạng thái tài khoản trực tiếp'}
          </p>
          <p className="text-xs text-blue-700/80 dark:text-blue-400">
            {status?.accountName || (t ? t('diagnostic.liveStatusSource', 'Đọc từ worker chiến dịch hiện tại') : 'Đọc từ worker chiến dịch hiện tại')}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:bg-dk-surface dark:text-blue-300 dark:hover:bg-blue-950/40"
          disabled={loading}
        >
          <HiOutlineRefresh className={`inline h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> {t ? t('diagnostic.refresh', 'Làm mới') : 'Làm mới'}
        </button>
      </div>
      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 text-xs text-blue-900 dark:text-blue-200 md:grid-cols-4">
          <div>
            <p className="text-blue-500 dark:text-blue-400">{t ? t('diagnostic.quotaHour', 'Hạn mức giờ này') : 'Hạn mức giờ này'}</p>
            <p className="font-semibold">{quotaText} · {resetText}</p>
          </div>
          <div>
            <p className="text-blue-500 dark:text-blue-400">{t ? t('diagnostic.phoneLookupCooldown', 'Tạm khoá tra số') : 'Tạm khoá tra số'}</p>
            <p className="font-semibold">{cooldownText}</p>
          </div>
          <div>
            <p className="text-blue-500 dark:text-blue-400">{t ? t('diagnostic.quietHours', 'Giờ im lặng') : 'Giờ im lặng'}</p>
            <p className="font-semibold">{quietText}</p>
          </div>
          <div>
            <p className="text-blue-500 dark:text-blue-400">{t ? t('diagnostic.delayPolicy', 'Chính sách khoảng cách') : 'Chính sách khoảng cách'}</p>
            <p className="font-semibold">{fmtDelay(policy?.minDelayMs)}–{fmtDelay(policy?.maxDelayMs)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function RunLog({ run, messages, t, locale }) {
  const sent = run.sent_count ?? 0;
  const failed = run.failed_count ?? 0;
  const skipped = run.skipped_count ?? 0;
  const total = run.total_count ?? 0;
  const done = sent + failed + skipped;
  const isProduction = run.mode === 'production';
  const recipientConfig = getRecipientConfig(run.channel, t);

  return (
    <div className="space-y-5">
      {run.status === 'running' && total > 0 && (
        <div>
          <div className="flex justify-between text-xs text-gray-500 dark:text-dk-text2 mb-1.5">
            <span>{t ? t('diagnostic.progress', 'Tiến độ') : 'Tiến độ'}</span>
            <span className="tabular-nums">{done} / {total}</span>
          </div>
          <div className="h-1.5 bg-gray-100 dark:bg-dk-raised rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 rounded-full transition-all duration-500"
              style={{ width: `${(done / total) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`badge ${isProduction ? 'badge-warning' : 'badge-gray'}`}>
          {isProduction ? (t ? t('diagnostic.perRealPolicy', 'Theo chính sách thật') : 'Theo chính sách thật') : (t ? t('diagnostic.fastMode', 'Chế độ nhanh') : 'Chế độ nhanh')}
        </span>
        {!isProduction && run.inter_message_delay_ms != null && (
          <span className="text-gray-500 dark:text-dk-text2">
            {t ? t('diagnostic.configuredDelay', { delay: fmtDelay(run.inter_message_delay_ms) }, `Khoảng cách đã cấu hình: ${fmtDelay(run.inter_message_delay_ms)}`) : `Khoảng cách đã cấu hình: ${fmtDelay(run.inter_message_delay_ms)}`}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-gray-50 dark:bg-dk-raised rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-gray-800 dark:text-dk-text">{total}</div>
          <div className="text-xs text-gray-500 dark:text-dk-text2 mt-0.5">{t ? t('diagnostic.stats.total', 'Tổng') : 'Tổng'}</div>
        </div>
        <div className="bg-green-50 dark:bg-green-950/40 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-green-700 dark:text-green-300">{sent}</div>
          <div className="text-xs text-green-600 dark:text-green-400 mt-0.5">{t ? t('diagnostic.stats.sent', 'Đã gửi') : 'Đã gửi'}</div>
        </div>
        <div className={`${failed > 0 ? 'bg-red-50 dark:bg-red-950/40' : 'bg-gray-50 dark:bg-dk-raised'} rounded-xl p-3 text-center`}>
          <div className={`text-xl font-bold ${failed > 0 ? 'text-red-700 dark:text-red-300' : 'text-gray-800 dark:text-dk-text'}`}>{failed}</div>
          <div className={`text-xs mt-0.5 ${failed > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-dk-text2'}`}>{t ? t('diagnostic.stats.failed', 'Thất bại') : 'Thất bại'}</div>
        </div>
        <div className={`${skipped > 0 ? 'bg-amber-50 dark:bg-amber-950/40' : 'bg-gray-50 dark:bg-dk-raised'} rounded-xl p-3 text-center`}>
          <div className={`text-xl font-bold ${skipped > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-gray-800 dark:text-dk-text'}`}>{skipped}</div>
          <div className={`text-xs mt-0.5 ${skipped > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-dk-text2'}`}>{t ? t('diagnostic.stats.skipped', 'Bỏ qua') : 'Bỏ qua'}</div>
        </div>
        <div className="bg-blue-50 dark:bg-blue-950/40 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-blue-700 dark:text-blue-300">{fmtDelay(avg(messages.map((m) => m.delay_ms).filter((v) => v != null)))}</div>
          <div className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">{t ? t('diagnostic.stats.avgDelay', 'Khoảng cách TB') : 'Khoảng cách TB'}</div>
        </div>
      </div>

      <AnalysisPanel messages={messages} t={t} />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-dk-border">
              <th className="pb-2.5 text-left text-xs font-semibold text-gray-400 dark:text-dk-muted uppercase tracking-wide w-8">#</th>
              <th className="pb-2.5 text-left text-xs font-semibold text-gray-400 dark:text-dk-muted uppercase tracking-wide">{recipientConfig.label}</th>
              <th className="pb-2.5 text-left text-xs font-semibold text-gray-400 dark:text-dk-muted uppercase tracking-wide">{t ? t('diagnostic.tableCols.status', 'Trạng thái') : 'Trạng thái'}</th>
              <th className="pb-2.5 text-left text-xs font-semibold text-gray-400 dark:text-dk-muted uppercase tracking-wide">{t ? t('diagnostic.tableCols.wait', 'Chờ') : 'Chờ'}</th>
              <th className="pb-2.5 text-left text-xs font-semibold text-gray-400 dark:text-dk-muted uppercase tracking-wide">{t ? t('diagnostic.tableCols.lookup', 'Tra số') : 'Tra số'}</th>
              <th className="pb-2.5 text-left text-xs font-semibold text-gray-400 dark:text-dk-muted uppercase tracking-wide">{t ? t('diagnostic.tableCols.send', 'Gửi') : 'Gửi'}</th>
              <th className="pb-2.5 text-left text-xs font-semibold text-gray-400 dark:text-dk-muted uppercase tracking-wide">{t ? t('diagnostic.tableCols.total', 'Tổng') : 'Tổng'}</th>
              <th className="pb-2.5 text-left text-xs font-semibold text-gray-400 dark:text-dk-muted uppercase tracking-wide">{t ? t('diagnostic.tableCols.error', 'Lỗi') : 'Lỗi'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-dk-border">
            {messages.map((m) => {
              const errorLabel = m.error_category
                ? (t ? t(`diagnostic.errorCategories.${m.error_category}`, ERROR_CATEGORY_LABELS[m.error_category] || m.error_category) : (ERROR_CATEGORY_LABELS[m.error_category] || m.error_category))
                : null;
              return (
                <tr key={m.seq} className="hover:bg-gray-50/60 dark:hover:bg-dk-raised/60 transition-colors align-top">
                  <td className="py-2.5 pr-3 text-gray-300 dark:text-dk-muted text-xs tabular-nums">{m.seq}</td>
                  <td className="py-2.5 pr-3">
                    <div className="font-mono font-medium text-gray-900 dark:text-dk-text">{m.recipient}</div>
                    {m.zalo_name && <div className="text-xs text-gray-400 dark:text-dk-muted mt-0.5">{m.zalo_name}</div>}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="flex items-center gap-1.5">
                      {STATUS_ICON[m.status] ?? STATUS_ICON.pending}
                      <span className="text-gray-700 dark:text-dk-text">
                        {m.dry_run && m.status === 'sent'
                          ? (t ? t('diagnostic.statusBadge.dryRunSent', 'Đã tra số') : 'Đã tra số')
                          : (t ? t(`diagnostic.statusBadge.${m.status}`, STATUS_LABEL[m.status] ?? m.status) : (STATUS_LABEL[m.status] ?? m.status))}
                      </span>
                    </span>
                    {m.dry_run && (
                      <div className="text-[11px] text-sky-600 dark:text-sky-400 mt-0.5">{t ? t('diagnostic.statusBadge.dryRunNote', 'Chưa gửi tin thật') : 'Chưa gửi tin thật'}</div>
                    )}
                    <div className="text-[11px] text-gray-400 dark:text-dk-muted mt-0.5">{fmtTime(m.sent_at, locale)}</div>
                  </td>
                  <td className="py-2.5 pr-3 text-xs">
                    {m.wait_ms != null ? (
                      <div className="space-y-1">
                        <span className="font-mono text-gray-700 dark:text-dk-text">{fmtDelay(m.wait_ms)}</span>
                        {m.wait_reason && (
                          <span className="badge badge-gray text-[10px]">
                            {t ? t(`diagnostic.waitReasons.${m.wait_reason}`, WAIT_REASON_LABELS[m.wait_reason] || m.wait_reason) : (WAIT_REASON_LABELS[m.wait_reason] || m.wait_reason)}
                          </span>
                        )}
                      </div>
                    ) : '—'}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs text-gray-600 dark:text-dk-text2">{fmtDelay(m.lookup_ms)}</td>
                  <td className="py-2.5 pr-3 font-mono text-xs text-gray-600 dark:text-dk-text2">{fmtDelay(m.send_ms)}</td>
                  <td className="py-2.5 pr-3">
                    <TimingStackedBar waitMs={m.wait_ms} lookupMs={m.lookup_ms} sendMs={m.send_ms} t={t} />
                  </td>
                  <td className="py-2.5 text-xs max-w-[200px]">
                    {errorLabel ? (
                      <div className="space-y-1">
                        <span className="text-red-600 dark:text-red-400 font-medium" title={m.error_message || ''}>{errorLabel}</span>
                        {m.attempts > 0 && <div className="text-gray-400 dark:text-dk-muted">{t ? t('diagnostic.statusBadge.retries', { count: m.attempts }, `Thử lại: ${m.attempts}`) : `Thử lại: ${m.attempts}`}</div>}
                      </div>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DiagnosticPage() {
  const { t, locale } = useI18n();
  const [accountOptions, setAccountOptions] = useState([]);
  const [channel, setChannel] = useState('zalo_personal');
  const [accountId, setAccountId] = useState('');
  const [runMode, setRunMode] = useState('fast');
  const [dryRun, setDryRun] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [recipientsRaw, setRecipientsRaw] = useState('');
  const [delaySeconds, setDelaySeconds] = useState(10);
  const [maxRecipients, setMaxRecipients] = useState(20);
  const [productionMaxRecipients, setProductionMaxRecipients] = useState(5);
  const [policySummary, setPolicySummary] = useState('');
  const [policyData, setPolicyData] = useState(null);
  const [accountStatus, setAccountStatus] = useState(null);
  const [accountStatusLoading, setAccountStatusLoading] = useState(false);
  const [accountStatusError, setAccountStatusError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [recentRuns, setRecentRuns] = useState([]);
  const [activeRunId, setActiveRunId] = useState(null);
  const [activeRun, setActiveRun] = useState(null);
  const [activeMessages, setActiveMessages] = useState([]);

  const pollRef = useRef(null);

  const loadPolicy = useCallback(async () => {
    if (runMode !== 'production') {
      setPolicySummary('');
      setPolicyData(null);
      return;
    }
    try {
      const res = await diagnosticApiService.getPolicy({
        channel,
        accountId: accountId ? Number(accountId) : null,
      });
      const { policy, quietHours } = res.data?.data ?? {};
      setPolicySummary(formatPolicySummary(policy, quietHours, t) || '');
      setPolicyData({ policy, quietHours });
    } catch {
      setPolicySummary('');
      setPolicyData(null);
    }
  }, [runMode, channel, accountId, t]);

  useEffect(() => {
    diagnosticApiService.getConfig()
      .then((res) => {
        const config = res.data?.data ?? {};
        const max = config.maxRecipients;
        const productionMax = config.productionMaxRecipients;
        if (Number.isFinite(max) && max > 0) setMaxRecipients(max);
        if (Number.isFinite(productionMax) && productionMax > 0) setProductionMaxRecipients(productionMax);
      })
      .catch(() => {});

    diagnosticApiService.listRuns()
      .then((res) => setRecentRuns(res.data?.data ?? []))
      .catch(() => {});

    diagnosticApiService.listCampaigns()
      .then((res) => setCampaigns(res.data?.data ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setAccountOptions([]);
    setAccountId('');

    const loadAccounts = channel === 'email'
      ? emailSettingsApiService.listEmailSettings()
      : zaloSettingsApiService.listAccounts();

    loadAccounts
      .then((res) => {
        if (cancelled) return;
        const items = res.data?.data?.items ?? [];
        setAccountOptions(items);
        if (items.length > 0) setAccountId(String(items[0].id));
      })
      .catch(() => {
        if (!cancelled) setAccountOptions([]);
      });

    return () => {
      cancelled = true;
    };
  }, [channel]);

  useEffect(() => {
    if (channel === 'email' && runMode === 'production') {
      setRunMode('fast');
    }
    if (channel !== 'zalo_personal' && dryRun) {
      setDryRun(false);
    }
  }, [channel, runMode, dryRun]);

  useEffect(() => {
    loadPolicy();
  }, [loadPolicy]);

  const loadAccountStatus = useCallback(async () => {
    if (!accountId || !(channel === 'zalo_personal' || channel === 'zalo_group')) {
      setAccountStatus(null);
      setAccountStatusError('');
      return;
    }
    setAccountStatusLoading(true);
    setAccountStatusError('');
    try {
      const res = await diagnosticApiService.getAccountStatus({
        channel,
        accountId: Number(accountId),
      });
      setAccountStatus(res.data?.data ?? null);
    } catch (err) {
      setAccountStatus(null);
      setAccountStatusError(err.response?.data?.message || t('diagnostic.validation.statusError', 'Không đọc được trạng thái trực tiếp'));
    } finally {
      setAccountStatusLoading(false);
    }
  }, [accountId, channel, t]);

  useEffect(() => {
    loadAccountStatus();
    const timer = setInterval(loadAccountStatus, 10000);
    return () => clearInterval(timer);
  }, [loadAccountStatus]);

  const fetchActiveRun = useCallback(async (runId) => {
    try {
      const res = await diagnosticApiService.getRun(runId);
      const { run, messages } = res.data?.data ?? {};
      if (!run) return;
      setActiveRun(run);
      setActiveMessages(messages ?? []);
      if (run.status !== 'running') {
        clearInterval(pollRef.current);
        pollRef.current = null;
        diagnosticApiService.listRuns()
          .then((r) => setRecentRuns(r.data?.data ?? []))
          .catch(() => {});
      }
    } catch {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!activeRunId) return;
    fetchActiveRun(activeRunId);
    pollRef.current = setInterval(() => fetchActiveRun(activeRunId), POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [activeRunId, fetchActiveRun]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    const recipients = recipientsRaw.split('\n').map((s) => s.trim()).filter(Boolean);
    const recipientConfig = getRecipientConfig(channel, t);
    const effectiveMaxRecipients = runMode === 'production' ? productionMaxRecipients : maxRecipients;
    if (!messageText.trim()) return setFormError(t('diagnostic.validation.messageRequired', 'Vui lòng nhập nội dung tin nhắn'));
    if (needsAccount && !accountId) return setFormError(t('diagnostic.validation.accountRequired', 'Vui lòng chọn tài khoản/cấu hình gửi'));
    if (recipients.length === 0) return setFormError(t('diagnostic.validation.recipientRequired', { shortLabel: recipientConfig.shortLabel }, `Vui lòng nhập ít nhất 1 ${recipientConfig.shortLabel}`));
    if (recipients.length > effectiveMaxRecipients) {
      return setFormError(t('diagnostic.validation.recipientMax', { max: effectiveMaxRecipients, shortLabel: recipientConfig.shortLabel }, `Tối đa ${effectiveMaxRecipients} ${recipientConfig.shortLabel} mỗi lần test`));
    }
    try {
      setSubmitting(true);
      const res = await diagnosticApiService.createRun({
        channel,
        accountId: accountId ? Number(accountId) : null,
        messageText: messageText.trim(),
        interMessageDelayMs: delaySeconds * 1000,
        recipients,
        mode: runMode,
        dryRun,
      });
      const runId = res.data?.data?.runId;
      setActiveRunId(runId);
      setActiveRun(null);
      setActiveMessages([]);
    } catch (err) {
      setFormError(err.response?.data?.message ?? t('diagnostic.validation.createFailed', 'Lỗi khi tạo lần kiểm tra'));
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrefill = async (campaignId) => {
    if (!campaignId) return;
    setMessageText('');
    setRecipientsRaw('');
    setPrefillLoading(true);
    try {
      const res = await diagnosticApiService.getCampaignPrefill(campaignId);
      const { accountId: prefillAccountId, messageText: prefillMessage, phones } = res.data?.data ?? {};
      if (prefillAccountId) setAccountId(String(prefillAccountId));
      if (prefillMessage) setMessageText(prefillMessage);
      if (phones?.length > 0) setRecipientsRaw(phones.join('\n'));
    } catch {
      // silently ignore
    } finally {
      setPrefillLoading(false);
    }
  };

  const handleSelectRun = (runId) => {
    clearInterval(pollRef.current);
    pollRef.current = null;
    setActiveRunId(runId);
  };

  const needsAccount = channel === 'zalo_personal' || channel === 'zalo_group' || channel === 'email';
  const needsLiveStatus = channel === 'zalo_personal' || channel === 'zalo_group';
  const recipientConfig = getRecipientConfig(channel, t);
  const inputCls = 'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:border-dk-border dark:bg-dk-inset dark:text-dk-text';
  const recipientCount = recipientsRaw.split('\n').filter((s) => s.trim()).length;
  const effectiveMaxRecipients = runMode === 'production' ? productionMaxRecipients : maxRecipients;
  const avgProductionDelayMs = policyData?.policy
    ? Math.round(((Number(policyData.policy.minDelayMs) || 0) + (Number(policyData.policy.maxDelayMs) || 0)) / 2)
    : null;
  const estimatedProductionMs = runMode === 'production' && avgProductionDelayMs != null
    ? recipientCount * avgProductionDelayMs
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={HiOutlineBeaker}
        title={t('diagnostic.title')}
        subtitle={t('diagnostic.subtitle')}
      />

      <form onSubmit={handleSubmit} className="card overflow-hidden divide-y divide-gray-100 dark:divide-dk-border">
        <div className="px-5 py-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-dk-text">{t('diagnostic.configTitle')}</h2>
          <div className="inline-flex rounded-xl border border-gray-200 p-0.5 bg-gray-50 text-xs dark:border-dk-border dark:bg-dk-raised">
            <button
              type="button"
              onClick={() => setRunMode('fast')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${runMode === 'fast' ? 'bg-white shadow-sm text-gray-900 font-medium dark:bg-dk-inset dark:text-dk-text' : 'text-gray-500 dark:text-dk-text2'}`}
            >
              {t('diagnostic.modeFast')}
            </button>
            <button
              type="button"
              onClick={() => setRunMode('production')}
              disabled={channel === 'email'}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                channel === 'email'
                  ? 'text-gray-300 dark:text-dk-muted cursor-not-allowed'
                  : runMode === 'production'
                    ? 'bg-white shadow-sm text-gray-900 font-medium dark:bg-dk-inset dark:text-dk-text'
                    : 'text-gray-500 dark:text-dk-text2'
              }`}
            >
              {t('diagnostic.modeProduction')}
            </button>
          </div>
        </div>

        {campaigns.length > 0 && (
          <div className="px-5 py-3 bg-orange-50/40 dark:bg-orange-950/20">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <span className="text-xs font-medium text-orange-700 dark:text-orange-400 flex items-center gap-1.5 shrink-0">
                {prefillLoading
                  ? <HiOutlineRefresh className="w-3.5 h-3.5 animate-spin" />
                  : <HiOutlineDownload className="w-3.5 h-3.5" />}
                {t('diagnostic.loadFromCampaign')}
              </span>
              <select
                value={selectedCampaignId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedCampaignId(id);
                  handlePrefill(id);
                }}
                className="w-full min-w-0 sm:flex-1 border border-orange-200 rounded-xl px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:border-orange-900/50 dark:bg-dk-inset dark:text-dk-text"
              >
                <option value="">{t('diagnostic.selectCampaignPlaceholder')}</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.campaign_name} ({c.owner_name || c.owner_email})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="px-5 py-5 space-y-4">
          {runMode === 'production' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200 flex gap-2">
              <HiOutlineShieldCheck className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">{t('diagnostic.realPolicyNoticeTitle')}</p>
                {policySummary
                  ? <p className="text-xs mt-1 text-amber-800 dark:text-amber-300">{policySummary}</p>
                  : <p className="text-xs mt-1 text-amber-700 dark:text-amber-400">{t('diagnostic.loadingPolicy')}</p>}
                {estimatedProductionMs != null && recipientCount > 0 && (
                  <p className="text-xs mt-1 text-amber-800 dark:text-amber-300">
                    {t('diagnostic.estimatedTime', { duration: fmtDuration(estimatedProductionMs, t), count: recipientCount })}
                  </p>
                )}
                <p className="text-xs mt-1 text-amber-700/80 dark:text-amber-400/80">
                  {t('diagnostic.realPolicyWarning')}
                </p>
              </div>
            </div>
          )}

          {needsLiveStatus && (
            <AccountLiveStatusPanel
              status={accountStatus}
              loading={accountStatusLoading}
              error={accountStatusError}
              onRefresh={loadAccountStatus}
              t={t}
            />
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-dk-text mb-1.5">{t('diagnostic.channel')}</label>
              <select value={channel} onChange={(e) => setChannel(e.target.value)} className={inputCls}>
                <option value="zalo_personal">{t('diagnostic.channels.zalo_personal')}</option>
                <option value="zalo_group">{t('diagnostic.channels.zalo_group')}</option>
                <option value="email">{t('diagnostic.channels.email')}</option>
              </select>
            </div>

            <div>
              {needsAccount && (
                <>
                  <label className="block text-xs font-medium text-gray-600 dark:text-dk-text mb-1.5">
                    {channel === 'email' ? t('diagnostic.emailConfig') : t('diagnostic.zaloAccount')}
                  </label>
                  {accountOptions.length === 0 ? (
                    <p className="text-xs text-red-500 dark:text-red-400 mt-2">
                      {channel === 'email'
                        ? t('diagnostic.noEmailConfig')
                        : t('diagnostic.noZaloConnected')}
                    </p>
                  ) : (
                    <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputCls}>
                      {accountOptions.map((a) => (
                        <option key={a.id} value={a.id}>
                          {channel === 'email'
                            ? `${a.name || a.email}${a.email ? ` · ${a.email}` : ''}`
                            : `${a.displayName}${a.status !== 'connected' ? ` ${t('diagnostic.disconnected')}` : ''}`}
                        </option>
                      ))}
                    </select>
                  )}
                </>
              )}
            </div>

            <div>
              {runMode === 'fast' ? (
                <>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <label className="text-xs font-medium text-gray-600 dark:text-dk-text">{t('diagnostic.interMessageDelay')}</label>
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm font-semibold text-primary-600 dark:text-primary-400">{delaySeconds}s</span>
                      <span className="text-xs text-gray-400 dark:text-dk-muted">{t('diagnostic.perPolicyHint')}</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={60}
                    step={1}
                    value={delaySeconds}
                    onChange={(e) => setDelaySeconds(Number(e.target.value))}
                    className="w-full accent-primary-500 dark:[color-scheme:dark] mt-1"
                  />
                  <div className="flex justify-between text-xs text-gray-400 dark:text-dk-muted mt-1">
                    <span>1s</span>
                    <span>60s</span>
                  </div>
                </>
              ) : (
                <div className="h-full flex flex-col justify-center rounded-xl bg-gray-50 dark:bg-dk-raised px-3 py-2 text-xs text-gray-500 dark:text-dk-text2">
                  {t('diagnostic.delayPolicyDetermined')}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-600 dark:text-dk-text">{recipientConfig.label}</label>
                <span className={`text-xs tabular-nums ${recipientCount > 0 ? 'text-primary-600 dark:text-primary-400 font-medium' : 'text-gray-400 dark:text-dk-muted'}`}>
                  {recipientCount} / {effectiveMaxRecipients} · {recipientConfig.note}
                </span>
              </div>
              <textarea
                value={recipientsRaw}
                onChange={(e) => setRecipientsRaw(e.target.value)}
                rows={5}
                placeholder={recipientConfig.placeholder}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-mono focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none bg-white dark:border-dk-border dark:bg-dk-inset dark:text-dk-text"
              />
              {channel === 'zalo_personal' && (
                <label className="mt-3 flex items-start gap-2 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300">
                  <input
                    type="checkbox"
                    checked={dryRun}
                    onChange={(e) => setDryRun(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-sky-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span>
                    <span className="font-medium">{t('diagnostic.dryRunTitle')}</span>
                    <span className="block text-sky-700/80 dark:text-sky-400/80">
                      {t('diagnostic.dryRunDesc')}
                    </span>
                  </span>
                </label>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-dk-text mb-1.5">{t('diagnostic.messageContent')}</label>
              <textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                rows={5}
                placeholder={t('diagnostic.messagePlaceholder')}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none bg-white dark:border-dk-border dark:bg-dk-inset dark:text-dk-text"
              />
            </div>
          </div>
        </div>

        <div className="px-5 py-4 bg-gray-50/60 dark:bg-dk-raised/40 flex items-center justify-between gap-4">
          <div>
            {formError && (
              <p className="text-sm text-red-500 dark:text-red-400 flex items-center gap-1.5">
                <HiOutlineX className="w-4 h-4 shrink-0" /> {formError}
              </p>
            )}
          </div>
          <button type="submit" disabled={submitting} className="btn btn-primary shrink-0">
            {submitting
              ? <><HiOutlineRefresh className="mr-2 w-4 h-4 animate-spin" /> {t('diagnostic.initializing')}</>
              : <><HiOutlineLightningBolt className="mr-2 w-4 h-4" /> {t('diagnostic.runTest')}</>}
          </button>
        </div>
      </form>

      <div className="space-y-4">
        {activeRun && (
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-dk-border flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="font-semibold text-gray-900 dark:text-dk-text shrink-0">{t('diagnostic.runTitle', { id: activeRun.id })}</span>
                <span className="text-gray-200 dark:text-dk-border">|</span>
                <span className="text-sm text-gray-500 dark:text-dk-text2 truncate">{t(`diagnostic.channels.${activeRun.channel}`, CHANNEL_LABELS[activeRun.channel] ?? activeRun.channel)}</span>
                <RunStatusBadge status={activeRun.status} t={t} />
              </div>
              <span className="text-xs text-gray-400 dark:text-dk-muted shrink-0">{fmtTime(activeRun.created_at, locale)}</span>
            </div>
            <div className="p-5">
              <RunLog run={activeRun} messages={activeMessages} t={t} locale={locale} />
            </div>
          </div>
        )}

        {!activeRun && recentRuns.length === 0 && (
          <div className="card flex flex-col items-center justify-center text-center gap-4 py-14">
            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-dk-raised">
              <HiOutlineBeaker className="w-8 h-8 text-gray-300 dark:text-dk-muted" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-dk-text2">{t('diagnostic.emptyTitle')}</p>
              <p className="text-xs text-gray-400 dark:text-dk-muted mt-1">{t('diagnostic.emptySubtitle')}</p>
            </div>
          </div>
        )}

        {recentRuns.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-dk-border">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-dk-text">{t('diagnostic.recentRunsTitle')}</h2>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-dk-border">
              {recentRuns.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handleSelectRun(r.id)}
                  className={`w-full text-left px-5 py-3.5 transition-colors ${
                    activeRunId === r.id ? 'bg-primary-50 dark:bg-primary-950/40' : 'hover:bg-gray-50/60 dark:hover:bg-dk-raised'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="text-gray-400 dark:text-dk-muted text-xs tabular-nums">#{r.id}</span>
                        <span className="font-medium text-gray-900 dark:text-dk-text">
                          {t(`diagnostic.channels.${r.channel}`, CHANNEL_LABELS[r.channel] ?? r.channel)}
                        </span>
                        {r.mode === 'production' && (
                          <span className="badge badge-warning text-[10px]">{t('diagnostic.modeProduction')}</span>
                        )}
                        {r.account_display_name && (
                          <span className="text-gray-400 dark:text-dk-muted font-normal">· {r.account_display_name}</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 dark:text-dk-muted mt-0.5 flex items-center gap-2.5 flex-wrap">
                        <span className="tabular-nums">{t('diagnostic.stats.sentCount', { count: r.sent_count, total: r.total_count })}</span>
                        {r.failed_count > 0 && (
                          <span className="text-red-400">{t('diagnostic.stats.failedCount', { count: r.failed_count })}</span>
                        )}
                        {r.skipped_count > 0 && (
                          <span className="text-amber-600 dark:text-amber-400">{t('diagnostic.stats.skippedCount', { count: r.skipped_count })}</span>
                        )}
                        {r.mode !== 'production' && r.inter_message_delay_ms != null && (
                          <span>{t('diagnostic.stats.delayValue', { delay: r.inter_message_delay_ms / 1000 })}</span>
                        )}
                        <span>{fmtTime(r.created_at, locale)}</span>
                      </div>
                    </div>
                    <RunStatusBadge status={r.status} t={t} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
