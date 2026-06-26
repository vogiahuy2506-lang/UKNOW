import { generateGeminiText } from '../../utils/geminiClient.util.js';
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

/**
 * Tóm tắt timeline để đưa vào prompt (không cần toàn bộ điểm).
 *
 * @param {Array<object>} timeline
 * @returns {object}
 */
/**
 * Gom payload an toàn gửi Gemini (timeline + landing có thể cắt bớt để tránh MAX_TOKENS / JSON cắt đứt).
 *
 * @param {object} input
 * @param {object} [opts]
 * @param {number} [opts.timelineHead=14]
 * @param {number} [opts.timelineTail=14]
 * @param {number} [opts.landingRowCap=48] - Giới hạn số hàng landing đưa vào prompt (sắp xếp top vẫn trong buildDataMarkdownSection)
 * @returns {object}
 */
function buildInsightSafePayload(
  { overview, analytics, topListsData, landingPageStats, filters },
  { timelineHead = 14, timelineTail = 14, landingRowCap = 48 } = {}
) {
  const rows =
    landingPageStats && typeof landingPageStats === 'object' && Array.isArray(landingPageStats.rows)
      ? landingPageStats.rows
      : [];
  return {
    filters: filters || overview?.filters || analytics?.filters || null,
    overview: overview
      ? {
          headline: overview.headline || null,
          channels: overview.channels || null,
          journeyEvents: overview.journeyEvents || null,
        }
      : null,
    analytics: analytics
      ? {
          timeline: shrinkTimeline(analytics.timeline || [], timelineHead, timelineTail),
        }
      : null,
    topLists: topListsData
      ? {
          topCourses: topListsData.topCourses || [],
          topCampaignsByOrders: topListsData.topCampaignsByOrders || [],
          topCampaignsByClicks: topListsData.topCampaignsByClicks || [],
        }
      : null,
    landingPageStats: { rows: rows.slice(0, landingRowCap) },
  };
}

function summarizeTimeline(timeline = []) {
  if (!Array.isArray(timeline) || timeline.length === 0) {
    return { note: 'Không có dữ liệu timeline' };
  }

  const sum = (key) => timeline.reduce((acc, row) => acc + Number(row[key] || 0), 0);

  const pendingTotal = sum('pendingOrders');
  const completedTotal = sum('completedOrders');
  const emailSentTotal = sum('emailSent');
  const zaloSentTotal = sum('zaloSent');
  const zaloGroupSentTotal = sum('zaloGroupSent');

  const first = timeline[0];
  const last = timeline[timeline.length - 1];

  return {
    dateRange: `${first?.date || '—'} → ${last?.date || '—'}`,
    totals: {
      pendingOrders: pendingTotal,
      completedOrders: completedTotal,
      emailSent: emailSentTotal,
      zaloSent: zaloSentTotal,
      zaloGroupSent: zaloGroupSentTotal,
    },
    firstDaySample: first,
    lastDaySample: last,
  };
}

/**
 * Tính % cơ cấu 3 kênh từ số tuyệt đối (click / đơn chờ / đã mua journey).
 *
 * @param {object} overview
 * @returns {object}
 */
