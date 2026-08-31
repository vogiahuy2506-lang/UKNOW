import { useQuery } from '@tanstack/react-query';
import { getPlans } from '../../services/plan.service';

export const PLANS_QUERY_KEY = ['plans', 'public'];

/**
 * React Query hook for public subscription plans.
 * Shares cached promise across all mounting components (PricingPage, PricingSection, Modals).
 */
export const usePlansQuery = (options = {}) => {
  return useQuery({
    queryKey: PLANS_QUERY_KEY,
    queryFn: async () => {
      const response = await getPlans();
      return response?.data?.plans || [];
    },
    staleTime: 60 * 1000, // 1 minute
    ...options,
  });
};

export default usePlansQuery;
