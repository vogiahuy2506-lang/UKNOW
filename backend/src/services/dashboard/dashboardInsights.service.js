import { generateGeminiText } from '../../utils/geminiClient.util.js';
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
 * Bỏ fence markdown ```json ... ``` nếu model vẫn trả kèm.
 *
 * @param {string} text
 * @returns {string}
 */
function stripCodeFences(text) {
  let t = String(text || '').trim();
  const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/im);
  if (fenced) t = fenced[1].trim();
  return t;
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
  const s = stripCodeFences(text);
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
          return null;
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
  const trimmed = stripCodeFences(text);
  try {
    return JSON.parse(trimmed);
  } catch {
    return extractJsonObject(text);
  }
}

/**
 * Chuẩn hóa shape trả về để frontend luôn có `charts` + các khối phân tích.
 *
 * @param {object} raw
 * @returns {object}
 */
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
    ordersTrend: '',
    channelEngagement: '',
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
  };
}

/**
 * Tóm tắt timeline để đưa vào prompt (không cần toàn bộ điểm).
 *
 * @param {Array<object>} timeline
 * @returns {object}
 */
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
 * @param {string} dataMarkdown
 * @returns {string}
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
    '    "best_channel": "...",',
    '    "underperforming_channel": "...",',
    '    "recommendation": "..."',
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
    '    "ordersTrend": "3-6 câu: insight riêng cho biểu đồ Đơn hàng theo thời gian (xu hướng đơn chờ/đặt, điểm bất thường)",',
    '    "channelEngagement": "3-6 câu: insight riêng cho biểu đồ Tương tác tổng hợp theo kênh",',
    '    "channelBreakdown": {',
    '      "click": "2-4 câu cho donut Cơ cấu Click theo kênh",',
    '      "completed": "2-4 câu cho donut Cơ cấu Đã mua theo kênh",',
    '      "pending": "2-4 câu cho donut Cơ cấu Đơn chờ theo kênh"',
    '    },',
    '    "topLists": {',
    '      "topCourses": "2-5 câu cho Top khóa học có nhiều đơn",',
    '      "topCampaignsByOrders": "2-5 câu cho Top chiến dịch có nhiều đơn",',
    '      "topCampaignsByClicks": "2-5 câu cho Top chiến dịch có nhiều click (nhắc click/gửi nếu dữ liệu có)"',
    '    }',
    '  },',
    '  "notes": [ "cảnh báo giới hạn dữ liệu nếu có (vd: timeline rút gọn)" ]',
    '}',
    '',
    'Quy tắc phân tích:',
    '- Ưu tiên insight hành động được (actionable), có thể làm trong 7-30 ngày.',
    '- So sánh benchmark ở mức định tính, không cứng nhắc nếu dữ liệu thiếu.',
    '- Nếu đơn đã mua rất thấp so với click/gửi, nêu nút thắt phễu và giả thuyết kiểm chứng được.',
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
   * @param {object} input.filters
   * @returns {Promise<{ success: boolean, data: object }>}
   */
  async generateInsights({ overview, analytics, topListsData, filters }) {
    const safePayload = {
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
            timeline: shrinkTimeline(analytics.timeline || []),
          }
        : null,
      topLists: topListsData
        ? {
            topCourses: topListsData.topCourses || [],
            topCampaignsByOrders: topListsData.topCampaignsByOrders || [],
            topCampaignsByClicks: topListsData.topCampaignsByClicks || [],
          }
        : null,
    };

    const dataMarkdown = buildDataMarkdownSection(safePayload);
    const prompt = buildAnalysisPrompt(dataMarkdown);

    const text = await generateGeminiText({
      prompt,
      timeoutMs: 120000,
      jsonMode: true,
      maxOutputTokens: 8192,
    });

    const parsed = parseInsightJson(text);
    if (parsed && typeof parsed === 'object') {
      return {
        success: true,
        data: normalizeInsightPayload(parsed),
      };
    }

    return {
      success: true,
      data: normalizeInsightPayload({
        overview:
          typeof text === 'string' && text.length > 0
            ? `Không parse được JSON từ Gemini. Bản thô (có thể cắt):\n${text.slice(0, 2000)}`
            : 'Không nhận được nội dung từ Gemini.',
        charts: defaultCharts(),
        notes: [
          'Không parse được JSON đầy đủ. Kiểm tra GEMINI_MODEL (khuyến nghị: gemini-2.0-flash) và GEMINI_API_KEY.',
        ],
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
