import * as alertRepo from '../../repositories/admin/alert.repository.js';
import { sendSystemEmail } from '../../utils/systemEmail.util.js';
import { buildAlertEmail } from '../../utils/systemEmail.util.js';

const HANOI_TZ = 'Asia/Ho_Chi_Minh';

/**
 * Hour 0–23 in Asia/Ho_Chi_Minh for the given instant.
 * @param {Date|number|string} [date]
 */
export function hanoiHour(date = new Date()) {
  const instant = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: HANOI_TZ,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(instant);
  let hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  // Some engines emit "24" for midnight
  if (hour === 24) hour = 0;
  return hour;
}

/** Quiet hours aligned with Zalo outbound (23:00–06:00 VN). Critical rules still fire. */
export function isQuietHours(now = new Date()) {
  try {
    const hour = hanoiHour(now);
    return hour >= 23 || hour < 6;
  } catch {
    const instant = now instanceof Date ? now : new Date(now);
    const hour = instant.getHours();
    return hour >= 23 || hour < 6;
  }
}

/** Exported for unit tests — rule may re-fire only after cooldownMinutes. */
export function cooldownOk(lastEvent, cooldownMinutes) {
  if (!lastEvent?.firedAt) return true;
  const elapsedMs = Date.now() - new Date(lastEvent.firedAt).getTime();
  return elapsedMs >= cooldownMinutes * 60 * 1000;
}

/** @internal test helper — cho phép kiểm từng quy tắc mà không cần cả vòng đánh giá. */
export function evaluateRuleForTests(rule) {
  return evaluateRule(rule);
}

async function evaluateRule(rule) {
  const threshold = Number(rule.thresholdValue);
  const windowMinutes = Number(rule.windowMinutes) || 60;
  const config = rule.config && typeof rule.config === 'object' ? rule.config : {};

  switch (rule.code) {
    case 'campaign_fail_rate_high': {
      const minRecipients = Number(config.minRecipients) || 20;
      const m = await alertRepo.metricCampaignFailRate(windowMinutes, minRecipients);
      if (m.skipped) return null;
      if (m.rate > threshold) {
        return {
          measuredValue: m.rate,
          message: `Tỉ lệ gửi thất bại ${(m.rate * 100).toFixed(1)}% (${m.failed}/${m.total}) trong ${windowMinutes} phút`,
          payload: m,
        };
      }
      return null;
    }
    case 'zalo_inbound_silence': {
      if (config.businessHoursOnly !== false) {
        const hour = hanoiHour();
        if (hour < 8 || hour >= 18) return null;
      }
      const cnt = await alertRepo.metricZaloInboundCount(windowMinutes);
      if (cnt <= threshold) {
        return {
          measuredValue: cnt,
          message: `Không có tin Zalo Personal inbound trong ${windowMinutes} phút (giờ hành chính)`,
          payload: { count: cnt },
        };
      }
      return null;
    }
    case 'cron_zalo_bg_sync_noop': {
      const jobCode = config.jobCode || 'zalo_personal_bg_group_sync';
      const need = Number(config.consecutiveNoops || threshold) || 3;
      const m = await alertRepo.metricConsecutiveCronNoops(jobCode, need);
      if (!m.enough) return null;
      if (m.consecutive >= need) {
        return {
          measuredValue: m.consecutive,
          message: `Cron ${jobCode}: synced=0 liên tiếp ${m.consecutive} lần`,
          payload: m,
        };
      }
      return null;
    }
    case 'ai_cost_spike': {
      const m = await alertRepo.metricAiTokenSpike();
      if (m.avgPrev7 <= 0) return null;
      if (m.ratio > threshold) {
        return {
          measuredValue: m.ratio,
          message: `Token AI hôm nay ${m.todayTokens.toLocaleString('vi-VN')} = ${m.ratio.toFixed(1)}× TB 7 ngày (${m.avgPrev7.toFixed(0)})`,
          payload: m,
        };
      }
      return null;
    }
    case 'zalo_disconnected': {
      const minutes = windowMinutes || threshold || 30;
      // Cận trên: bỏ qua tài khoản khách đã bỏ dùng từ lâu. Không có nó thì
      // quy tắc bắn mãi mãi và người ta sẽ tắt hết cảnh báo.
      const maxAgeMinutes = Number(config.maxAgeMinutes) || 7 * 24 * 60;
      const cnt = await alertRepo.metricZaloDisconnected(minutes, maxAgeMinutes);
      if (cnt > 0) {
        return {
          measuredValue: cnt,
          message: `${cnt} tài khoản Zalo mất kết nối > ${minutes} phút (trong ${Math.round(maxAgeMinutes / 60)} giờ qua)`,
          payload: { count: cnt, minutes, maxAgeMinutes },
        };
      }
      return null;
    }
    case 'order_pending_stale': {
      const hours = threshold || 2;
      const maxAgeHours = Number(config.maxAgeHours) || 48;
      const cnt = await alertRepo.metricStalePendingOrders(hours, maxAgeHours);
      if (cnt > 0) {
        return {
          measuredValue: cnt,
          message: `${cnt} đơn pending quá ${hours} giờ (tạo trong ${maxAgeHours} giờ qua)`,
          payload: { count: cnt, hours, maxAgeHours },
        };
      }
      return null;
    }
    case 'login_fail_flood': {
      const floods = await alertRepo.metricLoginFailFlood(windowMinutes, threshold || 20);
      if (floods.length) {
        return {
          measuredValue: floods[0].fails,
          message: `IP ${floods[0].ip}: ${floods[0].fails} lần đăng nhập sai / ${windowMinutes} phút`,
          payload: { floods },
        };
      }
      return null;
    }
    default:
      return null;
  }
}

