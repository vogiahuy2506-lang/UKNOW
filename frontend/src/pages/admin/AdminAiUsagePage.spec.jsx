import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import AdminAiUsagePage from './AdminAiUsagePage';

const { mockGetOverview } = vi.hoisted(() => ({ mockGetOverview: vi.fn() }));

vi.mock('../../features/admin/services/adminAiUsageApi.service', () => ({
  default: { getOverview: mockGetOverview },
}));

const plan = (over) => ({
  planId: 1,
  planCode: 'basic',
  planName: 'Basic',
  userCount: 10,
  promptTokens: 0,
  outputTokens: 0,
  totalTokens: 7654321,
  estimatedCostUsd: 1,
  p90UserTokens: 123456,
  aiCreditsPerPeriod: 800,
  totalCredits: 55,
  p90UserCredits: 9,
  quotaUsagePctAtP90: 1.1,
  creditUserCount: 7,
  usersNearLimit: 2,
  // token quota cu: KHONG duoc hien trong cot han muc
  aiTokensPerPeriod: 999888777,
  ...over,
});

const renderPage = (byPlan) => {
  mockGetOverview.mockResolvedValue({
    data: { data: { windowDays: 30, summary: {}, timeline: [], byPlan, byFeature: [], byModel: [], topUsers: [] } },
  });
  return render(
    <I18nProvider defaultLocale="vi">
      <AdminAiUsagePage />
    </I18nProvider>
  );
};

