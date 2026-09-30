import { render, screen, waitFor, within } from '@testing-library/react';
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