async function notifyAdmins(rule, hit) {
  const emails = await alertRepo.listAdminAlertEmails();
  if (!emails.length) {
    console.warn('[AlertEvaluator] No admin alert emails configured');
    return false;
  }
  const frontend = process.env.FRONTEND_URL || 'https://founderai.vn';
  const html = buildAlertEmail({
    ruleName: rule.name,
    severity: rule.severity,
    message: hit.message,
    measuredValue: hit.measuredValue,
    alertsUrl: `${frontend}/admin/alerts`,
  });
  let any = false;
  for (const to of emails) {
    try {
      await sendSystemEmail({
        to,
        subject: `[Founder AI Alert] ${rule.name}`,
        html,
      });
      any = true;
      await new Promise((r) => setTimeout(r, 100));
    } catch (err) {
      console.error(`[AlertEvaluator] Email failed for ${to}:`, err.message);
    }
  }
  return any;
}

/**
 * Evaluate all enabled rules. Safe to call from cron every 5 minutes.
 */
export async function evaluateAllAlerts() {
  const rules = await alertRepo.listRules();
  const quiet = isQuietHours();
  const results = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (quiet && rule.severity !== 'critical') {
      results.push({ code: rule.code, skipped: 'quiet_hours' });
      continue;
    }

    const last = await alertRepo.lastEventForRule(rule.id);
    if (!cooldownOk(last, rule.cooldownMinutes || 60)) {
      results.push({ code: rule.code, skipped: 'cooldown' });
      continue;
    }

    let hit = null;
    try {
      hit = await evaluateRule(rule);
    } catch (err) {
      console.error(`[AlertEvaluator] Rule ${rule.code} failed:`, err.message);
      results.push({ code: rule.code, error: err.message });
      continue;
    }
    if (!hit) {
      results.push({ code: rule.code, ok: true });
      continue;
    }

    let notified = false;
    if (rule.channel === 'email') {
      notified = await notifyAdmins(rule, hit);
    }

    const event = await alertRepo.insertEvent({
      ruleId: rule.id,
      measuredValue: hit.measuredValue,
      message: hit.message,
      payload: hit.payload,
      notified,
    });
    results.push({ code: rule.code, fired: true, eventId: event.id, notified });
    console.warn(`[AlertEvaluator] FIRED ${rule.code}: ${hit.message}`);
  }

  return results;
}

export async function getAlertsOverview() {
  const [rules, events] = await Promise.all([
    alertRepo.listRules(),
    alertRepo.listEvents({ limit: 50, unresolvedOnly: false }),
  ]);
  return { rules, events };
}

export async function updateAlertRule(id, patch) {
  return alertRepo.updateRule(id, patch);
}

export async function resolveAlertEvent(eventId, userId) {
  return alertRepo.resolveEvent(eventId, userId);
}
