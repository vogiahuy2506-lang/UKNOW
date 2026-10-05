import { generateGeminiContent } from '../../utils/geminiClient.util.js';
import { resolveAllowedModel } from '../ai/aiModelPolicy.service.js';
import aiUsageMeter from '../ai/aiUsageMeter.service.js';
import { isInsightPayloadUsable } from '../../utils/dashboardInsightPayload.util.js';
import dashboardInsightRepository from '../../repositories/dashboard/dashboardInsight.repository.js';

/**
 * Cắt bớt timeline để tránh prompt quá dài.
 *
 * @param {Array<object>} timeline
 * @param {number} [head=14]
 * @param {number} [tail=14]
 * @returns {Array<object>}
 */
function shrinkTimeline(timeline = [], head = 14, tail = 14) {
  if (!Array.isArray(timeline)) return [];
  if (timeline.length <= head + tail + 1) return timeline;
  return [...timeline.slice(0, head), { _gap: true, note: '...đã rút gọn...' }, ...timeline.slice(-tail)];
}

/**
 * Gỡ khối markdown ```json ... ``` (hoặc ``` ... ```) nếu model vẫn bọc fence — kể cả có chữ thừa trước/sau.
 *
 * Luồng:
 * 1. Bỏ BOM UTF-8 nếu có.
 * 2. Tìm fence đầu tiên trong chuỗi, lấy nội dung bên trong.
 * 3. Nếu không có fence, trả nguyên bản đã trim.
 *
 * @param {string} text
 * @returns {string}
 */
function stripCodeFences(text) {
  let t = String(text || '').replace(/^\uFEFF/, '').trim();
  const fenceAt = t.search(/```(?:json)?\s*/i);
  if (fenceAt >= 0) {
    const fromFence = t.slice(fenceAt);
    const m = fromFence.match(/^```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (m) return m[1].trim();
  }
  const whole = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/im);
  if (whole) return whole[1].trim();
  return t;
}

/**
 * Chuẩn hóa dấu ngoặc kép typographic / BOM hay gặp trong output LLM để `JSON.parse` ổn định hơn.
 *
 * @param {string} s
 * @returns {string}
 */
function normalizeLlmJsonQuotes(s) {
  return String(s || '')
    .replace(/^\uFEFF/, '')
    .replace(/\u201c/g, '"')
    .replace(/\u201d/g, '"')
    .replace(/\u00ab/g, '"')
    .replace(/\u00bb/g, '"');
}

/**
 * Thử ghép lại JSON object bị cắt (MAX_TOKENS / thiếu `}` `]`): đóng chuỗi đang mở + pop stack ngoặc.
 *
 * Luồng hoạt động:
 * 1. Lấy từ `{` đầu tiên đến hết text (đã strip fence + chuẩn hóa quote).
 * 2. Duyệt như lexer JSON: theo dõi chuỗi và stack ký tự đóng `}` / `]`.
 * 3. Nếu kết thúc giữa chuỗi → thêm `"` để đóng.
 * 4. Pop hết stack để đóng object/array còn mở, rồi `JSON.parse` (kèm bỏ dấu phẩy thừa).
 *
 * @param {string} text
 * @returns {object|null}
 */
function repairTruncatedJsonObject(text) {
  const s0 = normalizeLlmJsonQuotes(stripCodeFences(text));
  const start = s0.indexOf('{');
  if (start < 0) return null;
  const s = s0.slice(start);

  const stack = [];
  let inStr = false;
  let esc = false;

  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (inStr) {
      if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === '{') {
      stack.push('}');
      continue;
    }
    if (ch === '[') {
      stack.push(']');
      continue;
    }
    if (ch === '}' || ch === ']') {
      const top = stack.pop();
      if (top !== ch) {
        // Cấu trúc lệch — không đoán thêm để tránh object sai nghĩa
        return null;
      }
    }
  }

  let repaired = s;
  // Cắt giữa chuỗi (model hết token): đóng chuỗi rồi mới đóng ngoặc
  if (inStr) repaired += '"';
  while (stack.length) {
    repaired += stack.pop();
  }

  try {
    const j = JSON.parse(removeTrailingCommasInJson(repaired));
    if (j && typeof j === 'object') return j;
  } catch {
    /* thử parse thô */
  }
  try {
    const j = JSON.parse(repaired);
    if (j && typeof j === 'object') return j;
  } catch {
    return null;
  }
  return null;
}

/**
 * Trần maxOutputTokens theo `GEMINI_MODEL`: 2.5.x cho phép đầu ra lớn (tránh cắt JSON insight đầy đủ charts);
 * 2.0 và model khác giữ 8192 theo tài liệu API.
 *
 * @returns {number}
 */
function resolveGeminiOutputCapForModel(modelName) {
  const m = String(modelName || process.env.GEMINI_MODEL || '').toLowerCase();
  if (/gemini[^a-z0-9]*2\.5|2\.5[^a-z0-9]*flash|2\.5[^a-z0-9]*pro/.test(m)) {
    return 65536;
  }
  return 8192;
}

/**
 * Đọc `GEMINI_MAX_OUTPUT_TOKENS` từ env, clamp theo trần model.
 * Với Gemini 2.5, nếu không set env thì mặc định 16384 để thường đủ khối `charts.*` cho mọi widget.
 *
 * @returns {number}
 */
function resolveInsightMaxOutputTokens(modelName) {
  const cap = resolveGeminiOutputCapForModel(modelName);
  const raw = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS);
  const fallback = cap > 8192 ? 16384 : 8192;
  const n = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
  return Math.min(cap, Math.max(256, n));
}

/**
 * Xóa dấu phẩy thừa trước `}` hoặc `]` (lỗi phổ biến từ LLM), chỉ áp dụng ngoài chuỗi JSON.
 *
 * @param {string} jsonStr
 * @returns {string}
 */
function removeTrailingCommasInJson(jsonStr) {
  const s = String(jsonStr || '');
  let out = '';
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (esc) {
      out += ch;
      esc = false;
      continue;
    }
    if (inStr) {
      if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      out += ch;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      out += ch;
      continue;
    }
    if (ch === ',') {
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j += 1;
      if (j < s.length && (s[j] === '}' || s[j] === ']')) {
        continue;
      }
    }
    out += ch;
  }
  return out;
}

