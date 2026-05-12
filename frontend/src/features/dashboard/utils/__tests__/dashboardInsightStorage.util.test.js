import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  extractInsightFromDashboardInsightsResponse,
  normalizeChannelEngagementForUi,
  normalizeOrdersTrendForUi,
  getOrdersTrendInsightForMode,
  getChannelEngagementInsightForChannel,
  normalizeDashboardInsightForUi,
  isInsightPayloadUsable,
  saveLatestDashboardInsight,
  readLatestDashboardInsight,
  hasStoredDashboardInsight,
} from '../dashboardInsightStorage.util';

const STORAGE_KEY = 'founder_dashboard_insight_latest';

const usablePayload = () => ({
  key_metrics_analysis: { revenue: 'tăng 20%' },
  overview: 'tổng quan',
  notes: [],
  charts: {},
});

describe('extractInsightFromDashboardInsightsResponse', () => {
  it('response.data.data có dạng object → trả nested data', () => {
    const r = extractInsightFromDashboardInsightsResponse({
      data: { data: { charts: {}, overview: 'x' } },
    });
    expect(r).toEqual({ charts: {}, overview: 'x' });
  });

  it('response.data phẳng có charts/key_metrics/overview string → trả body luôn', () => {
    expect(
      extractInsightFromDashboardInsightsResponse({ data: { charts: {} } })
    ).toEqual({ charts: {} });
    expect(
      extractInsightFromDashboardInsightsResponse({ data: { overview: 'a' } })
    ).toEqual({ overview: 'a' });
    expect(
      extractInsightFromDashboardInsightsResponse({ data: { key_metrics_analysis: {} } })
    ).toEqual({ key_metrics_analysis: {} });
  });

  it('body không có dấu hiệu insight → null', () => {
    expect(
      extractInsightFromDashboardInsightsResponse({ data: { other: 'x' } })
    ).toBeNull();
  });

  it('response null / không có data → null', () => {
    expect(extractInsightFromDashboardInsightsResponse(null)).toBeNull();
    expect(extractInsightFromDashboardInsightsResponse({})).toBeNull();
    expect(extractInsightFromDashboardInsightsResponse({ data: null })).toBeNull();
  });
});

describe('normalizeChannelEngagementForUi', () => {
  it('null → 4 nhánh rỗng', () => {
    expect(normalizeChannelEngagementForUi(null)).toEqual({
      all: '', email: '', zalo: '', zalo_group: '',
    });
  });

  it('legacy string → gắn vào nhánh all, 3 nhánh còn lại rỗng', () => {
    expect(normalizeChannelEngagementForUi('toàn kênh')).toEqual({
      all: 'toàn kênh', email: '', zalo: '', zalo_group: '',
    });
  });

  it('object đầy đủ → giữ string keys, default rỗng', () => {
    expect(
      normalizeChannelEngagementForUi({ all: 'A', email: 'E', zalo: 'Z', zalo_group: 'G' })
    ).toEqual({ all: 'A', email: 'E', zalo: 'Z', zalo_group: 'G' });
  });

  it('object thiếu/wrong type → fill rỗng', () => {
    expect(normalizeChannelEngagementForUi({ all: 'A', email: 123 })).toEqual({
      all: 'A', email: '', zalo: '', zalo_group: '',
    });
  });

  it('array (kiểu lạ) → 4 nhánh rỗng', () => {
    expect(normalizeChannelEngagementForUi(['a'])).toEqual({
      all: '', email: '', zalo: '', zalo_group: '',
    });
  });
});

describe('normalizeOrdersTrendForUi', () => {
  it('null → {summary: "", compare: ""}', () => {
    expect(normalizeOrdersTrendForUi(null)).toEqual({ summary: '', compare: '' });
  });

  it('legacy string → summary', () => {
    expect(normalizeOrdersTrendForUi('Tóm tắt')).toEqual({ summary: 'Tóm tắt', compare: '' });
  });

  it('object đầy đủ giữ nguyên shape', () => {
    expect(normalizeOrdersTrendForUi({ summary: 'S', compare: 'C' })).toEqual({
      summary: 'S', compare: 'C',
    });
  });

  it('object thiếu/wrong type → fill rỗng', () => {
    expect(normalizeOrdersTrendForUi({ summary: 1, compare: 'C' })).toEqual({
      summary: '', compare: 'C',
    });
  });
});

