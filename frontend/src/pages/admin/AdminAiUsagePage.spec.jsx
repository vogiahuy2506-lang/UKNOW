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
});