describe('AdminAiUsagePage - cot han muc theo luot AI', () => {
  it('goi co aiCreditsPerPeriod=800 hien "800 luot AI / ky" + % p90, khong hien token quota', async () => {
    renderPage([plan()]);
    const cell = await screen.findByText('800 lượt AI / kỳ');
    expect(cell).toBeTruthy();
    const td = cell.closest('td');
    expect(within(td).getByText(/1\.1%/)).toBeTruthy();
    expect(within(td).getByText(/9 lượt/)).toBeTruthy();
    expect(screen.queryByText(/999\.888\.777|999,888,777/)).toBeNull();
    expect(screen.getByText('Hạn mức lượt AI / kỳ')).toBeTruthy();
  });

  it('aiCreditsPerPeriod null hien "Khong gioi han" du co aiTokensPerPeriod', async () => {
    renderPage([plan({ aiCreditsPerPeriod: null, quotaUsagePctAtP90: null })]);
    await waitFor(() => expect(mockGetOverview).toHaveBeenCalled());
    const cell = await screen.findByText('Không giới hạn');
    expect(cell.closest('td')).toBeTruthy();
    expect(screen.queryByText(/999\.888\.777|999,888,777/)).toBeNull();
  });

  // PR-2 (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30): cot luot AI theo KY HIEN TAI cua tung khach, khong theo bo loc ngay.
  it('goi co han muc: dong phu "≥80%: n khach" nam trong cung o han muc', async () => {
    renderPage([plan({ usersNearLimit: 2 })]);
    const limitCell = (await screen.findByText('800 lượt AI / kỳ')).closest('td');
    const near = within(limitCell).getByText('≥80%: 2 khách');
    expect(near).toBeTruthy();
  });

  it('ghi ro "ky hien tai cua tung khach" (khong theo bo loc 7/30/90 ngay) o chu thich bang va dong p90', async () => {
    renderPage([plan()]);
    const limitCell = (await screen.findByText('800 lượt AI / kỳ')).closest('td');
    expect(within(limitCell).getByText(/kỳ hiện tại: 9 lượt/)).toBeTruthy();
    expect(screen.getByText(/kỳ hiện tại của từng khách/)).toBeTruthy();
    expect(screen.getByText(/không theo bộ lọc ngày/)).toBeTruthy();
  });

  it('goi khong gioi han khong hien dong "≥80%"', async () => {
    renderPage([plan({ aiCreditsPerPeriod: null, quotaUsagePctAtP90: null, usersNearLimit: 0 })]);
    await screen.findByText('Không giới hạn');
    expect(screen.queryByText(/≥80%/)).toBeNull();
  });

  it('goi han muc 0 khach gan tran van hien "≥80%: 0 khach" (khong an so 0)', async () => {
    renderPage([plan({ usersNearLimit: 0 })]);
    expect(await screen.findByText('≥80%: 0 khách')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-8: bon so, bo loc, co gia do, khoi ky thuat gap
// ---------------------------------------------------------------------------------------------------------------------
const overview = (over = {}) => ({
  range: '30d',
  rangeStart: '2026-09-01',
  rangeEnd: '2026-09-30',
  usdVndRate: 24000,
  summary: {
    estimatedCostUsd: 38.625,
    estimatedCostVnd: 927000,
    calls: 20,
    costPerCallUsd: 1.93125,
    costPerCallVnd: 46350,
    customers: 2,
    promptTokens: 16090000,
    outputTokens: 1105000,
    thoughtsTokens: 1105000,
    totalTokens: 18300000,
    logCount: 120,
    userCount: 4,
  },
  pricingWarning: null,
  timeline: [],
  byPlan: [],
  byFeature: [],
  byModel: [],
  topUsers: [],
  ...over,
});

const renderOverview = (data) => {
  mockGetOverview.mockResolvedValue({ data: { data: overview(data) } });
  return render(
    <I18nProvider defaultLocale="vi">
      <AdminAiUsagePage />
    </I18nProvider>
  );
};

const kpiCard = (label) => screen.getByText(label).closest('.card');

describe('AdminAiUsagePage - bon so tren cung (VND)', () => {
  it('Chi phi AI 927.000d (kem ty gia), Luot goi AI 20, Chi phi moi luot 46.350d, Khach dang dung AI 2', async () => {
    renderOverview();
    await screen.findByText('Chi phí AI');
    expect(within(kpiCard('Chi phí AI')).getByText('927.000đ')).toBeTruthy();
    expect(within(kpiCard('Chi phí AI')).getByText(/1 USD = 24\.000đ/)).toBeTruthy();
    expect(within(kpiCard('Lượt gọi AI')).getByText('20')).toBeTruthy();
    expect(within(kpiCard('Chi phí mỗi lượt')).getByText('46.350đ')).toBeTruthy();
    expect(within(kpiCard('Khách đang dùng AI')).getByText('2')).toBeTruthy();
  });

  it('chua co luot goi: chi phi moi luot hien "—" (khong hien 0d gia)', async () => {
    renderOverview({ summary: { estimatedCostUsd: 0, estimatedCostVnd: 0, calls: 0, costPerCallVnd: null, customers: 0 } });
    await screen.findByText('Chi phí AI');
    expect(within(kpiCard('Chi phí mỗi lượt')).getByText('—')).toBeTruthy();
    expect(within(kpiCard('Chi phí AI')).getByText('0đ')).toBeTruthy();
  });

  it('ghi ro khoang ngay (gio Viet Nam); KHONG con dong "Chua gom: ..." (PR-12: moi duong goi Gemini deu ghi usage)', async () => {
    renderOverview();
    expect(await screen.findByText(/Số liệu từ 01\/09\/2026 đến 30\/09\/2026 \(giờ Việt Nam\)/)).toBeTruthy();
    // Banner tinh cu liet ke 4 duong goi chua ghi usage; nay da ghi du nen khong duoc hien lai (ke ca chu OCR / chat trang chu).
    expect(screen.queryByText(/Chưa gồm/)).toBeNull();
    expect(screen.queryByText(/chưa ghi lượt dùng/)).toBeNull();
  });
});

describe('AdminAiUsagePage - bo loc Thang nay | 30 ngay qua', () => {
  it('mac dinh "30 ngay qua"; bam "Thang nay" goi lai API voi range=month; khong con nut 7/90 ngay', async () => {
    mockGetOverview.mockClear();
    renderOverview();
    await waitFor(() => expect(mockGetOverview).toHaveBeenCalledWith('30d'));
    expect(screen.getByRole('button', { name: '30 ngày qua' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Tháng này' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('button', { name: /^(7|90) ngày$/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Tháng này' }));
    await waitFor(() => expect(mockGetOverview).toHaveBeenLastCalledWith('month'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tháng này' }).getAttribute('aria-pressed')).toBe('true'));
  });
});

describe('AdminAiUsagePage - co gia do khi model chua co gia', () => {
  it('co model thieu gia: banner DO (role=alert) noi ty le chi phi va ten model', async () => {
    renderOverview({
      pricingWarning: {
        unpricedCostSharePct: 12.5,
        models: [{ model: 'gemini-3.5-flash', calls: 3, estimatedCostUsd: 4, costSharePct: 12.5 }],
      },
    });
    const banner = await screen.findByRole('alert');
    expect(banner.textContent).toContain('12,5% chi phí đang tính theo giá tạm vì gemini-3.5-flash chưa có giá');
    expect(banner.className).toContain('bg-red-50');
    expect(banner.className).not.toContain('amber');
  });

  it('dong cu khong ghi model hien la "Khong ro model" trong banner', async () => {
    renderOverview({
      pricingWarning: { unpricedCostSharePct: 5.3, models: [{ model: '_unknown', calls: 1, estimatedCostUsd: 0.3, costSharePct: 5.3 }] },
    });
    const banner = await screen.findByRole('alert');
    expect(banner.textContent).toContain('vì Không rõ model chưa có giá');
  });

  it('du gia (pricingWarning = null): khong co banner nao', async () => {
    renderOverview();
    await screen.findByText('Chi phí AI');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('AdminAiUsagePage - bang theo tinh nang (ten tieng Viet)', () => {
  it('ten nhom bang tieng Viet, khong hien ma dev; nap tai lieu co chi phi nhung khong co luot', async () => {
    renderOverview({
      byFeature: [
        { group: 'chatbot', features: ['chatbot_reply'], calls: 10, countsAsCall: true, estimatedCostVnd: 792000, costPerCallVnd: 79200 },
        { group: 'embedding', features: ['embedding_rag_query'], calls: 100, countsAsCall: false, estimatedCostVnd: 14400, costPerCallVnd: null },
      ],
    });
    const chatbotRow = (await screen.findByText('Chatbot trả lời khách')).closest('tr');
    expect(within(chatbotRow).getByText('10')).toBeTruthy();
    expect(within(chatbotRow).getByText('792.000đ')).toBeTruthy();
    expect(within(chatbotRow).getByText('79.200đ')).toBeTruthy();
    expect(screen.queryByText(/chatbot_reply|chatbot reply/)).toBeNull();

    const embeddingRow = screen.getByText('Nạp tài liệu (không tính lượt)').closest('tr');
    expect(within(embeddingRow).getByText('14.400đ')).toBeTruthy();
    expect(within(embeddingRow).getAllByText('—')).toHaveLength(2); // khong co so luot, khong co chi phi/luot
  });

  // PR-12: chat tu van trang chu (khach vang lai, id_user NULL) la nhom rieng, dat ten tieng Viet, co luot + chi phi/luot.
  it('nhom "hero" (chat tu van trang chu) hien ten tieng Viet, khong hien ma dev / khoa i18n tho', async () => {
    renderOverview({
      byFeature: [
        { group: 'hero', features: ['hero_consultation'], calls: 30, countsAsCall: true, estimatedCostVnd: 30000, costPerCallVnd: 1000 },
      ],
    });
    const heroRow = (await screen.findByText('Chat tư vấn trang chủ')).closest('tr');
    expect(within(heroRow).getByText('30')).toBeTruthy();
    expect(within(heroRow).getByText('30.000đ')).toBeTruthy();
    expect(within(heroRow).getByText('1.000đ')).toBeTruthy();
    expect(screen.queryByText(/hero_consultation|adminAiUsage\.group/)).toBeNull();
  });
});

describe('AdminAiUsagePage - cot "Neu dung het han muc" theo goi', () => {
  it('goi co chi phi > gia goi: to do + "Lo neu dung het"; goi duoi gia: khong to do; goi khong gioi han: khong tinh duoc', async () => {
    renderOverview({
      byPlan: [
        plan({
          planId: 1, planCode: 'a', planName: 'Goi A', aiCreditsPerPeriod: 100, planPriceVnd: 900000,
          fullQuotaCostVnd: 1800000, fullQuotaCostVsPricePct: 200,
        }),
        plan({
          planId: 2, planCode: 'b', planName: 'Goi B', aiCreditsPerPeriod: 100, planPriceVnd: 900000,
          fullQuotaCostVnd: 540000, fullQuotaCostVsPricePct: 60,
        }),
        plan({
          planId: 3, planCode: 'u', planName: 'Goi U', aiCreditsPerPeriod: null, quotaUsagePctAtP90: null,
          planPriceVnd: 5000000, fullQuotaCostVnd: null, fullQuotaCostVsPricePct: null, usersNearLimit: 0,
        }),
        plan({
          planId: 4, planCode: 'free', planName: 'Dung thu', aiCreditsPerPeriod: 10, planPriceVnd: 0,
          fullQuotaCostVnd: 180000, fullQuotaCostVsPricePct: null,
        }),
      ],
    });
    const cellA = await screen.findByTestId('full-quota-a');
    expect(within(cellA).getByText('≈ 1.800.000đ').className).toContain('text-red-600');
    expect(within(cellA).getByText(/200% giá gói · Lỗ nếu dùng hết/)).toBeTruthy();

    const cellB = screen.getByTestId('full-quota-b');
    expect(within(cellB).getByText('≈ 540.000đ').className).not.toContain('text-red-600');
    expect(within(cellB).getByText('60% giá gói')).toBeTruthy();
    expect(within(cellB).queryByText(/Lỗ nếu dùng hết/)).toBeNull();

    expect(within(screen.getByTestId('full-quota-u')).getByText(/Không tính được/)).toBeTruthy();

    // goi 0d: co chi phi, khong co ti le, hien "Mien phi" o cot gia goi
    const freeRow = screen.getByTestId('full-quota-free').closest('tr');
    expect(within(freeRow).getByText('Miễn phí')).toBeTruthy();
    expect(within(freeRow).getByText('≈ 180.000đ')).toBeTruthy();
    expect(within(freeRow).queryByText(/giá gói/)).toBeNull();
  });

  it('ranh gioi lo: dung 100% gia goi chua phai lo (khong to do), 100,1% moi lo', async () => {
    renderOverview({
      byPlan: [
        plan({ planId: 1, planCode: 'eq', planPriceVnd: 900000, fullQuotaCostVnd: 900000, fullQuotaCostVsPricePct: 100 }),
        plan({ planId: 2, planCode: 'over', planPriceVnd: 900000, fullQuotaCostVnd: 900900, fullQuotaCostVsPricePct: 100.1 }),
      ],
    });
    const equal = await screen.findByTestId('full-quota-eq');
    expect(within(equal).getByText('≈ 900.000đ').className).not.toContain('text-red-600');
    expect(within(equal).queryByText(/Lỗ nếu dùng hết/)).toBeNull();
    const over = screen.getByTestId('full-quota-over');
    expect(within(over).getByText('≈ 900.900đ').className).toContain('text-red-600');
    expect(within(over).getByText(/100,1% giá gói · Lỗ nếu dùng hết/)).toBeTruthy();
  });

  it('cot gia goi hien VND', async () => {
    renderOverview({
      byPlan: [plan({ planCode: 'a', planPriceVnd: 900000, fullQuotaCostVnd: 100, fullQuotaCostVsPricePct: 0.1 })],
    });
    const row = (await screen.findByTestId('full-quota-a')).closest('tr');
    expect(within(row).getByText('900.000đ')).toBeTruthy();
  });
});

describe('AdminAiUsagePage - Chi tiet ky thuat gap mac dinh', () => {
  const technicalData = {
    byModel: [
      {
        model: 'gemini-3.5-flash', calls: 15, totalTokens: 14200000, promptTokens: 12000000, outputTokens: 1100000,
        thoughtsTokens: 1100000, estimatedCostVnd: 912600, priceConfigured: true,
      },
      {
        model: 'gemini-9.9-flash', calls: 5, totalTokens: 100000, promptTokens: 90000, outputTokens: 5000,
        thoughtsTokens: 5000, estimatedCostVnd: 5400, priceConfigured: false,
      },
    ],
    topUsers: [{
      userId: 7, email: 'khach@example.com', planCode: 'basic', promptTokens: 1, outputTokens: 2, totalTokens: 3, estimatedCostVnd: 10,
    }],
  };

  it('mac dinh KHONG hien token, bang theo model, top user; nut co aria-expanded=false', async () => {
    renderOverview(technicalData);
    const toggle = await screen.findByRole('button', { name: /Chi tiết kỹ thuật/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Theo model')).toBeNull();
    expect(screen.queryByText('Suy nghĩ')).toBeNull();
    expect(screen.queryByText('gemini-3.5-flash')).toBeNull();
    expect(screen.queryByText('khach@example.com')).toBeNull();
    expect(screen.queryByText('Tổng token')).toBeNull();
  });

  it('bam mo: token (prompt/output/suy nghi), bang theo model kem nhan "Gia tam", top user; bam lai thi gap', async () => {
    renderOverview(technicalData);
    const toggle = await screen.findByRole('button', { name: /Chi tiết kỹ thuật/ });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    expect(screen.getByText('Theo model')).toBeTruthy();
    expect(screen.getByText('Suy nghĩ')).toBeTruthy();
    expect(screen.getByText('18.300.000')).toBeTruthy(); // tong token
    const unpricedRow = screen.getByText('gemini-9.9-flash').closest('tr');
    expect(within(unpricedRow).getByText('Giá tạm')).toBeTruthy();
    const pricedRow = screen.getByText('gemini-3.5-flash').closest('tr');
    expect(within(pricedRow).queryByText('Giá tạm')).toBeNull();
    expect(within(pricedRow).getByText('12.000.000 / 1.100.000 / 1.100.000')).toBeTruthy();
    expect(screen.getByText('khach@example.com')).toBeTruthy();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Theo model')).toBeNull();
  });
});
