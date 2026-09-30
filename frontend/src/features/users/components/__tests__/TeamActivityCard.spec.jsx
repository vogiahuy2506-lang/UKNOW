/**
 * PR-7 (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30) — khối "Hoạt động nhóm": bảng 5 cột, dòng "Bạn" và "Cả công ty",
 * không còn dòng vàng kỹ thuật / nhãn chữ cứng. Từ điển vi THẬT.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('../../../../i18n', async () => (await import('../../../../test/realI18n.js')).realI18nModule());

import TeamActivityCard from '../TeamActivityCard';

const person = (overrides = {}) => ({
  id: 12,
  username: 'nv01',
  fullName: 'Nhân Viên Một',
  status: 'active',
  runningCampaigns: 2,
  waitingCampaigns: 1,
  sentThisMonth: 1234,
  failedThisMonth: 12,
  aiCreditsUsed: 35,
  aiCreditsLimit: 100,
  lastActiveAt: '2026-09-15T11:00:00.000Z',
  ...overrides,
});

const overview = (overrides = {}) => ({
  period: { fromDate: '2026-09-01', toDate: '2026-09-30' },
  aiCycle: { start: '2026-09-10T03:00:00.000Z', end: '2026-10-10T03:00:00.000Z' },
  owner: person({
    id: 1, username: 'chu', fullName: 'Chủ', runningCampaigns: 0, waitingCampaigns: 0, sentThisMonth: 100,
    failedThisMonth: 0, aiCreditsUsed: 8, aiCreditsLimit: null, lastActiveAt: null,
  }),
  employees: [person()],
  other: null,
  company: { sentThisMonth: 1334, failedThisMonth: 12, aiCreditsUsed: 43, aiCreditsLimit: 500 },
  ...overrides,
});

const rowTexts = (testId) => within(screen.getByTestId(testId)).getAllByRole('cell').map((cell) => cell.textContent.trim());

describe('TeamActivityCard', () => {
  it('bảng 5 cột đúng nhãn; chữ nhỏ nói rõ tháng này + kỳ AI + làm mới ngày dd/MM', () => {
    render(<TeamActivityCard overview={overview()} loading={false} />);
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Nhân viên', 'Chiến dịch đang chạy', 'Tin đã gửi tháng này', 'Lượt AI kỳ này', 'Hoạt động gần nhất',
    ]);
    expect(screen.getByText('Tháng này · lượt AI tính theo kỳ gói (làm mới ngày 10/10)')).toBeTruthy();
    expect(screen.getByText('Không gồm lời mời kết bạn Zalo và tin gửi nhanh.')).toBeTruthy();
  });

  it('thứ tự dòng: "Bạn" → nhân viên → "Cả công ty" (dòng "Khác" chỉ có khi backend trả)', () => {
    render(<TeamActivityCard overview={overview()} loading={false} />);
    const order = screen.getAllByTestId(/^team-row-/).map((row) => row.dataset.testid);
    expect(order).toEqual(['team-row-owner', 'team-row-employee', 'team-row-company']);
    expect(screen.queryByText(/Khác \(người đã rời nhóm/)).toBeNull();
  });

  it('dòng nhân viên: "2 · 1 đang chờ", "1.234 · 12 chưa gửi được", "35 / 100", "dd/MM/yyyy HH:mm" giờ VN', () => {
    render(<TeamActivityCard overview={overview()} loading={false} />);
    const cells = rowTexts('team-row-employee');
    expect(cells[0]).toContain('Nhân Viên Một');
    expect(cells[0]).toContain('@nv01');
    expect(cells[1]).toBe('2 · 1 đang chờ');
    expect(cells[2]).toBe('1.234 · 12 chưa gửi được');
    expect(cells[3]).toBe('35 / 100');
    expect(cells[4]).toBe('15/09/2026 18:00');
  });

  it('dòng "Bạn": nhãn "Bạn", không hạn mức lượt AI → chỉ "8", chưa có hoạt động → "—"', () => {
    render(<TeamActivityCard overview={overview()} loading={false} />);
    const cells = rowTexts('team-row-owner');
    expect(cells[0]).toBe('Bạn');
    expect(cells[1]).toBe('0');
    expect(cells[2]).toBe('100');
    expect(cells[3]).toBe('8');
    expect(cells[4]).toBe('—');
  });

  it('dòng "Cả công ty" in đậm, cuối bảng, đủ tin + lượt AI của gói', () => {
    render(<TeamActivityCard overview={overview()} loading={false} />);
    const row = screen.getByTestId('team-row-company');
    expect(row.className).toMatch(/font-semibold/);
    const cells = rowTexts('team-row-company');
    expect(cells[0]).toBe('Cả công ty');
    expect(cells[2]).toBe('1.334 · 12 chưa gửi được');
    expect(cells[3]).toBe('43 / 500');
    const rows = screen.getAllByRole('row');
    expect(rows[rows.length - 1]).toBe(row);
  });

  it('dòng "Khác" hiện đúng nhãn khi backend trả, nằm ngay trên "Cả công ty"', () => {
    render(<TeamActivityCard
      overview={overview({ other: { sentThisMonth: 3, failedThisMonth: 0, aiCreditsUsed: 2 } })}
      loading={false}
    />);
    const order = screen.getAllByTestId(/^team-row-/).map((row) => row.dataset.testid);
    expect(order).toEqual(['team-row-owner', 'team-row-employee', 'team-row-other', 'team-row-company']);
    const cells = rowTexts('team-row-other');
    expect(cells[0]).toBe('Khác (người đã rời nhóm / không xác định)');
    expect(cells[2]).toBe('3');
    expect(cells[3]).toBe('2');
  });

  it('không còn dòng vàng kỹ thuật, tỉ lệ thành công, mẫu đã soạn, "Tín dụng AI" chữ cứng', () => {
    render(<TeamActivityCard overview={overview()} loading={false} />);
    expect(screen.queryByText(/triggered_by/)).toBeNull();
    expect(screen.queryByText(/Theo người tạo chiến dịch/)).toBeNull();
    expect(screen.queryByText('Tỉ lệ thành công')).toBeNull();
    expect(screen.queryByText('Mẫu đã soạn')).toBeNull();
    expect(screen.queryByText('Tín dụng AI')).toBeNull();
  });

  it('chủ chưa có gói (không có kỳ): lượt AI "—", chữ nhỏ chỉ "Tháng này"', () => {
    render(<TeamActivityCard
      overview={overview({
        aiCycle: null,
        owner: person({ id: 1, username: 'chu', aiCreditsUsed: null, aiCreditsLimit: null }),
        employees: [person({ aiCreditsUsed: null, aiCreditsLimit: null })],
        company: { sentThisMonth: 1, failedThisMonth: 0, aiCreditsUsed: null, aiCreditsLimit: null },
      })}
      loading={false}
    />);
    expect(screen.getByText('Tháng này')).toBeTruthy();
    expect(rowTexts('team-row-employee')[3]).toBe('—');
    expect(rowTexts('team-row-company')[3]).toBe('—');
  });

  it('chưa có nhân viên nào (chỉ dòng chủ) → ẩn cả khối; đang tải → hiện khung chờ', () => {
    const { container, rerender } = render(<TeamActivityCard overview={overview({ employees: [] })} loading={false} />);
    expect(container.firstChild).toBeNull();
    rerender(<TeamActivityCard overview={null} loading />);
    expect(container.querySelector('.spinner')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
