import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PricingSection from './PricingSection';
import { getActivePromotions } from '../../../services/promotion.service';


vi.mock('../../../stores/authStore', () => ({
  useAuthStore: () => ({
    isAuthenticated: false,
    user: null,
    activeContext: { type: 'self' },
  }),
}));

vi.mock('../../../i18n', () => ({
  useI18n: () => ({
    locale: 'vi',
    t: (key) => key,
  }),
}));

vi.mock('../../../components/AnimatedSection', () => ({
  default: ({ children }) => <>{children}</>,
}));

vi.mock('../../../features/billing/CustomPlanBuilder', () => ({
  default: () => null,
}));

const MOCK_PLANS = [{
  id: 1,
  code: 'starter',
  name: 'Starter',
  description: 'Starter plan',
  price: 99000,
  is_active: true,
  features: [],
}];

vi.mock('../../../hooks/queries/usePlansQuery', () => ({
  usePlansQuery: () => ({
    data: MOCK_PLANS,
    isLoading: false,
    isSuccess: true,
  }),
}));


vi.mock('../../../services/promotion.service', () => ({
  getActivePromotions: vi.fn(),
}));

vi.mock('../../../features/checkout/services/checkoutApi.service', () => ({
  default: {
    getScheduledChange: vi.fn(),
    resolvePlanChange: vi.fn(),
    activateFreePlan: vi.fn(),
  },
}));

vi.mock('../../../services/customPlan.service', () => ({
  getMyCustomPlan: vi.fn(),
}));

describe('PricingSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getActivePromotions.mockResolvedValue({ data: { data: { byPlanCode: {} } } });
  });

  it('renders the unauthenticated pricing CTA without a promotion TDZ error', async () => {
    render(
      <MemoryRouter>
        <PricingSection embedded />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'pricing.choosePlan' })).toBeInTheDocument();
    });
  });
});
