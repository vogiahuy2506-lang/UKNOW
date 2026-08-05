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

  const pctChange = (curr, prev) => {
    const c = Number(curr || 0);
    const p = Number(prev || 0);
    if (p === 0) return c > 0 ? 100 : 0;
    return Math.round(((c - p) / p) * 1000) / 10;
  };

  const registered = Number(kpi.registeredThisMonthForActivation || kpi.newMembersThisMonth || 0);
  const activated = Number(kpi.activatedThisMonth || 0);
  const activationRate = registered > 0 ? Math.round((activated / registered) * 1000) / 10 : null;
  const paying = Number(kpi.payingActiveMembers || 0);
  const churned = Number(kpi.churnedThisMonth || 0);
  const churnRate = paying + churned > 0
    ? Math.round((churned / (paying + churned)) * 1000) / 10
    : 0;

  return {
    kpi: {
      ...kpi,
      revenueMomPct: pctChange(kpi.revenueThisMonth, kpi.revenueLastMonth),
      newMembersMomPct: pctChange(kpi.newMembersThisMonth, kpi.newMembersLastMonth),
      activationRate,
      churnRate,
      churnedThisMonth: churned,
    },
    monthlyRevenue,
    planDistribution,
    recentOrders,
    recentMembers,
    dataSince: '2025-06-01',
    dataSinceNote: 'Một số chỉ số activation dựa trên audit_logs (từ migration 040 / PR1 attribution).',
  };
}
