/**
 * Kiểm tra payload insight dashboard có đủ nội dung để hiển thị / lưu DB.
 * Đồng bộ logic với `frontend/src/features/dashboard/utils/dashboardInsightStorage.util.js`.
 */

/**
 * Payload là bản fallback khi Gemini không parse được JSON — không lưu DB.
 *
 * @param {object|null} payload
 * @returns {boolean}
 */
function isFallbackParseFailurePayload(payload) {
  if (!payload || typeof payload !== 'object') return true;
  const ov = payload.overview;
  if (typeof ov === 'string' && ov.includes('Không parse được JSON từ Gemini')) {
    return true;
  }
  const notes = payload.notes;
  if (Array.isArray(notes) && notes.some((n) => String(n).includes('Không parse được JSON'))) {
    return true;
  }
  return false;
}

/**
 * @param {unknown} v
 * @returns {boolean}
 */
function hasNonEmptyInsightText(v) {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number' && !Number.isNaN(v)) return true;
  return false;
}

/**
 * Payload có đủ nội dung để lưu vào `dashboard_insights.payload`.
 *
 * @param {object|null} payload
 * @returns {boolean}
 */
export function isInsightPayloadUsable(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (isFallbackParseFailurePayload(payload)) return false;

  const km = payload.key_metrics_analysis;
  if (km && typeof km === 'object' && !Array.isArray(km) && Object.keys(km).length > 0) {
    return true;
  }
  if (Array.isArray(km) && km.length > 0) return true;

  if (Array.isArray(payload.insights) && payload.insights.length > 0) return true;
  if (Array.isArray(payload.action_plan) && payload.action_plan.length > 0) return true;
  if (payload.channel_analysis && typeof payload.channel_analysis === 'object' && Object.keys(payload.channel_analysis).length > 0) {
    return true;
  }
  if (payload.funnel_analysis && typeof payload.funnel_analysis === 'object' && Object.keys(payload.funnel_analysis).length > 0) {
    return true;
  }
  if (payload.top_product_insight && typeof payload.top_product_insight === 'object' && Object.keys(payload.top_product_insight).length > 0) {
    return true;
  }
  if (payload.risk_warning != null && String(payload.risk_warning).trim().length > 0) {
    return true;
  }

  const ov = payload.overview;
  if (typeof ov === 'string' && ov.trim().length >= 5) {
    return true;
  }

  const c = payload.charts;
  if (!c || typeof c !== 'object') return false;
  const ot = c.ordersTrend;
  if (typeof ot === 'string' && hasNonEmptyInsightText(ot)) {
    return true;
  }
  if (ot && typeof ot === 'object' && !Array.isArray(ot)) {
    if (hasNonEmptyInsightText(ot.summary) || hasNonEmptyInsightText(ot.compare)) {
      return true;
    }
  }
  if (hasNonEmptyInsightText(c.landingTopPages)) {
    return true;
  }
  const ce = c.channelEngagement;
  if (typeof ce === 'string' && hasNonEmptyInsightText(ce)) {
    return true;
  }
  if (ce && typeof ce === 'object') {
    const keys = ['all', 'email', 'zalo', 'zalo_group'];
    if (keys.some((k) => hasNonEmptyInsightText(ce[k]))) {
      return true;
    }
  }
  const cb = c.channelBreakdown;
  if (
    cb &&
    typeof cb === 'object' &&
    (hasNonEmptyInsightText(cb.click) || hasNonEmptyInsightText(cb.completed) || hasNonEmptyInsightText(cb.pending))
  ) {
    return true;
  }
  const tl = c.topLists;
  if (
    tl &&
    typeof tl === 'object' &&
    (hasNonEmptyInsightText(tl.topCourses) ||
      hasNonEmptyInsightText(tl.topCampaignsByOrders) ||
      hasNonEmptyInsightText(tl.topCampaignsByClicks))
  ) {
    return true;
  }

  return false;
}
