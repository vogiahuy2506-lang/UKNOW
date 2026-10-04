import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * D-20 (PLAN_SUA_AI_DOT4 PR-3): Nhận xét Dashboard — số liệu do SERVER tính, benchmark chỉ là tham khảo.
 *
 * Trước đây prompt ghi cứng "chuẩn ngành email ~20-25%", bắt model tự chia `conversion_rate` ("đơn đã mua so với số tin đã
 * gửi / lượt nhấp") và tự dự báo `expected_result` dạng số — con số không có cơ sở hiện như phân tích.
 *
 * Giả ranh giới: lõi `generateGeminiContent` (trả đúng hình `{ text, finishReason, … }`), chính sách model, bộ ghi token, repository.
 */
const generateGeminiContent = jest.fn();

jest.unstable_mockModule('../../../utils/geminiClient.util.js', () => ({ generateGeminiContent }));
jest.unstable_mockModule('../../ai/aiModelPolicy.service.js', () => ({
  resolveAllowedModel: jest.fn(async () => 'gemini-2.5-flash'),
}));
jest.unstable_mockModule('../../ai/aiUsageMeter.service.js', () => ({
  default: { record: jest.fn(async () => {}) },
}));
jest.unstable_mockModule('../../../repositories/dashboard/dashboardInsight.repository.js', () => ({
  default: { findLatestByUser: jest.fn(), replaceForUser: jest.fn() },
}));

const { default: service, computeConversionMetrics, formatConversionValue } = await import('../dashboardInsights.service.js');

const snapshotWith = (overview) => ({
  filters: { startDate: '2026-09-01', endDate: '2026-09-30', campaignType: 'all', campaignIds: [] },
  overview,
  dailySent: [],
  ordersTimeline: [],
  campaigns: [],
});

const OVERVIEW = {
  sent: { total: 200, friendRequests: 0, byChannel: [{ channel: 'email', sent: 200 }] },
  failed: { total: 4 },
  email: { sent: 200, opened: 50, openRate: 25, clicked: 10, clickRate: 5 },
  clicks: { total: 12, byChannel: [{ channel: 'email', clicked: 12 }] },
  orders: { pending: 3, completed: 4, byChannel: [{ channel: 'email', pending: 3, completed: 4 }] },
};

const modelReply = (payload) => ({
  text: typeof payload === 'string' ? payload : JSON.stringify(payload),
  finishReason: 'STOP',
  usage: { totalTokens: 15 },
});

describe('computeConversionMetrics / formatConversionValue', () => {
  it('đơn đã mua / tin đã gửi và / tin có người bấm, làm tròn 1 chữ số', () => {
    const m = computeConversionMetrics(OVERVIEW);
    expect(m).toEqual({ completedOrders: 4, sentTotal: 200, clickedTotal: 12, perSentPct: 2, perClickPct: 33.3 });
    expect(formatConversionValue(m, 'vi')).toBe('4 đơn đã mua / 12 tin có người bấm = 33.3%; 4 đơn đã mua / 200 tin đã gửi = 2%');
    expect(formatConversionValue(m, 'en')).toBe('4 completed orders / 12 clicked messages = 33.3%; 4 completed orders / 200 messages sent = 2%');
  });

  it('không có tin nào được gửi và không ai bấm → "—" (không chia cho 0)', () => {
    const m = computeConversionMetrics({ sent: { total: 0 }, clicks: { total: 0 }, orders: { completed: 3 } });
    expect(m.perSentPct).toBeNull();
    expect(m.perClickPct).toBeNull();
    expect(formatConversionValue(m, 'vi')).toBe('—');
  });

  it('đơn đã mua NHIỀU HƠN lượt bấm (đơn đến từ khách không bấm link) → bỏ tỉ lệ theo lượt bấm, không in "400%"', () => {
    const m = computeConversionMetrics({ sent: { total: 100 }, clicks: { total: 1 }, orders: { completed: 4 } });
    expect(m.perClickPct).toBeNull();
    expect(formatConversionValue(m, 'vi')).toBe('4 đơn đã mua / 100 tin đã gửi = 4%');
  });

  it('overview thiếu / sai kiểu → số 0, không ném lỗi', () => {
    expect(computeConversionMetrics(null)).toEqual({ completedOrders: 0, sentTotal: 0, clickedTotal: 0, perSentPct: null, perClickPct: null });
    expect(computeConversionMetrics({ sent: { total: 'abc' }, orders: { completed: -5 } }).perSentPct).toBeNull();
  });
});

describe('generateInsights — server điền conversion_rate, prompt không còn benchmark/dự báo cứng', () => {
  beforeEach(() => {
    generateGeminiContent.mockReset();
  });

  it('model tự chế conversion_rate.value ("99%") → bị ghi đè bằng số server tính; comment của model được giữ', async () => {
    generateGeminiContent.mockResolvedValueOnce(modelReply({
      overview: 'Tốt.',
      key_metrics_analysis: {
        open_rate: { value: '25%', comment: 'ổn' },
        conversion_rate: { value: '99%', benchmark: '30%', comment: 'Phễu cuối còn yếu.' },
      },
      charts: {},
      notes: [],
    }));

    const out = await service.generateInsights({ userId: 7, snapshot: snapshotWith(OVERVIEW), locale: 'vi' });

    const km = out.data.key_metrics_analysis;
    expect(km.conversion_rate.value).toBe('4 đơn đã mua / 12 tin có người bấm = 33.3%; 4 đơn đã mua / 200 tin đã gửi = 2%');
    expect(km.conversion_rate.comment).toBe('Phễu cuối còn yếu.');
    // open_rate không bị đụng (ngoài phạm vi D-20).
    expect(km.open_rate).toEqual({ value: '25%', comment: 'ổn' });
  });

  it('en: dùng nhãn tiếng Anh; model không trả conversion_rate → server vẫn điền (chỉ có value)', async () => {
    generateGeminiContent.mockResolvedValueOnce(modelReply({
      overview: 'Good.',
      key_metrics_analysis: { open_rate: { value: '25%' } },
      charts: {},
    }));

    const out = await service.generateInsights({ userId: 7, snapshot: snapshotWith(OVERVIEW), locale: 'en' });

    expect(out.data.key_metrics_analysis.conversion_rate).toEqual({
      value: '4 completed orders / 12 clicked messages = 33.3%; 4 completed orders / 200 messages sent = 2%',
    });
  });

  it('conversion_rate là một CHUỖI (kiểu cũ) → chuỗi đó thành comment, value do server điền', async () => {
    generateGeminiContent.mockResolvedValueOnce(modelReply({
      overview: 'Tốt.',
      key_metrics_analysis: { conversion_rate: 'Khá thấp' },
      charts: {},
    }));

    const out = await service.generateInsights({ userId: 7, snapshot: snapshotWith(OVERVIEW), locale: 'vi' });

    expect(out.data.key_metrics_analysis.conversion_rate.comment).toBe('Khá thấp');
    expect(out.data.key_metrics_analysis.conversion_rate.value).toMatch(/^4 đơn đã mua/);
  });

  it('model KHÔNG trả key_metrics_analysis → server không tự dựng khối này (FE chọn nhánh hiển thị theo sự hiện diện của nó)', async () => {
    generateGeminiContent.mockResolvedValueOnce(modelReply({ overview: 'Chỉ có tóm tắt.', charts: {}, notes: [] }));

    const out = await service.generateInsights({ userId: 7, snapshot: snapshotWith(OVERVIEW), locale: 'vi' });

    expect(out.data.key_metrics_analysis).toBeUndefined();
  });

  for (const locale of ['vi', 'en']) {
    it(`prompt (${locale}): không còn "~20-25%"; benchmark ghi là THAM KHẢO; conversion_rate không xin value; expected_result định tính`, async () => {
      generateGeminiContent.mockResolvedValueOnce(modelReply({ overview: 'x', key_metrics_analysis: { open_rate: {} }, charts: {} }));

      await service.generateInsights({ userId: 7, snapshot: snapshotWith(OVERVIEW), locale });

      const prompt = generateGeminiContent.mock.calls[0][0].parts[0].text;
      expect(prompt).not.toMatch(/20-25/);
      expect(prompt).toMatch(locale === 'en' ? /REFERENCE only/ : /THAM KHẢO/);
      // Dòng schema conversion_rate chỉ còn "comment" — model không được xin tự điền con số.
      const conversionLine = prompt.split('\n').find((l) => l.includes('"conversion_rate"'));
      expect(conversionLine).toBeDefined();
      expect(conversionLine).not.toMatch(/"value"/);
      expect(conversionLine).toMatch(/SERVER/);
      // expected_result: tín hiệu định tính, cấm số dự báo.
      const actionLine = prompt.split('\n').find((l) => l.includes('"expected_result"'));
      expect(actionLine).toMatch(locale === 'en' ? /NO forecast numbers/ : /KHÔNG ghi con số/);
    });
  }

  it('phần dữ liệu trong prompt có dòng tỉ lệ chuyển đổi SERVER ĐÃ TÍNH với số đúng', async () => {
    generateGeminiContent.mockResolvedValueOnce(modelReply({ overview: 'x', key_metrics_analysis: { open_rate: {} }, charts: {} }));

    await service.generateInsights({ userId: 7, snapshot: snapshotWith(OVERVIEW), locale: 'vi' });

    const prompt = generateGeminiContent.mock.calls[0][0].parts[0].text;
    expect(prompt).toContain('Tỉ lệ chuyển đổi (SERVER ĐÃ TÍNH');
    expect(prompt).toContain('4 đơn đã mua / 12 tin có người bấm = 33.3%; 4 đơn đã mua / 200 tin đã gửi = 2%');
  });
});
