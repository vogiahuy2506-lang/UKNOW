/**
 * Lưu trữ insight dashboard trên localStorage (chỉ giữ bản phân tích gần nhất).
 *
 * Luồng hoạt động:
 * 1. Chỉ lưu payload đủ dùng cho UI (có key_metrics_analysis hoặc text insight biểu đồ).
 * 2. Sau JSON.parse từ localStorage, chuẩn hóa shape giống khi nhận từ API (unwrap, merge charts, parse chuỗi lồng).
 * 3. Bản lưu cũ không hợp lệ (fallback "Không parse được JSON...") sẽ bị bỏ qua / xóa khi đọc.
 */

const STORAGE_KEY = 'founder_dashboard_insight_latest';

/**
 * Trích object insight từ response axios `POST /dashboard/insights` (hỗ trợ `data` lồng hoặc payload phẳng).
 *
 * @param {{ data?: object }} [response] - Response axios
 * @returns {object|null}
 */
export function extractInsightFromDashboardInsightsResponse(response) {
  const body = response?.data;
  if (!body || typeof body !== 'object') return null;
  if (body.data != null && typeof body.data === 'object') {
    return body.data;
  }
  if (body.charts || body.key_metrics_analysis != null || typeof body.overview === 'string') {
    return body;
  }
  return null;
}

/**
 * Gỡ fence ```json ... ``` giống backend (phục vụ recovery từ overview).
 *
 * @param {string} text
 * @returns {string}
 */
function stripCodeFencesForInsight(text) {
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
 * Xóa dấu phẩy thừa trước } hoặc ] ngoài chuỗi JSON (đồng bộ backend).
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
 * Trích object JSON đầu tiên bằng đếm ngoặc (tương tự backend).
 *
 * @param {string} text
 * @returns {object|null}
 */
