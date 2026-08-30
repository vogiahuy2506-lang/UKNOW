import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import PlanSection from './PlanSection';

vi.mock('./UsageBar', () => ({ default: () => null }));
vi.mock('../storage/StorageUsageSection', () => ({ default: () => null }));

const labels = {
  'accountProfileModal.free': 'Miễn phí',
  'accountProfileModal.contactForPrice': 'Liên hệ',
  'accountProfileModal.perMonth': '/tháng',
  'accountProfileModal.perYear': '/năm',
  'accountProfileModal.billingMonthly': 'Theo tháng',
  'accountProfileModal.billingYearly': 'Theo năm',
};

const t = (key) => labels[key] || key;

const baseData = {
  activePlanId: 15,
  activePlanName: 'Starter',
  activePlanCode: 'starter',
  activePlanFeatures: [],
  planMaxEmployees: null,
  subscriptionExpiresAt: null,
};

function renderPlan(data) {
  return render(
    <I18nProvider>
      <PlanSection data={{ ...baseData, ...data }} t={t} />
    </I18nProvider>,
  );
}

describe('PlanSection billing display', () => {
  it('uses yearly price and label when the active period is yearly', () => {
    renderPlan({ activeBillingPeriod: 'yearly', activePlanPriceYearly: '2870400' });

    expect(screen.getByText('2.870.400 ₫')).toBeInTheDocument();
    expect(screen.getByText('/năm')).toBeInTheDocument();
    expect(screen.getByText('Theo năm')).toBeInTheDocument();
  });

  it('renders the free label when PostgreSQL returns numeric zero as a string', () => {
    renderPlan({ activeBillingPeriod: 'monthly', activePlanPrice: '0.00' });

    expect(screen.getByText('Miễn phí')).toBeInTheDocument();
    expect(screen.queryByText('0 ₫')).not.toBeInTheDocument();
  });

  it('keeps a free yearly entitlement free when a legacy plan has no yearly price', () => {
    renderPlan({
      activeBillingPeriod: 'yearly',
      activePlanPrice: '0.00',
      activePlanPriceYearly: null,
    });

    expect(screen.getByText('Miễn phí')).toBeInTheDocument();
    expect(screen.queryByText('Liên hệ')).not.toBeInTheDocument();
    expect(screen.queryByText('/năm')).not.toBeInTheDocument();
  });
});