describe('getOrdersTrendInsightForMode', () => {
  it("mode='compare' → ưu tiên compare, fallback summary", () => {
    expect(getOrdersTrendInsightForMode({ ordersTrend: { summary: 'S', compare: 'C' } }, 'compare')).toBe('C');
    expect(getOrdersTrendInsightForMode({ ordersTrend: { summary: 'S', compare: '' } }, 'compare')).toBe('S');
  });

  it("mode='summary' (mặc định) → ưu tiên summary, fallback compare", () => {
    expect(getOrdersTrendInsightForMode({ ordersTrend: { summary: 'S', compare: 'C' } }, 'summary')).toBe('S');
    expect(getOrdersTrendInsightForMode({ ordersTrend: { summary: '', compare: 'C' } }, 'summary')).toBe('C');
  });

  it('charts undefined → ""', () => {
    expect(getOrdersTrendInsightForMode(undefined, 'summary')).toBe('');
  });
});

describe('getChannelEngagementInsightForChannel', () => {
  it("legacy string → áp tab nào cũng trả chuỗi", () => {
    expect(getChannelEngagementInsightForChannel({ channelEngagement: 'L' }, 'email')).toBe('L');
  });

  it("forPrint=true + legacy + channel != all → ''", () => {
    expect(
      getChannelEngagementInsightForChannel({ channelEngagement: 'L' }, 'email', { forPrint: true })
    ).toBe('');
    expect(
      getChannelEngagementInsightForChannel({ channelEngagement: 'L' }, 'all', { forPrint: true })
    ).toBe('L');
  });

  it('object dạng channel-specific — match tab', () => {
    expect(
      getChannelEngagementInsightForChannel({ channelEngagement: { email: 'E', all: 'A' } }, 'email')
    ).toBe('E');
  });

  it('object — tab rỗng → fallback all', () => {
    expect(
      getChannelEngagementInsightForChannel({ channelEngagement: { all: 'A', email: '' } }, 'email')
    ).toBe('A');
  });

  it('channelId lạ → coi như all', () => {
    expect(
      getChannelEngagementInsightForChannel({ channelEngagement: { all: 'A' } }, 'unknown')
    ).toBe('A');
  });

  it('channelEngagement null → ""', () => {
    expect(getChannelEngagementInsightForChannel({}, 'email')).toBe('');
  });
});

describe('normalizeDashboardInsightForUi', () => {
  it('null/non-object → null', () => {
    expect(normalizeDashboardInsightForUi(null)).toBeNull();
    expect(normalizeDashboardInsightForUi('str')).toBeNull();
  });

  it('unwrap lớp { data } khi data có charts', () => {
    const out = normalizeDashboardInsightForUi({ data: { charts: { landingTopPages: 'X' } } });
    expect(out.charts.landingTopPages).toBe('X');
  });

  it('unwrap lớp { insights } khi insights có charts và raw không có', () => {
    const out = normalizeDashboardInsightForUi({ insights: { charts: { landingTopPages: 'Y' } } });
    expect(out.charts.landingTopPages).toBe('Y');
  });

  it('key_metrics_analysis dạng chuỗi JSON → parse thành object', () => {
    const out = normalizeDashboardInsightForUi({
      key_metrics_analysis: '{"revenue":"tăng"}',
      charts: {},
    });
    expect(out.key_metrics_analysis).toEqual({ revenue: 'tăng' });
  });

  it('key_metrics_analysis chuỗi JSON hỏng → giữ chuỗi (parse fail = null)', () => {
    const out = normalizeDashboardInsightForUi({
      key_metrics_analysis: '{invalid',
      charts: {},
    });
    expect(out.key_metrics_analysis).toBe('{invalid');
  });

  it('thiếu key_metrics nhưng overview chứa JSON đủ → recover', () => {
    const overview = '```json\n{"key_metrics_analysis":{"a":1},"charts":{"landingTopPages":"L"}}\n```';
    const out = normalizeDashboardInsightForUi({ overview });
    expect(out.key_metrics_analysis).toEqual({ a: 1 });
    expect(out.charts.landingTopPages).toBe('L');
  });

  it('notes thành mảng rỗng nếu không phải array', () => {
    const out = normalizeDashboardInsightForUi({ key_metrics_analysis: {}, charts: {}, notes: 'x' });
    expect(out.notes).toEqual([]);
  });

  it('charts merge default — channelBreakdown/topLists/landingTopPages luôn có shape', () => {
    const out = normalizeDashboardInsightForUi({ key_metrics_analysis: {} });
    expect(out.charts.channelBreakdown).toEqual({ click: '', completed: '', pending: '' });
    expect(out.charts.topLists).toEqual({ topCourses: '', topCampaignsByOrders: '', topCampaignsByClicks: '' });
    expect(out.charts.landingTopPages).toBe('');
    expect(out.charts.channelEngagement).toEqual({ all: '', email: '', zalo: '', zalo_group: '' });
    expect(out.charts.ordersTrend).toEqual({ summary: '', compare: '' });
  });
});