function extractJsonObject(text) {
  const s = stripCodeFencesForInsight(text);
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
    else if (ch === '}') {
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
 * Gỡ nhầm lớp bọ (lưu nhầm { data }, hoặc { insights } lồng).
 *
 * @param {object|null} raw
 * @returns {object|null}
 */
function unwrapInsightPayload(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.data && typeof raw.data === 'object' && (raw.data.charts != null || raw.data.key_metrics_analysis != null)) {
    return { ...raw.data };
  }
  if (raw.insights && typeof raw.insights === 'object' && raw.insights.charts != null && !raw.charts) {
    return { ...raw.insights };
  }
  return { ...raw };
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

/**
 * Chuẩn hóa `charts.channelEngagement` (legacy một chuỗi → chỉ nhánh `all`).
 *
 * @param {unknown} raw
 * @returns {{ all: string, email: string, zalo: string, zalo_group: string }}
 */
export function normalizeChannelEngagementForUi(raw) {
  if (raw == null) {
    return { all: '', email: '', zalo: '', zalo_group: '' };
  }
  if (typeof raw === 'string') {
    return { all: raw, email: '', zalo: '', zalo_group: '' };
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const pick = (k) => (typeof raw[k] === 'string' ? raw[k] : '');
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
 * Chuẩn hóa `charts.ordersTrend` từ API/DB: legacy chuỗi → `summary`; object `{ summary, compare }` giữ nguyên shape.
 *
 * @param {unknown} raw
 * @returns {{ summary: string, compare: string }}
 */
export function normalizeOrdersTrendForUi(raw) {
  if (raw == null) {
    return { summary: '', compare: '' };
  }
  if (typeof raw === 'string') {
    return { summary: raw, compare: '' };
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const pick = (k) => (typeof raw[k] === 'string' ? raw[k] : '');
    return {
      summary: pick('summary'),
      compare: pick('compare'),
    };
  }
  return { summary: '', compare: '' };
}

/**
 * Lấy markdown insight «Đơn hàng theo thời gian» đúng tab Tổng hợp / So sánh kênh.
 *
 * @param {object} [charts]
 * @param {'summary'|'compare'} mode
 * @returns {string}
 */
export function getOrdersTrendInsightForMode(charts, mode) {
  const ot = normalizeOrdersTrendForUi(charts?.ordersTrend);
  const s = (ot.summary || '').trim();
  const c = (ot.compare || '').trim();
  if (mode === 'compare') {
    return c || s;
  }
  return s || c;
}

/**
 * Lấy chuỗi insight «Tương tác theo kênh» đúng với tab đang xem (hoặc bản in từng kênh).
 *
 * @param {object} [charts]
 * @param {'all'|'email'|'zalo'|'zalo_group'} channelId
 * @param {{ forPrint?: boolean }} [options] - `forPrint: true`: insight legacy (một chuỗi) chỉ gắn tab «Tất cả», tránh lặp 4 trang PDF
 * @returns {string}
 */
export function getChannelEngagementInsightForChannel(charts, channelId, options = {}) {
  const { forPrint = false } = options;
  const ce = charts?.channelEngagement;
  if (ce == null) return '';
  if (typeof ce === 'string') {
    if (forPrint && channelId !== 'all') return '';
    return ce;
  }
  if (typeof ce === 'object' && !Array.isArray(ce)) {
    const key =
      channelId === 'all' || channelId === 'email' || channelId === 'zalo' || channelId === 'zalo_group'
        ? channelId
        : 'all';
    const direct = typeof ce[key] === 'string' ? ce[key].trim() : '';
    if (direct) return ce[key];
    const fallback = typeof ce.all === 'string' ? ce.all.trim() : '';
    return fallback ? ce.all : '';
  }
  return '';
}

/**
 * Gộp cấu trúc charts để mọi biểu đồ luôn có key (tránh mất insight từng chart khi đọc lại).
 *
 * @param {object} raw
 * @returns {object}
 */
function mergeChartsShape(raw) {
  const charts = {
    ...defaultCharts(),
    ...(raw.charts && typeof raw.charts === 'object' ? raw.charts : {}),
  };
  charts.channelBreakdown = {
    click: '',
    completed: '',
    pending: '',
    ...(charts.channelBreakdown && typeof charts.channelBreakdown === 'object' ? charts.channelBreakdown : {}),
  };
  charts.topLists = {
    topCourses: '',
    topCampaignsByOrders: '',
    topCampaignsByClicks: '',
    ...(charts.topLists && typeof charts.topLists === 'object' ? charts.topLists : {}),
  };
  charts.landingTopPages = typeof charts.landingTopPages === 'string' ? charts.landingTopPages : '';
  charts.channelEngagement = normalizeChannelEngagementForUi(charts.channelEngagement);
  charts.ordersTrend = normalizeOrdersTrendForUi(charts.ordersTrend);
  return charts;
}

/**
 * Thử parse key_metrics_analysis nếu Gemini/JSON.stringify trả về chuỗi.
 *
 * @param {unknown} km
 * @returns {object|null}
 */
function parseKeyMetricsIfString(km) {
  if (km && typeof km === 'object') return km;
  if (typeof km !== 'string' || !km.trim()) return null;
  try {
    const p = JSON.parse(km);
    return p && typeof p === 'object' ? p : null;
  } catch {
    return null;
  }
}

/**
 * Thử trích JSON đầy đủ từ trường overview (fallback backend nhét bản thô vào overview).
 *
 * @param {string} overview
 * @returns {object|null}
 */
function tryRecoverPayloadFromOverviewString(overview) {
  if (typeof overview !== 'string' || !overview.trim()) return null;
  const stripped = stripCodeFencesForInsight(overview);
  const t = stripped.trim();
  if (t.startsWith('{')) {
    try {
      const p = JSON.parse(t);
      if (p && typeof p === 'object' && (p.key_metrics_analysis || p.charts)) return p;
    } catch {
      try {
        const p2 = JSON.parse(removeTrailingCommasInJson(t));
        if (p2 && typeof p2 === 'object' && (p2.key_metrics_analysis || p2.charts)) return p2;
      } catch {
        /* tiếp extractJsonObject */
      }
      const ex = extractJsonObject(t);
      if (ex && typeof ex === 'object') return ex;
    }
  }
  const cut = stripped.indexOf('{');
  if (cut >= 0) {
    const ex = extractJsonObject(stripped.slice(cut));
    if (ex && typeof ex === 'object' && (ex.key_metrics_analysis || ex.charts)) return ex;
  }
  return null;
}

/**
 * Chuẩn hóa payload insight sau khi đọc từ API hoặc localStorage để UI luôn nhận cùng một shape.
 *
 * Luồng:
 * 1. unwrap lớp bọ nếu có.
 * 2. Nếu thiếu key_metrics nhưng overview chứa JSON hợp lệ → gộp vào.
 * 3. Parse key_metrics nếu là chuỗi.
 * 4. Merge charts mặc định.
 *
 * @param {object|null} raw
 * @returns {object|null}
 */
export function normalizeDashboardInsightForUi(raw) {
  let out = unwrapInsightPayload(raw);
  if (!out || typeof out !== 'object') return null;

  const kmParsed = parseKeyMetricsIfString(out.key_metrics_analysis);
  if (kmParsed) {
    out = { ...out, key_metrics_analysis: kmParsed };
  }

  if (!out.key_metrics_analysis || typeof out.key_metrics_analysis !== 'object') {
    const recovered = tryRecoverPayloadFromOverviewString(
      typeof out.overview === 'string' ? out.overview : ''
    );
    if (recovered) {
      const mergedChartsInput = {
        charts: {
          ...(recovered.charts && typeof recovered.charts === 'object' ? recovered.charts : {}),
          ...(out.charts && typeof out.charts === 'object' ? out.charts : {}),
        },
      };
      out = {
        ...recovered,
        ...out,
        key_metrics_analysis: recovered.key_metrics_analysis || out.key_metrics_analysis,
        charts: mergeChartsShape(mergedChartsInput),
      };
    }
  }

  out = {
    ...out,
    charts: mergeChartsShape(out),
    notes: Array.isArray(out.notes) ? out.notes : [],
  };

  return out;
}

/**
 * Payload là bản fallback khi backend không parse được JSON từ Gemini — không lưu / không xem lại như insight thật.
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
 * Chuỗi insight biểu đồ có nội dung (không chỉ rỗng).
 *
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
 * Payload có đủ nội dung để hiển thị / lưu (giữ đồng bộ với nhiều biến thể schema Gemini).
 *
 * Luồng:
 * - Loại bỏ fallback lỗi parse.
 * - Nhận `key_metrics_analysis` (object hoặc mảng không rỗng), `insights`, `action_plan`, `channel_analysis`…
 * - `charts` với chuỗi dùng `.trim()` (tránh sai vì chỉ `""` hoặc khoảng trắng).
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

/**
 * Ghi đè bản insight gần nhất (chỉ khi payload đủ dùng — không lưu bản fallback lỗi parse Gemini).
 *
 * @param {object|null} insights - Payload insight từ backend
 * @returns {boolean} true nếu lưu thành công
 */
export function saveLatestDashboardInsight(insights) {
  const normalized = normalizeDashboardInsightForUi(insights);
  if (!normalized || !isInsightPayloadUsable(normalized)) {
    return false;
  }
  try {
    const payload = {
      savedAt: new Date().toISOString(),
      insights: normalized,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch (e) {
    console.warn('Không thể lưu insight vào localStorage:', e);
    return false;
  }
}

/**
 * Đọc bản insight gần nhất đã lưu (đã chuẩn hóa). Bản cũ không dùng được sẽ bị xóa khỏi storage.
 *
 * @returns {{ savedAt: string, insights: object } | null}
 */
export function readLatestDashboardInsight() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || parsed.insights == null) {
      return null;
    }
    const insights = normalizeDashboardInsightForUi(parsed.insights);
    if (!insights || !isInsightPayloadUsable(insights)) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
      insights,
    };
  } catch (e) {
    console.warn('Không thể đọc insight từ localStorage:', e);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}

/**
 * Kiểm tra có bản insight đã lưu hay không (không throw).
 *
 * @returns {boolean}
 */
export function hasStoredDashboardInsight() {
  return readLatestDashboardInsight() !== null;
}