/**
 * Trích xuất object JSON đầu tiên bằng đếm ngoặc (bỏ qua chuỗi JSON).
 *
 * Luồng hoạt động:
 * 1. Tìm ký tự `{` đầu tiên.
 * 2. Duyệt ký tự, theo dõi trong/ngoài chuỗi và escape.
 * 3. Khi độ sâu `{` về 0 → `JSON.parse` khối đó.
 *
 * @param {string} text
 * @returns {object|null}
 */
function extractJsonObject(text) {
  const s = normalizeLlmJsonQuotes(stripCodeFences(text));
  const start = s.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inStr = false;
  let esc = false;

  for (let i = start; i < s.length; i += 1) {
    const ch = s[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (inStr) {
      if (ch === '\\') {
        esc = true;
        continue;
      }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === '{') depth += 1;
    else     if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        const slice = s.slice(start, i + 1);
        try {
          return JSON.parse(slice);
        } catch {
          try {
            return JSON.parse(removeTrailingCommasInJson(slice));
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Parse JSON từ output Gemini (ưu tiên extract khối object cân bằng).
 *
 * @param {string} text
 * @returns {object|null}
 */
function parseInsightJson(text) {
  if (!text) return null;
  const trimmed = normalizeLlmJsonQuotes(stripCodeFences(text));
  try {
    const j = JSON.parse(trimmed);
    if (j && typeof j === 'object') return j;
  } catch {
    /* thử bước khác */
  }
  try {
    const j = JSON.parse(removeTrailingCommasInJson(trimmed));
    if (j && typeof j === 'object') return j;
  } catch {
    /* thử extract / repair */
  }
  const extracted = extractJsonObject(text);
  if (extracted) return extracted;

  // JSON đủ ý nhưng bị cắt đầu ra → extract không bao giờ cân bằng ngoặc; thử đóng ngoặc/chuỗi
  const repaired = repairTruncatedJsonObject(text);
  if (repaired && typeof repaired === 'object') return repaired;

  return null;
}

/**
 * Chuẩn hóa shape trả về để frontend luôn có `charts` + các khối phân tích.
 *
 * @param {object} raw
 * @returns {object}
 */
/**
 * Chuẩn hóa `charts.channelEngagement`: hỗ trợ legacy (một chuỗi) và bản mới (object theo tab kênh).
 *
 * @param {unknown} ce
 * @returns {{ all: string, email: string, zalo: string, zalo_group: string }}
 */
function normalizeChannelEngagementShape(ce) {
  if (ce == null) {
    return { all: '', email: '', zalo: '', zalo_group: '' };
  }
  if (typeof ce === 'string') {
    return { all: ce, email: '', zalo: '', zalo_group: '' };
  }
  if (typeof ce === 'object' && !Array.isArray(ce)) {
    const pick = (k) => (typeof ce[k] === 'string' ? ce[k] : '');
    return {
      all: pick('all'),
      email: pick('email'),
      zalo: pick('zalo'),
      zalo_group: pick('zalo_group'),
    };
  }
  return { all: '', email: '', zalo: '', zalo_group: '' };
}

/**
 * Chuẩn hóa `charts.ordersTrend`: legacy một chuỗi → chỉ nhánh `summary`; bản mới object `summary` + `compare` (Tổng hợp / So sánh kênh).
 *
 * @param {unknown} ot
 * @returns {{ summary: string, compare: string }}
 */
function normalizeOrdersTrendShape(ot) {
  if (ot == null) {
    return { summary: '', compare: '' };
  }
  if (typeof ot === 'string') {
    return { summary: ot, compare: '' };
  }
  if (typeof ot === 'object' && !Array.isArray(ot)) {
    const pick = (k) => (typeof ot[k] === 'string' ? ot[k] : '');
    return {
      summary: pick('summary'),
      compare: pick('compare'),
    };
  }
  return { summary: '', compare: '' };
}

function normalizeInsightPayload(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      overview: '',
      charts: defaultCharts(),
      notes: ['Dữ liệu insight không hợp lệ'],
    };
  }

  const charts = {
    ...defaultCharts(),
    ...(raw.charts && typeof raw.charts === 'object' ? raw.charts : {}),
  };

  charts.channelEngagement = normalizeChannelEngagementShape(charts.channelEngagement);
  charts.ordersTrend = normalizeOrdersTrendShape(charts.ordersTrend);

  charts.landingTopPages =
    typeof charts.landingTopPages === 'string' ? charts.landingTopPages : '';

  if (charts.channelBreakdown && typeof charts.channelBreakdown === 'object') {
    charts.channelBreakdown = {
      click: '',
      completed: '',
      pending: '',
      ...charts.channelBreakdown,
    };
  } else {
    charts.channelBreakdown = { click: '', completed: '', pending: '' };
  }

  if (charts.topLists && typeof charts.topLists === 'object') {
    charts.topLists = {
      topCourses: '',
      topCampaignsByOrders: '',
      topCampaignsByClicks: '',
      ...charts.topLists,
    };
  } else {
    charts.topLists = {
      topCourses: '',
      topCampaignsByOrders: '',
      topCampaignsByClicks: '',
    };
  }

  const overview =
    typeof raw.overview === 'string'
      ? raw.overview
      : raw.overview != null
        ? String(raw.overview)
        : '';

  return {
    ...raw,
    overview,
    charts,
    notes: Array.isArray(raw.notes) ? raw.notes : [],
  };
}

function defaultCharts() {
  return {
    ordersTrend: { summary: '', compare: '' },
    channelEngagement: {
      all: '',
      email: '',
      zalo: '',
      zalo_group: '',
    },
    channelBreakdown: {
      click: '',
      completed: '',
      pending: '',
    },
    topLists: {
      topCourses: '',
      topCampaignsByOrders: '',
      topCampaignsByClicks: '',
    },
    landingTopPages: '',
  };
}

/** Nhãn kênh đưa vào prompt (kênh lạ trả nguyên khoá). */
const INSIGHT_CHANNEL_LABELS = Object.freeze({
  email: 'Email',
  zalo_personal: 'Zalo cá nhân',
  zalo_group: 'Zalo nhóm',
  zalo_friend_request: 'Lời mời kết bạn Zalo',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  other: 'Khác (đa kênh)',
});

const insightChannelLabel = (channel) => INSIGHT_CHANNEL_LABELS[channel] || String(channel || '—');

/**
 * Tóm tắt chuỗi "đã gửi mỗi ngày" và chuỗi đơn hàng theo ngày — tính trên TOÀN BỘ chuỗi (trước khi rút gọn để đưa
 * vào prompt), nên tổng luôn khớp thẻ; chuỗi rút gọn chỉ để model nhìn xu hướng.
 *
 * @param {Array<object>} dailySent dòng `{ date, total, <kênh>: n }`
 * @param {Array<object>} ordersTimeline dòng `{ date, pendingOrders, completedOrders, … }`
 * @returns {{ dateRange: string, totalSent: number, sentByChannel: object, peakSentDay: object|null, pendingOrders: number, completedOrders: number }}
 */
function summarizeTimelines(dailySent = [], ordersTimeline = []) {
  const days = Array.isArray(dailySent) ? dailySent : [];
  const orderDays = Array.isArray(ordersTimeline) ? ordersTimeline : [];
  const sentByChannel = {};
  let peak = null;
  let totalSent = 0;
  for (const day of days) {
    for (const [key, value] of Object.entries(day)) {
      if (key === 'date' || key === 'total') continue;
      sentByChannel[key] = (sentByChannel[key] || 0) + Number(value || 0);
    }
    totalSent += Number(day.total || 0);
    if (!peak || Number(day.total || 0) > peak.total) peak = { date: day.date, total: Number(day.total || 0) };
  }
  const sum = (key) => orderDays.reduce((acc, row) => acc + Number(row[key] || 0), 0);
  return {
    dateRange: days.length ? `${days[0].date} → ${days[days.length - 1].date}` : '—',
    totalSent,
    sentByChannel,
    peakSentDay: peak && peak.total > 0 ? peak : null,
    pendingOrders: sum('pendingOrders'),
    completedOrders: sum('completedOrders'),
  };
}

/**
 * Tỉ lệ chuyển đổi do SERVER tự tính từ số đếm của snapshot (D-20) — trước đây prompt bắt model tự chia
 * ("đơn đã mua so với số tin đã gửi / lượt nhấp") nên con số hiện như phân tích mà không có cơ sở.
 *
 * Đây là tỉ lệ giữa hai số đếm CÙNG KỲ (đơn đã mua / tin đã gửi; đơn đã mua / tin có người bấm), KHÔNG theo dõi từng khách:
 * đơn có thể đến từ khách không bấm link, nên tỉ lệ theo lượt bấm chỉ có nghĩa khi đơn ≤ lượt bấm — vượt thì bỏ (không in "400%").
 *
 * @param {object|null|undefined} overview `snapshot.overview` (`sent.total`, `clicks.total`, `orders.completed`)
 * @returns {{ completedOrders: number, sentTotal: number, clickedTotal: number, perSentPct: number|null, perClickPct: number|null }}
 */
function computeConversionMetrics(overview) {
  const num = (n) => {
    const v = Number(n);
    return Number.isFinite(v) && v > 0 ? v : 0;
  };
  const completedOrders = num(overview?.orders?.completed);
  const sentTotal = num(overview?.sent?.total);
  const clickedTotal = num(overview?.clicks?.total);
  const pct = (part, whole) => Math.round((part / whole) * 1000) / 10;
  return {
    completedOrders,
    sentTotal,
    clickedTotal,
    perSentPct: sentTotal > 0 ? pct(completedOrders, sentTotal) : null,
    perClickPct: clickedTotal > 0 && completedOrders <= clickedTotal ? pct(completedOrders, clickedTotal) : null,
  };
}

/**
 * Chuỗi hiển thị cho `key_metrics_analysis.conversion_rate.value` (FE `MetricCard` in nguyên chuỗi này).
 *
 * @param {ReturnType<typeof computeConversionMetrics>} metrics
 * @param {string} [locale='vi']
 * @returns {string} '—' khi không có mẫu số nào
 */
function formatConversionValue(metrics, locale = 'vi') {
  const en = locale === 'en';
  const parts = [];
  // Thẻ trên UI tên "Chuyển đổi (click → mua)" nên tỉ lệ theo lượt bấm đứng trước; mỗi tỉ lệ ghi rõ mẫu số.
  if (metrics.perClickPct != null) {
    parts.push(en
      ? `${metrics.completedOrders} completed orders / ${metrics.clickedTotal} clicked messages = ${metrics.perClickPct}%`
      : `${metrics.completedOrders} đơn đã mua / ${metrics.clickedTotal} tin có người bấm = ${metrics.perClickPct}%`);
  }
  if (metrics.perSentPct != null) {
    parts.push(en
      ? `${metrics.completedOrders} completed orders / ${metrics.sentTotal} messages sent = ${metrics.perSentPct}%`
      : `${metrics.completedOrders} đơn đã mua / ${metrics.sentTotal} tin đã gửi = ${metrics.perSentPct}%`);
  }
  return parts.length ? parts.join('; ') : '—';
}

/**
 * Ghi đè `key_metrics_analysis.conversion_rate.value` bằng số SERVER đã tính; model chỉ còn viết `comment`.
 * Chỉ chạm khi model đã trả `key_metrics_analysis` dạng object — không tự dựng khối này (FE chọn nhánh hiển thị
 * "có cấu trúc" theo sự hiện diện của nó).
 *
 * @param {object} payload payload đã parse từ model
 * @param {object|null|undefined} overview `snapshot.overview`
 * @param {string} locale
 * @returns {object}
 */
function applyServerComputedMetrics(payload, overview, locale) {
  const km = payload?.key_metrics_analysis;
  if (!km || typeof km !== 'object' || Array.isArray(km)) return payload;
  const prev = km.conversion_rate;
  const prevObject = prev && typeof prev === 'object' && !Array.isArray(prev)
    ? prev
    : (typeof prev === 'string' && prev.trim() ? { comment: prev } : {});
  return {
    ...payload,
    key_metrics_analysis: {
      ...km,
      conversion_rate: { ...prevObject, value: formatConversionValue(computeConversionMetrics(overview), locale) },
    },
  };
}

/**
 * Gom payload an toàn gửi Gemini từ snapshot do SERVER tính (dashboardAnalyticsService.getInsightSnapshot). Chuỗi theo
 * ngày được rút gọn để tránh MAX_TOKENS / JSON cắt đứt, còn phần tóm tắt tính trên chuỗi đầy đủ.
 *
 * @param {object} snapshot `{ filters, overview, dailySent, ordersTimeline, campaigns }`
 * @param {object} [opts]
 * @param {number} [opts.timelineHead=14]
 * @param {number} [opts.timelineTail=14]
 * @returns {object}
 */
function buildInsightSafePayload(snapshot, { timelineHead = 14, timelineTail = 14 } = {}) {
  const source = snapshot && typeof snapshot === 'object' ? snapshot : {};
  return {
    filters: source.filters || null,
    overview: source.overview || null,
    campaigns: Array.isArray(source.campaigns) ? source.campaigns : [],
    summary: summarizeTimelines(source.dailySent, source.ordersTimeline),
    dailySent: shrinkTimeline(source.dailySent || [], timelineHead, timelineTail),
    ordersTimeline: shrinkTimeline(source.ordersTimeline || [], timelineHead, timelineTail),
  };
}

/**
 * Dựng phần mô tả số liệu dạng markdown từ snapshot của server. Mọi con số ở đây cùng nguồn với các thẻ / biểu đồ /
 * bảng trên trang Báo cáo (module sendStats + customer_purchases) — không có số nào do trình duyệt gửi lên và
 * không đọc bộ đếm lượt chạy (campaign_runs).
 *
 * @param {object} safePayload kết quả buildInsightSafePayload
 * @returns {string}
 */
function buildDataMarkdownSection(safePayload) {
  const ov = safePayload?.overview || {};
  const filters = safePayload?.filters || {};
  const sent = ov.sent || {};
  const failed = ov.failed || {};
  const email = ov.email || {};
  const clicks = ov.clicks || {};
  const orders = ov.orders || {};
  const fmt = (n) => Number(n || 0);
  const channelList = (rows, key) => {
    const parts = (Array.isArray(rows) ? rows : [])
      .filter((row) => Number(row[key] || 0) > 0)
      .map((row) => `${insightChannelLabel(row.channel)}: ${fmt(row[key])}`);
    return parts.length ? parts.join(' | ') : '—';
  };
  const orderChannelList = (Array.isArray(orders.byChannel) ? orders.byChannel : [])
    .map((row) => `${insightChannelLabel(row.channel)}: chờ ${fmt(row.pending)}, đã mua ${fmt(row.completed)}`)
    .join(' | ') || '—';

  const emailLine = fmt(email.sent) > 0
    ? `- Email: gửi ${fmt(email.sent)} thư; đã mở ${fmt(email.opened)} (${fmt(email.openRate)}% số thư đã gửi); đã bấm link ${fmt(email.clicked)} (${fmt(email.clickRate)}% số thư đã gửi)`
    : '- Email: không có thư nào được gửi trong kỳ (không tính tỉ lệ mở / bấm link)';

  const campaignLines = (safePayload?.campaigns || []).length
    ? safePayload.campaigns
      .map((c) => {
        const name = c.campaignName || (c.campaignId == null ? '(chiến dịch đã xoá)' : `Chiến dịch #${c.campaignId}`);
        return `- ${name}${c.campaignType ? ` (${c.campaignType})` : ''}: đã gửi ${fmt(c.sent)} · chưa gửi được ${fmt(c.failed)} · mở ${fmt(c.opened)} · nhấp ${fmt(c.clicked)} · đã mua ${fmt(c.purchased)}`;
      })
      .join('\n')
    : '- (không có)';

  const summary = safePayload?.summary || {};

  return [
    '## Phạm vi bộ lọc',
    `- Từ ${filters.startDate || '—'} đến ${filters.endDate || '—'} (ngày giờ Việt Nam)`,
    `- Loại kênh: ${filters.campaignType || 'all'}`,
    `- CampaignIds: ${Array.isArray(filters.campaignIds) && filters.campaignIds.length ? filters.campaignIds.join(', ') : 'tất cả trong phạm vi quyền'}`,
    '',
    '## SỐ LIỆU TỔNG QUAN (đếm từ bảng tin nhắn — trùng các thẻ trên trang Báo cáo)',
    `- Đã gửi (số tin, không gồm lời mời kết bạn Zalo): ${fmt(sent.total)} — theo kênh: ${channelList(sent.byChannel, 'sent')}`,
    `- Lời mời kết bạn Zalo đã gửi (dòng riêng, không cộng vào Đã gửi): ${fmt(sent.friendRequests)}`,
    `- Chưa gửi được (số người nhận chưa nhận được tin sau khi đã thử lại): ${fmt(failed.total)}`,
    emailLine,
    `- Lượt nhấp link ở mọi kênh (số tin có người bấm): ${fmt(clicks.total)} — theo kênh: ${channelList(clicks.byChannel, 'clicked')}`,
    `- Khách để lại thông tin (đơn chờ): ${fmt(orders.pending)}; Đã mua: ${fmt(orders.completed)} — theo kênh: ${orderChannelList}`,
    `- Tỉ lệ chuyển đổi (SERVER ĐÃ TÍNH — dùng nguyên văn, KHÔNG tự tính lại; là tỉ lệ giữa hai số đếm CÙNG KỲ, không theo dõi từng khách): ${formatConversionValue(computeConversionMetrics(ov), 'vi')}`,
    '',
    '## CHIẾN DỊCH TRONG KỲ (tối đa 10, sắp theo số đã gửi)',
    campaignLines,
    '',
    '## XU HƯỚNG THEO THỜI GIAN (tóm tắt trên toàn bộ khoảng)',
    JSON.stringify(summary, null, 2),
    '',
    '## ĐÃ GỬI MỖI NGÀY (đã rút gọn nếu dài; total = cộng các kênh, không gồm lời mời kết bạn)',
    JSON.stringify(safePayload?.dailySent || [], null, 2),
    '',
    '## ĐƠN HÀNG THEO NGÀY (đã rút gọn nếu dài; chỉ nhìn xu hướng)',
    JSON.stringify(safePayload?.ordersTimeline || [], null, 2),
  ].join('\n');
}

/**
 * Prompt phân tích chuyên sâu — yêu cầu JSON đúng schema (kèm khối charts cho UI).
 *
 * Luồng hoạt động:
 * 1. Ép model đọc đúng số liệu server đã tính (không bịa số mới) và đúng nghĩa từng số.
 * 2. Yêu cầu so khớp chuỗi theo ngày với số tổng quan để nêu mâu thuẫn dữ liệu khi có.
 * 3. Chỉ hỏi những khối còn hiện trên trang: tổng quan, biểu đồ «Đã gửi mỗi ngày», biểu đồ đơn hàng (của chủ).
 *
 * @param {string} dataMarkdown - Khối markdown số liệu đã chuẩn hóa
 * @param {string} [locale='vi'] - Ngôn ngữ ('vi' hoặc 'en')
 * @returns {string} Prompt đầy đủ gửi Gemini
 */
function buildAnalysisPrompt(dataMarkdown, locale = 'vi') {
  if (locale === 'en') {
    return [
      'You are a senior marketing analytics expert with 10+ years of experience in email marketing, Zalo marketing, and sales campaign optimization.',
      '',
      'Task: Read the REPORT DATA below (strictly following the filters), analyze the metrics closely, and do not invent new numbers.',
      'Meaning of each number (use exactly): "Đã gửi" = number of MESSAGES sent (Zalo friend requests are a separate line and NOT included); "Chưa gửi được" = number of RECIPIENTS who still did not receive the message after retries; "Email opened / clicked" = % of the emails sent in the period (each email counted once); "Khách để lại thông tin" = pending orders, "Đã mua" = completed orders.',
      '',
      '=== DATA ===',
      dataMarkdown,
      '',
      '=== OUTPUT REQUIREMENTS ===',
      'Return ONLY a single valid JSON object (UTF-8), without markdown code fences, without any commentary outside JSON.',
      'Language: English. All text in the response (overview, key metrics, insights, channel analysis, recommendations, chart analyses, notes) MUST be written in professional English.',
      'CRITICAL — JSON syntax: in all string fields (overview, charts.*, …) do NOT insert raw double quotes ("); use **bold** or single quotes within text. If the JSON schema deviates, the client will fail to render insights.',
      '',
      'REPORT BLOCKS MAPPING → JSON (every `charts.*` field MUST contain actual markdown content, do not leave empty if relevant data exists):',
      '- "Đơn hàng theo thời gian" chart (pending & completed orders over time): `charts.ordersTrend.summary` (Summary tab) and `charts.ordersTrend.compare` (Channel comparison on the orders timeline).',
      '- "Đã gửi mỗi ngày" chart (messages sent per day, stacked by channel): `charts.channelEngagement.all` — explain peaks/anomalies and the channel mix.',
      '',
      'JSON Schema (all keys required; use empty string "" if no information):',
      '{',
      '  "overview": "Overall summary of campaign performance in 1-3 sentences",',
      '  "key_metrics_analysis": {',
      '    "open_rate": { "value": "share of emails opened or —", "benchmark": "General industry reference level, labelled as a REFERENCE only (not a measurement of this account), or —", "assessment": "good|average|poor", "comment": "brief comment" },',
      '    "click_rate": { "value": "share of emails with a clicked link or —", "benchmark": "General industry reference level, labelled as a REFERENCE only, or —", "assessment": "good|average|poor", "comment": "brief comment" },',
      '    "conversion_rate": { "comment": "comment on the bottom of the funnel, based on the ratio the SERVER already computed in the data section; do NOT recompute it and do not add new numbers" }',
      '  },',
      '  "insights": [',
      '    { "title": "...", "type": "opportunity|problem|warning|trend", "priority": "high|medium|low", "detail": "...", "impact": "..." }',
      '  ],',
      '  "channel_analysis": {',
      '    "best_channel": "Most effective channel + brief data-backed rationale",',
      '    "underperforming_channel": "Weakest channel / needs improvement + signs from sends, failures, clicks and orders",',
      '    "recommendation": "Coordinated multi-channel strategy: prioritization, timing, distinct roles of each channel in use"',
      '  },',
      '  "funnel_analysis": {',
      '    "bottleneck": "...",',
      '    "drop_off_stage": "...",',
      '    "suggestion": "..."',
      '  },',
      '  "action_plan": [',
      '    { "priority": 1, "action": "...", "expected_result": "qualitative signal to watch that shows the action works (NO forecast numbers or percentages)", "timeline": "..." }',
      '  ],',
      '  "risk_warning": "Risk warning if metrics are not improved (1-2 sentences)",',
      '  "charts": {',
      '    "ordersTrend": {',
      '      "summary": "markdown: «Summary» tab (total pending + completed orders over time); 4-8 bullets; **Trend**, **Data Discrepancies** if the timeline diverges from the overview, **Conclusion**.",',
      '      "compare": "markdown: «Compare Channels» tab (email/zalo/zalo group × pending/completed on the ORDERS TIMELINE); compare channels, temporal hotspots, **Conclusion**."',
      '    },',
      '    "channelEngagement": {',
      '      "all": "markdown: «Sent per day» chart — sending cadence, peak days, channel mix, share of recipients not reached; recommendation for coordination / distribution of effort."',
      '    }',
      '  },',
      '  "notes": [ "data limitation warnings if any (e.g., abbreviated timeline)" ]',
      '}',
      '',
      'Formatting rules for insights (charts.* — string or per field in channelEngagement):',
      '- Write in light markdown: each key point on a new line starting with \"- \".',
      '- Use **labels or key numbers** in bold; avoid long unbroken paragraphs.',
      'Analysis rules:',
      '- For charts.ordersTrend.summary: only use combined pendingOrders + completedOrders.',
      '- For charts.ordersTrend.compare: inspect emailPendingOrders, emailCompletedOrders, zalo*, zaloGroup* on the ORDERS TIMELINE; compare channels and seasonal patterns; note discrepancies if the timeline diverges from the overview.',
      '- Legacy: if model returns ordersTrend as a single string, system attaches to summary; compare may be empty.',
      '- For charts.channelEngagement.all: use the SENT PER DAY series and the channel mix; do not talk about opens / clicks per day (not in that chart).',
      '- For channel_analysis: only discuss channels that appear in the data (do not invent channels with no messages), and say plainly when a channel is unused.',
      '- Prioritize actionable insights that can be executed within 7-30 days.',
      '- Keep benchmark comparisons qualitative and balanced when data is sparse.',
      '- Industry benchmarks, if mentioned, are general references only: label them "reference", never present them as a measured result of this account, and do NOT forecast numeric outcomes.',
      '- conversion_rate.value is filled in by the server from the data section: write only its comment, never recompute or invent ratios.',
      '- If completed orders are disproportionately low compared to clicks/sends, diagnose funnel bottleneck with testable hypothesis.',
    ].join('\n');
  }

  return [
    'Bạn là chuyên gia phân tích marketing với 10+ năm kinh nghiệm về email marketing, Zalo marketing và tối ưu hóa chiến dịch bán hàng.',
    '',
    'Nhiệm vụ: đọc SỐ LIỆU BÁO CÁO dưới đây (theo đúng bộ lọc), phân tích sát số liệu, không bịa số mới.',
    'Nghĩa từng số (dùng đúng): "Đã gửi" = số TIN đã gửi (KHÔNG gồm lời mời kết bạn Zalo — dòng riêng); "Chưa gửi được" = số NGƯỜI NHẬN vẫn chưa nhận được tin sau khi đã thử lại; "Email đã mở / đã bấm link" = % số thư đã gửi trong kỳ (mỗi thư đếm một lần); "Khách để lại thông tin" = đơn chờ, "Đã mua" = đơn hoàn tất.',
    '',
    '=== DỮ LIỆU ===',
    dataMarkdown,
    '',
    '=== YÊU CẦU ĐẦU RA ===',
    'Trả về DUY NHẤT một JSON hợp lệ (UTF-8), không markdown, không giải thích ngoài JSON.',
    'Ngôn ngữ: tiếng Việt đầy đủ dấu.',
    'QUAN TRỌNG — cú pháp JSON: trong mọi chuỗi (overview, charts.*, …) KHÔNG được chèn ký tự dấu ngoặc kép nháy đôi (") thô; dùng **in đậm** hoặc dấu nháy đơn trong văn bản. Nếu lệch schema JSON, client sẽ không hiển thị insight.',
    '',
    'ÁNH XẠ KHỐI TRÊN TRANG BÁO CÁO → JSON (bắt buộc mỗi mục `charts.*` có nội dung markdown thực sự, không để trống nếu DỮ LIỆU có liên quan):',
    '- Biểu đồ «Đơn hàng theo thời gian» / xu hướng đơn chờ & đã đặt: `charts.ordersTrend.summary` (tab Tổng hợp) và `charts.ordersTrend.compare` (tab So sánh kênh theo chuỗi ĐƠN HÀNG THEO NGÀY).',
    '- Biểu đồ «Đã gửi mỗi ngày» (số tin gửi theo ngày, xếp chồng theo kênh): `charts.channelEngagement.all` — giải thích đỉnh/lệch và cơ cấu kênh.',
    '',
    'Schema JSON (bắt buộc đủ key; chuỗi rỗng "" nếu không có thông tin):',
    '{',
    '  "overview": "Tóm tắt tổng thể hiệu suất chiến dịch trong 1-3 câu",',
    '  "key_metrics_analysis": {',
    '    "open_rate": { "value": "% thư đã mở hoặc —", "benchmark": "Mức tham chiếu chung của ngành, ghi rõ là THAM KHẢO (không phải số đo của tài khoản này) hoặc —", "assessment": "tốt|trung bình|kém", "comment": "nhận xét ngắn" },',
    '    "click_rate": { "value": "% thư có người bấm link hoặc —", "benchmark": "Mức tham chiếu chung của ngành, ghi rõ là THAM KHẢO hoặc —", "assessment": "tốt|trung bình|kém", "comment": "nhận xét ngắn" },',
    '    "conversion_rate": { "comment": "nhận xét về phễu cuối, dựa trên tỉ lệ SERVER ĐÃ TÍNH ở mục dữ liệu; KHÔNG tự tính lại, không thêm số mới" }',
    '  },',
    '  "insights": [',
    '    { "title": "...", "type": "opportunity|problem|warning|trend", "priority": "high|medium|low", "detail": "...", "impact": "..." }',
    '  ],',
    '  "channel_analysis": {',
    '    "best_channel": "Kênh hiệu quả nhất + lý do ngắn theo số liệu",',
    '    "underperforming_channel": "Kênh yếu / cần cải thiện + dấu hiệu từ số gửi, chưa gửi được, nhấp, đơn",',
    '    "recommendation": "Chiến lược phối hợp các kênh đang dùng: phân bổ ưu tiên, thời điểm, vai trò từng kênh"',
    '  },',
    '  "funnel_analysis": {',
    '    "bottleneck": "...",',
    '    "drop_off_stage": "...",',
    '    "suggestion": "..."',
    '  },',
    '  "action_plan": [',
    '    { "priority": 1, "action": "...", "expected_result": "dấu hiệu định tính cần theo dõi để biết hành động có tác dụng (KHÔNG ghi con số / phần trăm dự báo)", "timeline": "..." }',
    '  ],',
    '  "risk_warning": "Cảnh báo rủi ro nếu không cải thiện (1-2 câu)",',
    '  "charts": {',
    '    "ordersTrend": {',
    '      "summary": "markdown: tab «Tổng hợp» (đơn chờ + đã đặt theo thời gian); 4-8 bullet; **Xu hướng**, **Mâu thuẫn dữ liệu** nếu chuỗi lệch tổng quan, **Kết luận**.",',
    '      "compare": "markdown: tab «So sánh kênh» (email/zalo/zalo nhóm × chờ/đặt trên chuỗi ĐƠN HÀNG THEO NGÀY); so sánh kênh, điểm nóng thời gian, **Kết luận**."',
    '    },',
    '    "channelEngagement": {',
    '      "all": "markdown: biểu đồ «Đã gửi mỗi ngày» — nhịp gửi, ngày cao điểm, cơ cấu kênh, tỉ lệ người chưa nhận được tin; gợi ý phối hợp / phân bổ nỗ lực."',
    '    }',
    '  },',
    '  "notes": [ "cảnh báo giới hạn dữ liệu nếu có (vd: chuỗi ngày rút gọn)" ]',
    '}',
    '',
    'Quy tắc định dạng insight (charts.* — chuỗi hoặc từng field trong channelEngagement):',
    '- Viết bằng markdown nhẹ: mỗi ý chính là một dòng bắt đầu bằng \"- \".',
    '- Dùng **nhãn hoặc số then chốt** để in đậm; tránh một đoạn văn dài không xuống dòng.',
    'Quy tắc phân tích:',
    '- Với charts.ordersTrend.summary: như trên nhưng chỉ dùng pendingOrders + completedOrders (tổng).',
    '- Với charts.ordersTrend.compare: đọc emailPendingOrders, emailCompletedOrders, zalo*, zaloGroup* trên chuỗi ĐƠN HÀNG THEO NGÀY; so sánh kênh và mùa vụ; nêu **Mâu thuẫn dữ liệu** nếu chuỗi lệch tổng quan.',
    '- Legacy: nếu model trả ordersTrend là một chuỗi, hệ thống gắn vào summary; compare có thể rỗng.',
    '- Với charts.channelEngagement.all: dựa trên chuỗi ĐÃ GỬI MỖI NGÀY và cơ cấu kênh; không nói về mở / nhấp theo ngày (biểu đồ đó không có).',
    '- Với channel_analysis: chỉ bàn các kênh có trong dữ liệu (không bịa kênh không có tin), nói thẳng khi một kênh chưa được dùng.',
    '- Ưu tiên insight hành động được (actionable), có thể làm trong 7-30 ngày.',
    '- So sánh benchmark ở mức định tính, không cứng nhắc nếu dữ liệu thiếu.',
    '- Mốc chuẩn ngành (nếu nêu) chỉ là THAM KHẢO chung: ghi rõ chữ "tham khảo", không trình bày như số đo của tài khoản này; KHÔNG dự báo con số kết quả.',
    '- conversion_rate.value do server điền từ mục dữ liệu: chỉ viết comment, không tự tính lại hay bịa tỉ lệ.',
    '- Nếu đơn đã mua rất thấp so với nhấp/gửi, nêu nút thắt phễu và giả thuyết kiểm chứng được.',
  ].join('\n');
}

/**
 * Trần thời gian TỔNG cho cả lượt "Phân tích bằng AI" (D-09). Cloudflare cắt request /api sau 100 s nhưng server vẫn chạy
 * tiếp, ghi kết quả và tốn tiền Gemini — khách thấy lỗi rồi bấm lại. Trước đây mỗi lời gọi 120 s × tối đa 2 lượt (lượt thứ hai là
 * bản rút gọn khi lượt đầu không đọc được JSON) nên một lượt có thể chạy tới 240 s. 85 s chừa ~15 s cho truy vấn số liệu + trả lời.
 */
export const INSIGHT_TOTAL_BUDGET_MS = 85000;

/** Còn dưới mức này thì KHÔNG chạy lượt rút gọn: một lượt Gemini sinh JSON dài hiếm khi xong trong < 40 s. */
export const INSIGHT_RETRY_MIN_REMAINING_MS = 40000;

/**
 * Mốc đổi cách tính của trang Báo cáo (PR-5 `31608616`, 30/09/2026 19:21 giờ VN = 12:21 UTC).
 * Bản phân tích lưu TRƯỚC mốc này dựng từ số liệu và prompt cũ (có thể chứa câu cảnh báo "không nhất quán" đã sai
 * thời đó) nên không trả cho UI nữa — người dùng bấm "Phân tích bằng AI" để có bản mới. Mọi client dùng chung luật này.
 */
export const SAVED_INSIGHT_MIN_CREATED_AT = new Date('2026-09-30T12:21:00.000Z');

class DashboardInsightsService {
  /**
   * Sinh insight dashboard bằng Gemini dựa trên snapshot số liệu do SERVER tính.
   *
   * Luồng hoạt động:
   * 1. Nhận `snapshot` (dashboardAnalyticsService.getInsightSnapshot — cùng nguồn với các thẻ trên trang Báo cáo).
   * 2. Rút gọn chuỗi theo ngày, dựng mô tả markdown số liệu.
   * 3. Gọi Gemini với JSON mode + token đủ lớn, trong MỘT ngân sách thời gian tổng `INSIGHT_TOTAL_BUDGET_MS` (cả lượt rút gọn).
   * 4. Parse + chuẩn hóa schema; nếu lỗi thì trả fallback có `notes` và cờ `parseFailed`.
   *
   * @param {object} input
   * @param {number} [input.userId] chủ workspace (chọn model + ghi token)
   * @param {object} input.snapshot `{ filters, overview, dailySent, ordersTimeline, campaigns }`
   * @param {string} [input.locale='vi']
   * @returns {Promise<{ success: boolean, data: object }>}
   */
  async generateInsights({ userId, snapshot, locale = 'vi' }) {
    let lastText = '';
    let lastFinish = '';
    let lastBlock = '';
    let usedCompactRetry = false;
    const deadline = Date.now() + INSIGHT_TOTAL_BUDGET_MS;
    const msLeft = () => deadline - Date.now();
    const insightModel = userId
      ? await resolveAllowedModel(userId, process.env.GEMINI_MODEL || 'gemini-2.5-flash')
      : (process.env.GEMINI_MODEL || 'gemini-2.5-flash');

    const runOnce = async (safePayload) => {
      const dataMarkdown = buildDataMarkdownSection(safePayload);
      const prompt = buildAnalysisPrompt(dataMarkdown, locale);
      // Phần ngân sách còn lại của CẢ lượt (không phải 120 s mới cho mỗi lời gọi): lõi huỷ fetch đang chạy đúng hạn và ném
      // AI_TIMEOUT tiếng Việt, nên request không còn sống tiếp sau khi Cloudflare đã cắt.
      const budgetMs = Math.max(1, msLeft());
      const result = await generateGeminiContent({
        parts: [{ text: prompt }],
        model: insightModel,
        timeoutMs: budgetMs,
        totalTimeoutMs: budgetMs,
        jsonMode: true,
        maxOutputTokens: resolveInsightMaxOutputTokens(insightModel),
        feature: 'dashboard_insights',
        ownerUserId: userId || null,
      });
      // Ghi token cho dashboard admin (credit user đã trừ ở route /dashboard/insights).
      // record() tự nuốt lỗi nên không ảnh hưởng luồng insight.
      if (userId) {
        await aiUsageMeter.record(userId, result?.usage, {
          feature: 'dashboard_insights',
          model: insightModel,
        });
      }
      return result;
    };

    let safePayload = buildInsightSafePayload(snapshot, { timelineHead: 14, timelineTail: 14 });
    let { text, finishReason, blockReason } = await runOnce(safePayload);
    lastText = text;
    lastFinish = finishReason;
    lastBlock = blockReason;

    let parsed = parseInsightJson(text);

    if (
      !parsed &&
      !blockReason &&
      (finishReason === 'MAX_TOKENS' || (typeof text === 'string' && text.length > 0)) &&
      // D-09: lượt đầu đã ngốn gần hết ngân sách thì bỏ lượt rút gọn — chạy tiếp chỉ để bị Cloudflare cắt giữa chừng.
      msLeft() >= INSIGHT_RETRY_MIN_REMAINING_MS
    ) {
      usedCompactRetry = true;
      safePayload = buildInsightSafePayload(snapshot, { timelineHead: 5, timelineTail: 5 });
      ({ text, finishReason, blockReason } = await runOnce(safePayload));
      lastText = text;
      lastFinish = finishReason;
      lastBlock = blockReason;
      parsed = parseInsightJson(text);
    }

    if (parsed && typeof parsed === 'object') {
      const notes = Array.isArray(parsed.notes) ? [...parsed.notes] : [];
      if (usedCompactRetry) {
        notes.push(
          locale === 'en'
            ? 'The system automatically compacted the per-day series in the prompt and retried Gemini (first attempt could not be parsed or was truncated).'
            : 'Hệ thống đã tự động thu gọn chuỗi theo ngày trong prompt và gọi Gemini lần 2 (lần 1 không parse được hoặc có nguy cơ cắt đầu ra).'
        );
      }
      if (lastFinish === 'MAX_TOKENS') {
        notes.push(
          locale === 'en'
            ? 'Gemini finished due to reaching the maximum output token limit; some sections may be truncated.'
            : 'Gemini kết thúc do đạt giới hạn độ dài đầu ra; một số mục có thể bị rút gọn.'
        );
      }
      return {
        success: true,
        data: normalizeInsightPayload(applyServerComputedMetrics({ ...parsed, notes }, snapshot?.overview, locale)),
      };
    }

    // Không đọc được kết quả của AI. Vẫn trả khung lỗi (`success: true`) để UI báo cho người dùng, nhưng gắn `parseFailed` —
    // tín hiệu để controller KHÔNG trừ credit và `persistInsightIfUsable` KHÔNG lưu DB (D-10). Câu chữ dành cho KHÁCH:
    // không nhắc tên biến môi trường (trước đây ghi "Kiểm tra GEMINI_MODEL … GEMINI_API_KEY" — lộ cấu hình máy chủ).
    return {
      success: true,
      data: normalizeInsightPayload({
        parseFailed: true,
        overview:
          typeof lastText === 'string' && lastText.length > 0
            ? (locale === 'en'
                ? `Failed to parse JSON from Gemini. Raw output (may be truncated):\n${lastText.slice(0, 2000)}`
                : `Không parse được JSON từ Gemini. Bản thô (có thể cắt):\n${lastText.slice(0, 2000)}`)
            : (locale === 'en'
                ? 'No content received from Gemini.'
                : 'Không nhận được nội dung từ Gemini.'),
        charts: defaultCharts(),
        notes: [
          locale === 'en'
            ? 'Could not parse the complete JSON from the AI. Please run the analysis again; this attempt is not charged.'
            : 'Không parse được JSON đầy đủ từ AI. Bạn vui lòng bấm phân tích lại; lượt này không bị tính credit.',
          lastFinish ? `Gemini finishReason: ${lastFinish}` : '',
          lastBlock ? (locale === 'en' ? `Prompt blocked: ${lastBlock}` : `Chặn prompt: ${lastBlock}`) : '',
          usedCompactRetry
            ? (locale === 'en' ? 'Retried with compacted prompt but still could not parse JSON.' : 'Đã thử prompt thu gọn nhưng vẫn không parse được JSON.')
            : '',
        ].filter(Boolean),
      }),
    };
  }

  /**
   * Lưu insight vào DB: xóa insight cũ của user, chèn bản mới (chỉ khi payload đủ dùng, không lưu fallback lỗi parse).
   *
   * Luồng:
   * 1. Kiểm tra `userId` và `isInsightPayloadUsable(data)`.
   * 2. Gọi repository `replaceForUser` trong transaction.
   *
   * @param {number} userId
   * @param {object} data - Kết quả `normalizeInsightPayload` từ `generateInsights`
   * @param {object|null|undefined} filtersSnapshot - Bộ lọc dashboard lúc phân tích
   * @returns {Promise<boolean>} true nếu đã ghi DB
   */
  async persistInsightIfUsable(userId, data, filtersSnapshot) {
    const uid = Number(userId);
    if (!Number.isFinite(uid) || !data || typeof data !== 'object') return false;
    if (!isInsightPayloadUsable(data)) return false;
    await dashboardInsightRepository.replaceForUser(uid, data, filtersSnapshot ?? null);
    return true;
  }

  /**
   * Đọc insight đã lưu gần nhất của user (payload JSON đầy đủ cho UI).
   *
   * @param {number} userId
   * Trả null khi chưa có bản lưu HOẶC bản lưu tạo trước `SAVED_INSIGHT_MIN_CREATED_AT`.
   * `filtersSnapshot` là bộ lọc lúc phân tích (client so với bộ lọc đang xem trước khi hiện).
   *
   * @returns {Promise<{ savedAt: string, filtersSnapshot: object|null, insights: object } | null>}
   */
  async getSavedInsightForUser(userId) {
    const uid = Number(userId);
    if (!Number.isFinite(uid)) return null;
    const row = await dashboardInsightRepository.findLatestByUser(uid);
    if (!row) return null;
    const createdAt = row.created_at ? new Date(row.created_at) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime()) || createdAt < SAVED_INSIGHT_MIN_CREATED_AT) return null;
    return {
      savedAt: createdAt.toISOString(),
      filtersSnapshot: row.filters_snapshot ?? null,
      insights: row.payload,
    };
  }
}

export { buildInsightSafePayload, buildDataMarkdownSection, computeConversionMetrics, formatConversionValue };

export default new DashboardInsightsService();