function buildChannelComposition(overview) {
  const je = overview?.journeyEvents || {};
  const ch = overview?.channels || {};

  const clickEmail = Number(je.emailClicked || 0);
  const clickZalo = Number(je.zaloClicked || 0);
  const clickZg = Number(je.zaloGroupClicked || 0);
  const clickSum = clickEmail + clickZalo + clickZg || 1;

  const pendEmail = Number(ch.email?.pendingOrderCount || 0);
  const pendZalo = Number(ch.zalo?.pendingOrderCount || 0);
  const pendZg = Number(ch.zaloGroup?.pendingOrderCount || 0);
  const pendSum = pendEmail + pendZalo + pendZg || 1;

  const doneEmail = Number(ch.email?.completedOrderCount || 0);
  const doneZalo = Number(ch.zalo?.completedOrderCount || 0);
  const doneZg = Number(ch.zaloGroup?.completedOrderCount || 0);
  const doneSum = doneEmail + doneZalo + doneZg || 1;

  const pct = (a, s) => `${((a / s) * 100).toFixed(1)}%`;

  return {
    clickByChannel: {
      email: { count: clickEmail, share: pct(clickEmail, clickSum) },
      zalo: { count: clickZalo, share: pct(clickZalo, clickSum) },
      zalo_group: { count: clickZg, share: pct(clickZg, clickSum) },
    },
    pendingByChannel: {
      email: { count: pendEmail, share: pct(pendEmail, pendSum) },
      zalo: { count: pendZalo, share: pct(pendZalo, pendSum) },
      zalo_group: { count: pendZg, share: pct(pendZg, pendSum) },
    },
    completedByChannel: {
      email: { count: doneEmail, share: pct(doneEmail, doneSum) },
      zalo: { count: doneZalo, share: pct(doneZalo, doneSum) },
      zalo_group: { count: doneZg, share: pct(doneZg, doneSum) },
    },
  };
}

/**
 * Dựng phần mô tả dữ liệu dạng markdown (giống ví dụ nghiệp vụ) từ payload thật.
 *
 * @param {object} safePayload
 * @returns {string}
 */
