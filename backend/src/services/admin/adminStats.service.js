import {
  getKpiStats,
  getMonthlyRevenue,
  getRecentOrders,
  getRecentMembers,
} from '../../repositories/admin/adminStats.repository.js';
import { metricStuckEinvoices } from '../../repositories/admin/alert.repository.js';

/** Hoá đơn "kẹt" theo cùng ngưỡng với cảnh báo `einvoice_stuck` và trang Hoá đơn (6 giờ). */
export const STUCK_EINVOICE_STALE_HOURS = 6;

/**
 * % thay đổi so với cùng kỳ tháng trước. Kỳ trước = 0 thì KHÔNG có phần trăm hợp lệ (trả null, giao diện không hiện) —
 * bản cũ trả +100% ở mọi lần kỳ trước bằng 0.
 */
export function pctChange(curr, prev) {
  const c = Number(curr || 0);
  const p = Number(prev || 0);
  if (p === 0) return null;
  return Math.round(((c - p) / p) * 1000) / 10;
}

/**
 * Tổng quan admin: 6 số + biểu đồ 6 tháng + 2 bảng ngắn (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-9).
 * Định nghĩa "khách" / "khách trả tiền" / "đơn đã trả" nằm ở customerDefinitions.js và revenueDefinitions.js.
 */
export async function getDashboardOverview() {
  const [kpi, monthlyRevenue, recentOrders, recentMembers, stuck] = await Promise.all([
    getKpiStats(),
    getMonthlyRevenue(),
    getRecentOrders(10),
    getRecentMembers(10),
    metricStuckEinvoices(STUCK_EINVOICE_STALE_HOURS),
  ]);

  const stuckEinvoices = Number(stuck?.total || 0);
  const attention = {
    paidAfterCancelled: { count: kpi.paidAfterCancelledCount, amount: kpi.paidAfterCancelledAmount },
    stuckEinvoices,
    overdueWithdrawals: kpi.overdueWithdrawals,
    total: kpi.paidAfterCancelledCount + stuckEinvoices + kpi.overdueWithdrawals,
  };

  return {
    kpi: {
      monthKey: kpi.monthKey,
      monthLabel: kpi.monthLabel,
      todayLabel: kpi.todayLabel,
      revenueThisMonth: kpi.revenueThisMonth,
      revenueBySource: kpi.revenueBySource,
      refundedThisMonth: kpi.refundedThisMonth,
      revenueMomPct: pctChange(kpi.revenueThisMonth, kpi.revenuePrevSamePeriod),
      paidOrdersThisMonth: kpi.paidOrdersThisMonth,
      totalCustomers: kpi.totalCustomers,
      payingCustomers: kpi.payingCustomers,
      trialCustomers: kpi.trialCustomers,
      newCustomersThisMonth: kpi.newCustomersThisMonth,
      newCustomersMomPct: pctChange(kpi.newCustomersThisMonth, kpi.newCustomersPrevSamePeriod),
      expiringPaid7d: kpi.expiringPaid7d,
      attention,
    },
    monthlyRevenue,
    recentOrders,
    recentMembers,
  };
}
