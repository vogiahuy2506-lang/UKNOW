import {
  getKpiStats,
  getMonthlyRevenue,
  getPlanDistribution,
  getRecentOrders,
  getRecentMembers,
} from '../../repositories/admin/adminStats.repository.js';

export async function getDashboardOverview() {
  const [kpi, monthlyRevenue, planDistribution, recentOrders, recentMembers] = await Promise.all([
    getKpiStats(),
    getMonthlyRevenue(),
    getPlanDistribution(),
    getRecentOrders(10),
    getRecentMembers(10),
  ]);

  return { kpi, monthlyRevenue, planDistribution, recentOrders, recentMembers };
}