function buildDataMarkdownSection(safePayload) {
  const ov = safePayload?.overview;
  const hl = ov?.headline || {};
  const je = ov?.journeyEvents || {};
  const filters = safePayload?.filters || {};

  const totalSent =
    Number(je.emailSent || 0) + Number(je.zaloSent || 0) + Number(je.zaloGroupSent || 0);
  const totalClicks =
    Number(je.emailClicked || 0) + Number(je.zaloClicked || 0) + Number(je.zaloGroupClicked || 0);
  const openRate =
    Number(je.emailSent || 0) > 0
      ? `${((Number(je.emailOpened || 0) / Number(je.emailSent || 0)) * 100).toFixed(1)}%`
      : '—';
  const clickRateFromSent = totalSent > 0 ? `${((totalClicks / totalSent) * 100).toFixed(1)}%` : '—';

  const comp = buildChannelComposition(ov);

  const topCourses = (safePayload?.topLists?.topCourses || [])
    .slice(0, 5)
    .map(
      (c) =>
        `- ${c.productName || '(không tên)'}: ${c.pendingCount || 0} đơn chờ, ${c.completedCount || 0} đã mua`
    )
    .join('\n');

  const topCampOrders = (safePayload?.topLists?.topCampaignsByOrders || [])
    .slice(0, 5)
    .map(
      (c) =>
        `- ${c.campaignName || '(không tên)'} (${c.campaignType || '—'}): ${c.pendingCount || 0} chờ, ${c.completedCount || 0} đã mua`
    )
    .join('\n');

  const topCampClicks = (safePayload?.topLists?.topCampaignsByClicks || [])
    .slice(0, 5)
    .map((c) => {
      const sent = Number(c.sentCount || 0);
      const clk = Number(c.clickCount || 0);
      const rate = sent > 0 ? `${Math.round((clk / sent) * 100)}%` : '—';
      return `- ${c.campaignName || '(không tên)'} (${c.campaignType || '—'}): ${clk} click · ${sent} gửi · ${rate} click/gửi`;
    })
    .join('\n');

  /** Top landing theo tổng tương tác (giống logic sort biểu đồ dashboard) */
  const lpRows = Array.isArray(safePayload?.landingPageStats?.rows) ? safePayload.landingPageStats.rows : [];
  const topLandingSorted = [...lpRows].sort((a, b) => {
    const score = (x) =>
      Number(x.viewCount || 0) + Number(x.clickCount || 0) + Number(x.submitCount || 0);
    return score(b) - score(a);
  });
  // Mỗi dòng kèm CTR và form/xem để Gemini bắt buộc phân tích đủ 3 trục (xem — click — form) thay vì chỉ tóm tắt một chiều.
  const topLandingLines = topLandingSorted.slice(0, 10).length
    ? topLandingSorted
        .slice(0, 10)
        .map((r) => {
          const title = String(r.title || '').trim() || r.slug || '—';
          const ctr = r.clickThroughRatePct != null ? `${r.clickThroughRatePct}%` : '—';
          const fv = r.submitRateVsViewsPct != null ? `${r.submitRateVsViewsPct}%` : '—';
          return `- ${title} (slug: ${r.slug || '—'}): xem ${r.viewCount ?? 0} · click ${r.clickCount ?? 0} · form ${r.submitCount ?? 0} · CTR click/xem ${ctr} · form/xem ${fv}`;
        })
        .join('\n')
    : '- (không có)';

  const tlSummary = summarizeTimeline(safePayload?.analytics?.timeline || []);

  return [
    `## Phạm vi bộ lọc`,
    `- Từ ${filters.startDate || '—'} đến ${filters.endDate || '—'}`,
    `- Loại chiến dịch: ${filters.campaignType || 'all'}`,
    `- CampaignIds: ${Array.isArray(filters.campaignIds) && filters.campaignIds.length ? filters.campaignIds.join(', ') : 'tất cả trong phạm vi quyền'}`,
    '',
    '## DỮ LIỆU TỔNG QUAN (dashboard API)',
    `- Tổng chiến dịch (trong phạm vi): ${hl.totalCampaigns ?? '—'}`,
    `- Lượt chạy: ${hl.totalRuns ?? '—'} (đang chạy: ${hl.runningRuns ?? '—'}, hoàn thành: ${hl.completedRuns ?? '—'})`,
    `- Người nhận / gửi thành công / lỗi: ${hl.totalRecipients ?? '—'} / ${hl.successfulSends ?? '—'} / ${hl.failedSends ?? '—'}`,
    `- Tổng gửi (hành trình email_sent + zalo_sent): ${totalSent} (Email: ${je.emailSent ?? 0} | Zalo: ${je.zaloSent ?? 0} | Zalo Group: ${je.zaloGroupSent ?? 0})`,
    `- Email Open (ước lượng từ journey email_sent → email_opened): ${openRate} (${je.emailOpened ?? 0} mở / ${je.emailSent ?? 0} gửi email)`,
    `- Click (tổng journey email_clicked + zalo_clicked): ${totalClicks} — tỷ lệ click/gửi (tổng): ${clickRateFromSent}`,
    `- Đơn chờ / đã mua (customer_journey order_pending / theo purchases trong dashboard channels): chờ ${je.orderPending ?? '—'}; kênh: Email ${ov?.channels?.email?.pendingOrderCount ?? 0} | Zalo ${ov?.channels?.zalo?.pendingOrderCount ?? 0} | Zalo Group ${ov?.channels?.zaloGroup?.pendingOrderCount ?? 0}; đã mua: Email ${ov?.channels?.email?.completedOrderCount ?? 0} | Zalo ${ov?.channels?.zalo?.completedOrderCount ?? 0} | Zalo Group ${ov?.channels?.zaloGroup?.completedOrderCount ?? 0}`,
    '',
    '## CƠ CẤU THEO KÊNH (từ số liệu trên)',
    '### Click theo kênh (journey)',
    `- Email: ${comp.clickByChannel.email.share} (${comp.clickByChannel.email.count} clicks)`,
    `- Zalo: ${comp.clickByChannel.zalo.share} (${comp.clickByChannel.zalo.count} clicks)`,
    `- Zalo Group: ${comp.clickByChannel.zalo_group.share} (${comp.clickByChannel.zalo_group.count} clicks)`,
    '### Đơn chờ theo kênh (purchases / dashboard channels)',
    `- Email: ${comp.pendingByChannel.email.share} (${comp.pendingByChannel.email.count} đơn)`,
    `- Zalo: ${comp.pendingByChannel.zalo.share} (${comp.pendingByChannel.zalo.count} đơn)`,
    `- Zalo Group: ${comp.pendingByChannel.zalo_group.share} (${comp.pendingByChannel.zalo_group.count} đơn)`,
    '### Đã mua theo kênh',
    `- Email: ${comp.completedByChannel.email.share} (${comp.completedByChannel.email.count} đơn)`,
    `- Zalo: ${comp.completedByChannel.zalo.share} (${comp.completedByChannel.zalo.count} đơn)`,
    `- Zalo Group: ${comp.completedByChannel.zalo_group.share} (${comp.completedByChannel.zalo_group.count} đơn)`,
    '',
    '## TOP KHÓA HỌC CÓ NHIỀU ĐƠN',
    topCourses || '- (không có)',
    '',
    '## TOP CHIẾN DỊCH THEO ĐƠN',
    topCampOrders || '- (không có)',
    '',
    '## TOP CHIẾN DỊCH THEO CLICK (kèm gửi + tỷ lệ click/gửi nếu có sentCount)',
    topCampClicks || '- (không có)',
    '',
    '## TOP LANDING (xem / click tracking / gửi form — top 10 theo tổng tương tác)',
    topLandingLines,
    '',
    '## XU HƯỚNG THEO THỜI GIAN (tóm tắt timeline)',
    JSON.stringify(tlSummary, null, 2),
    '',
    '## TIMELINE (đã rút gọn nếu dài)',
    JSON.stringify(safePayload?.analytics?.timeline || [], null, 2),
  ].join('\n');
}