describe('isInsightPayloadUsable', () => {
  it('null / non-object → false', () => {
    expect(isInsightPayloadUsable(null)).toBe(false);
    expect(isInsightPayloadUsable('x')).toBe(false);
  });

  it('fallback "Không parse được JSON từ Gemini" → false', () => {
    expect(
      isInsightPayloadUsable({ overview: 'Không parse được JSON từ Gemini' })
    ).toBe(false);
    expect(
      isInsightPayloadUsable({ notes: ['Không parse được JSON ngày X'] })
    ).toBe(false);
  });

  it('key_metrics_analysis object/array non-empty → true', () => {
    expect(isInsightPayloadUsable({ key_metrics_analysis: { a: 1 } })).toBe(true);
    expect(isInsightPayloadUsable({ key_metrics_analysis: [{ a: 1 }] })).toBe(true);
  });

  it('insights array / action_plan array / channel_analysis / funnel_analysis / top_product_insight → true', () => {
    expect(isInsightPayloadUsable({ insights: [{ x: 1 }] })).toBe(true);
    expect(isInsightPayloadUsable({ action_plan: [{ a: 1 }] })).toBe(true);
    expect(isInsightPayloadUsable({ channel_analysis: { email: 1 } })).toBe(true);
    expect(isInsightPayloadUsable({ funnel_analysis: { step: 1 } })).toBe(true);
    expect(isInsightPayloadUsable({ top_product_insight: { p: 1 } })).toBe(true);
  });

  it('risk_warning có nội dung → true', () => {
    expect(isInsightPayloadUsable({ risk_warning: 'cẩn thận churn' })).toBe(true);
  });

  it('overview chuỗi >= 5 ký tự → true', () => {
    expect(isInsightPayloadUsable({ overview: 'hello' })).toBe(true);
    expect(isInsightPayloadUsable({ overview: '1234' })).toBe(false);
  });

  it('charts.ordersTrend có summary hoặc compare → true', () => {
    expect(isInsightPayloadUsable({ charts: { ordersTrend: { summary: 'A' } } })).toBe(true);
    expect(isInsightPayloadUsable({ charts: { ordersTrend: { compare: 'B' } } })).toBe(true);
    expect(isInsightPayloadUsable({ charts: { ordersTrend: { summary: '', compare: '' } } })).toBe(false);
  });

  it('charts.channelBreakdown có click/completed/pending → true', () => {
    expect(isInsightPayloadUsable({ charts: { channelBreakdown: { click: 'C' } } })).toBe(true);
  });

  it('payload rỗng → false', () => {
    expect(isInsightPayloadUsable({})).toBe(false);
    expect(isInsightPayloadUsable({ charts: {} })).toBe(false);
  });
});

describe('save / read / has — localStorage interaction', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('save payload usable → trả true + ghi vào localStorage', () => {
    const ok = saveLatestDashboardInsight(usablePayload());
    expect(ok).toBe(true);
    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw);
    expect(parsed).toHaveProperty('savedAt');
    expect(parsed.insights.key_metrics_analysis).toEqual({ revenue: 'tăng 20%' });
  });

  it('save payload fallback parse-failure → false, không ghi', () => {
    const ok = saveLatestDashboardInsight({
      overview: 'Không parse được JSON từ Gemini',
    });
    expect(ok).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('save payload rỗng → false', () => {
    expect(saveLatestDashboardInsight({})).toBe(false);
    expect(saveLatestDashboardInsight(null)).toBe(false);
  });

  it('read khi chưa có gì → null', () => {
    expect(readLatestDashboardInsight()).toBeNull();
  });

  it('read sau khi save → object có savedAt + insights đã normalize', () => {
    saveLatestDashboardInsight(usablePayload());
    const r = readLatestDashboardInsight();
    expect(r.savedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(r.insights.charts).toBeDefined();
  });

  it('read bản cũ không usable → xóa storage, trả null', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ savedAt: '2026', insights: { overview: 'tiny' } })
    );
    expect(readLatestDashboardInsight()).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('read JSON parse fail → xóa + null', () => {
    window.localStorage.setItem(STORAGE_KEY, '{invalid json');
    expect(readLatestDashboardInsight()).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('save lỗi (quota) → false + warn, không throw', () => {
    const setItemSpy = vi
      .spyOn(window.localStorage.__proto__, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
    expect(saveLatestDashboardInsight(usablePayload())).toBe(false);
    setItemSpy.mockRestore();
  });

  it('hasStoredDashboardInsight phản ánh trạng thái sau save', () => {
    expect(hasStoredDashboardInsight()).toBe(false);
    saveLatestDashboardInsight(usablePayload());
    expect(hasStoredDashboardInsight()).toBe(true);
  });
});
