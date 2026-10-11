import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import Customers from '../Customers';

const mockT = vi.hoisted(() => (key) => key);
const mockCtx = vi.hoisted(() => ({ t: null }));
vi.mock('../../../i18n', () => ({ useI18n: () => mockCtx }));
mockCtx.t = mockT;

vi.mock('../../../features/customers/components/AllCustomersTab', () => ({
  default: () => <div data-testid="tab-all" />,
}));
vi.mock('../../../features/customers/components/CampaignListTab', () => ({
  default: () => <div data-testid="tab-campaigns" />,
}));

const Probe = () => <div data-testid="search">{useLocation().search}</div>;
const renderAt = (entry) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Probe />
      <Customers />
    </MemoryRouter>
  );

describe('Customers — hai tab, tab nằm trên URL', () => {
  it('mặc định mở "Tất cả khách"', () => {
    renderAt('/app/customers');
    expect(screen.getByTestId('tab-all')).toBeTruthy();
    expect(screen.queryByTestId('tab-campaigns')).toBeNull();
  });

  it('?tab=campaigns mở "Theo chiến dịch"; giá trị lạ rơi về "Tất cả khách"', () => {
    renderAt('/app/customers?tab=campaigns');
    expect(screen.getByTestId('tab-campaigns')).toBeTruthy();
    renderAt('/app/customers?tab=bậy');
    expect(screen.getAllByTestId('tab-all').length).toBe(1);
  });

  it('bấm tab ghi lên URL; về "Tất cả khách" thì xoá tham số', () => {
    renderAt('/app/customers');
    fireEvent.click(screen.getByText('customers.tabs.campaigns'));
    expect(screen.getByTestId('search').textContent).toBe('?tab=campaigns');
    expect(screen.getByTestId('tab-campaigns')).toBeTruthy();
    fireEvent.click(screen.getByText('customers.tabs.all'));
    expect(screen.getByTestId('search').textContent).toBe('');
    expect(screen.getByTestId('tab-all')).toBeTruthy();
  });
});