/**
 * Prompt phân tích chuyên sâu — yêu cầu JSON đúng schema (kèm khối charts cho UI).
 *
 * Luồng hoạt động (bổ sung chiến lược đa kênh):
 * 1. Ép model đọc timeline theo ngày (gửi Email / Zalo / Zalo Group và đơn).
 * 2. Yêu cầu so khớp timeline với tổng quan để phát hiện mâu thuẫn dữ liệu khi có.
 * 3. Tách insight tab «Tất cả» vs từng kênh thành góc nhìn marketing khác nhau.
 *
 * @param {string} dataMarkdown - Khối markdown dữ liệu dashboard đã chuẩn hóa
 * @returns {string} Prompt đầy đủ gửi Gemini
 */
function buildAnalysisPrompt(dataMarkdown) {
  return [
    'Bạn là chuyên gia phân tích marketing với 10+ năm kinh nghiệm về email marketing, Zalo marketing và tối ưu hóa chiến dịch bán hàng.',
    '',
    'Nhiệm vụ: đọc DỮ LIỆU DASHBOARD dưới đây (theo đúng bộ lọc), phân tích sát số liệu, không bịa số mới.',
    '',
    '=== DỮ LIỆU ===',
    dataMarkdown,
    '',
    '=== YÊU CẦU ĐẦU RA ===',
    'Trả về DUY NHẤT một JSON hợp lệ (UTF-8), không markdown, không giải thích ngoài JSON.',
    'Ngôn ngữ: tiếng Việt đầy đủ dấu.',
    'QUAN TRỌNG — cú pháp JSON: trong mọi chuỗi (overview, charts.*, …) KHÔNG được chèn ký tự dấu ngoặc kép nháy đôi (") thô; dùng **in đậm** hoặc dấu nháy đơn trong văn bản. Nếu lệch schema JSON, client sẽ không hiển thị insight.',
    '',
    'ÁNH XẠ BIỂU ĐỒ DASHBOARD → JSON (bắt buộc mỗi mục `charts.*` có nội dung markdown thực sự, không để trống nếu DỮ LIỆU có liên quan):',
    '- Biểu đồ «Đơn hàng theo thời gian» / xu hướng đơn chờ & đã đặt: `charts.ordersTrend.summary` (tab Tổng hợp) và `charts.ordersTrend.compare` (tab So sánh kênh theo timeline).',
    '- Biểu đồ «Tương tác tổng hợp theo kênh» (đường Gửi/Mở/Click Email, Zalo, Zalo Group theo ngày): `charts.channelEngagement.all` + riêng `email`, `zalo`, `zalo_group` — giải thích đỉnh/lệch tỷ lệ (vd email gửi cao nhưng Zalo Group click/gửi tốt nếu số liệu có).',
    '- Biểu đồ donut / cơ cấu theo kênh (Click, Đơn chờ, Đã mua): `charts.channelBreakdown.click`, `.pending`, `.completed`.',
    '- Các bảng Top khóa học, Top chiến dịch theo đơn / theo click: `charts.topLists.topCourses`, `.topCampaignsByOrders`, `.topCampaignsByClicks`.',
    '- Khối Top landing (xem / click / form): `charts.landingTopPages`.',
    '',
    'Schema JSON (bắt buộc đủ key; chuỗi rỗng "" nếu không có thông tin):',
    '{',
    '  "overview": "Tóm tắt tổng thể hiệu suất chiến dịch trong 1-3 câu",',
    '  "key_metrics_analysis": {',
    '    "open_rate": { "value": "29.5% hoặc —", "benchmark": "So sánh với chuẩn ngành (email ~20-25%)", "assessment": "tốt|trung bình|kém", "comment": "nhận xét ngắn" },',
    '    "click_rate": { "value": "tỷ lệ click/gửi hoặc —", "benchmark": "Chuẩn tham chiếu ngắn", "assessment": "tốt|trung bình|kém", "comment": "nhận xét ngắn" },',
    '    "conversion_rate": { "value": "từ click → đơn đã mua (hoặc —)", "comment": "nhận xét về phễu cuối" }',
    '  },',
    '  "insights": [',
    '    { "title": "...", "type": "opportunity|problem|warning|trend", "priority": "high|medium|low", "detail": "...", "impact": "..." }',
    '  ],',
    '  "channel_analysis": {',
    '    "best_channel": "Kênh hiệu quả nhất (Email | Zalo | Zalo Group) + lý do ngắn theo số liệu",',
    '    "underperforming_channel": "Kênh yếu / cần cải thiện + dấu hiệu từ click/đơn/gửi",',
    '    "recommendation": "Chiến lược phối hợp 3 kênh: phân bổ ưu tiên, thời điểm, vai trò (broadcast vs cá nhân vs cộng đồng nhóm)"',
    '  },',
    '  "funnel_analysis": {',
    '    "bottleneck": "...",',
    '    "drop_off_stage": "...",',
    '    "suggestion": "..."',
    '  },',
    '  "top_product_insight": { "observation": "...", "action": "..." },',
    '  "action_plan": [',
    '    { "priority": 1, "action": "...", "expected_result": "...", "timeline": "..." }',
    '  ],',
    '  "risk_warning": "Cảnh báo rủi ro nếu không cải thiện (1-2 câu)",',
    '  "charts": {',
    '    "ordersTrend": {',
    '      "summary": "markdown: tab «Tổng hợp» (pendingOrders + completedOrders tổng); 4-8 bullet; **Xu hướng**, **Mâu thuẫn dữ liệu** hoặc **Đồng bộ dữ liệu**, **Hoạt động gửi đa kênh**, **Kết luận**.",',
    '      "compare": "markdown: tab «So sánh kênh» (email/zalo/zalo_group × chờ/đặt trên TIMELINE); so sánh kênh, điểm nóng thời gian, **Kết luận**."',
    '    },',
    '    "channelEngagement": {',
    '      "all": "markdown: so sánh chiến lược 3 kênh trên cùng timeline — vai trò Email vs Zalo 1-1 vs Zalo Group (phễu, tần suất, độ tin cậy); gợi ý phối hợp / phân bổ nỗ lực marketing.",',
    '      "email": "markdown: chiến lược riêng Email (chủ đề, phân khúc, open/click, follow-up) gắn với đường timeline emailSent/email tương tác nếu có.",',
    '      "zalo": "markdown: chiến lược riêng Zalo OA (tin nhắn, thời điểm, cá nhân hóa, chuyển đổi) theo zaloSent và click/đơn liên quan.",',
    '      "zalo_group": "markdown: chiến lược riêng Zalo Group (cộng đồng, social proof, nội dung nhóm) theo zaloGroupSent và tương tác/đơn liên quan."',
    '    },',
    '    "channelBreakdown": {',
    '      "click": "markdown 2-4 ý (gạch đầu dòng + **đậm**) cho donut Cơ cấu Click",',
    '      "completed": "markdown cho donut Đã mua",',
    '      "pending": "markdown cho donut Đơn chờ"',
    '    },',
    '    "topLists": {',
    '      "topCourses": "markdown 2-5 ý cho Top khóa học",',
    '      "topCampaignsByOrders": "markdown cho Top chiến dịch theo đơn",',
    '      "topCampaignsByClicks": "markdown cho Top click (nhắc click/gửi nếu có)"',
    '    },',
    '    "landingTopPages": "markdown: 5-10 dòng bullet; BẮT BUỘC có ý rõ cho (1) xem (2) click tracking (3) form; **in đậm** số/landing nổi bật; CTR và form/xem nếu có số"',
    '  },',
    '  "notes": [ "cảnh báo giới hạn dữ liệu nếu có (vd: timeline rút gọn)" ]',
    '}',
    '',
    'Quy tắc định dạng insight (charts.* — chuỗi hoặc từng field trong channelEngagement):',
    '- Viết bằng markdown nhẹ: mỗi ý chính là một dòng bắt đầu bằng \"- \" (gạch đầu dòng).',
    '- Dùng **nhãn hoặc số then chốt** để in đậm; tránh một đoạn văn dài không xuống dòng.',
    'Quy tắc phân tích:',
    '- Với charts.ordersTrend.summary: như trên nhưng chỉ dùng pendingOrders + completedOrders (tổng).',
    '- Với charts.ordersTrend.compare: đọc emailPendingOrders, emailCompletedOrders, zalo*, zaloGroup* trên TIMELINE; so sánh kênh và mùa vụ; cùng quy tắc **Mâu thuẫn dữ liệu** nếu tổng timeline lệch tổng quan.',
    '- Legacy: nếu model trả ordersTrend là một chuỗi, hệ thống gắn vào summary; compare có thể rỗng.',
    '- Với charts.channelEngagement: all/email/zalo/zalo_group phải khác nhau về góc nhìn; tab «Tất cả» là chiến lược tổng; từng tab chỉ marketing cho đúng kênh đó (Email / Zalo / Zalo Group) và mối liên hệ với đơn nếu timeline có.',
    '- Với channel_analysis.recommendation: luôn đề cập rõ cả ba kênh Email, Zalo, Zalo Group (kể cả khi một kênh = 0 — giải thích ý nghĩa hoặc rủi ro bỏ qua).',
    '- Với charts.landingTopPages: không chung chung; đối chiếu đủ ba trục xem / click / form và CTR, form/xem.',
    '- Ưu tiên insight hành động được (actionable), có thể làm trong 7-30 ngày.',
    '- So sánh benchmark ở mức định tính, không cứng nhắc nếu dữ liệu thiếu.',
    '- Nếu đơn đã mua rất thấp so với click/gửi, nêu nút thắt phễu và giả thuyết kiểm chứng được.',
    '- action_plan và insights[] nên có ít nhất một mục liên quan tối ưu gửi đa kênh (Email / Zalo / Zalo Group) khi dữ liệu cho phép.',
  ].join('\n');
}

class DashboardInsightsService {
  /**
   * Sinh insight dashboard bằng Gemini dựa trên dữ liệu thống kê đã có.
   *
   * Luồng hoạt động:
   * 1. Gom `overview`, `analytics`, `topListsData` (đã theo bộ lọc).
   * 2. Rút gọn timeline, dựng mô tả markdown số liệu.
   * 3. Gọi Gemini với JSON mode + token đủ lớn.
   * 4. Parse + chuẩn hóa schema; nếu lỗi thì trả fallback có `notes`.
   *
   * @param {object} input
   * @param {object} input.overview
   * @param {object} input.analytics
   * @param {object} input.topListsData
   * @param {object} [input.landingPageStats] - { rows?: object[] } từ API landing-pages-stats (tùy chọn)
   * @param {object} input.filters
   * @returns {Promise<{ success: boolean, data: object }>}
   */
  async generateInsights({ userId, overview, analytics, topListsData, landingPageStats, filters }) {
    let lastText = '';
    let lastFinish = '';
    let lastBlock = '';
    let usedCompactRetry = false;
    const insightModel = userId
      ? await resolveAllowedModel(userId, process.env.GEMINI_MODEL || 'gemini-2.5-flash')
      : (process.env.GEMINI_MODEL || 'gemini-2.5-flash');

    const runOnce = async (safePayload) => {
      const dataMarkdown = buildDataMarkdownSection(safePayload);
      const prompt = buildAnalysisPrompt(dataMarkdown);
      const result = await generateGeminiText({
        prompt,
        model: insightModel,
        timeoutMs: 120000,
        jsonMode: true,
        maxOutputTokens: resolveInsightMaxOutputTokens(insightModel),
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

    let safePayload = buildInsightSafePayload(
      { overview, analytics, topListsData, landingPageStats, filters },
      { timelineHead: 14, timelineTail: 14, landingRowCap: 48 }
    );
    let { text, finishReason, blockReason } = await runOnce(safePayload);
    lastText = text;
    lastFinish = finishReason;
    lastBlock = blockReason;

    let parsed = parseInsightJson(text);

    if (
      !parsed &&
      !blockReason &&
      (finishReason === 'MAX_TOKENS' || (typeof text === 'string' && text.length > 0))
    ) {
      usedCompactRetry = true;
      safePayload = buildInsightSafePayload(
        { overview, analytics, topListsData, landingPageStats, filters },
        { timelineHead: 5, timelineTail: 5, landingRowCap: 12 }
      );
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
          'Hệ thống đã tự động thu gọn timeline/landing trong prompt và gọi Gemini lần 2 (lần 1 không parse được hoặc có nguy cơ cắt đầu ra).'
        );
      }
      if (lastFinish === 'MAX_TOKENS') {
        notes.push('Gemini kết thúc do đạt giới hạn độ dài đầu ra; một số mục có thể bị rút gọn.');
      }
      return {
        success: true,
        data: normalizeInsightPayload({ ...parsed, notes }),
      };
    }

    return {
      success: true,
      data: normalizeInsightPayload({
        overview:
          typeof lastText === 'string' && lastText.length > 0
            ? `Không parse được JSON từ Gemini. Bản thô (có thể cắt):\n${lastText.slice(0, 2000)}`
            : 'Không nhận được nội dung từ Gemini.',
        charts: defaultCharts(),
        notes: [
          'Không parse được JSON đầy đủ. Kiểm tra GEMINI_MODEL (khuyến nghị: gemini-2.5-flash) và GEMINI_API_KEY.',
          lastFinish ? `Gemini finishReason: ${lastFinish}` : '',
          lastBlock ? `Chặn prompt: ${lastBlock}` : '',
          usedCompactRetry ? 'Đã thử prompt thu gọn nhưng vẫn không parse được JSON.' : '',
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
   * @returns {Promise<{ savedAt: string, insights: object } | null>}
   */
  async getSavedInsightForUser(userId) {
    const uid = Number(userId);
    if (!Number.isFinite(uid)) return null;
    const row = await dashboardInsightRepository.findLatestByUser(uid);
    if (!row) return null;
    return {
      savedAt: row.created_at ? new Date(row.created_at).toISOString() : '',
      insights: row.payload,
    };
  }
}

export default new DashboardInsightsService();
