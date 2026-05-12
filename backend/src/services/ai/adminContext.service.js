import {
  getKpiStats,
  getMonthlyRevenue,
  getPlanDistribution,
  getExpiringSoon,
  getCampaignStats,
  getNewUsersWeekly,
} from '../../repositories/admin/adminStats.repository.js';

/**
 * Thu thập toàn bộ số liệu nền tảng real-time và format thành context string
 * để bơm vào system prompt của Gemini cho super_admin.
 *
 * @returns {Promise<string>} context block sẵn sàng chèn vào prompt
 */
export async function buildAdminContext() {
  const now = new Date().toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const [kpi, monthly, plans, expiring, campaigns, weeklyUsers] = await Promise.all([
    getKpiStats(),
    getMonthlyRevenue(),
    getPlanDistribution(),
    getExpiringSoon(7),
    getCampaignStats(),
    getNewUsersWeekly(),
  ]);

  const lines = [
    `=== DỮ LIỆU NỀN TẢNG Founder AI (cập nhật lúc ${now}) ===`,
    '',
    '## THÀNH VIÊN',
    `- Tổng user_admin: ${kpi.totalMembers}`,
    `- Đang có gói active: ${kpi.activeMembers}`,
    `- Tổng nhân viên (employee): ${kpi.totalEmployees}`,
  ];

  if (expiring.length > 0) {
    lines.push(`- Sắp hết hạn trong 7 ngày: ${expiring.length} user`);
    expiring.slice(0, 5).forEach(u => {
      lines.push(`  • ${u.fullName || u.email} (${u.planName}) — còn ${u.daysLeft} ngày`);
    });
  } else {
    lines.push('- Sắp hết hạn trong 7 ngày: không có');
  }

  lines.push('');
  lines.push('## DOANH THU THÁNG NÀY');
  lines.push(`- Doanh thu: ${Number(kpi.revenueThisMonth).toLocaleString('vi-VN')}đ`);
  lines.push(`- Đơn thành công: ${kpi.completedOrdersThisMonth}`);
  lines.push(`- Đơn chờ xử lý: ${kpi.pendingOrdersThisMonth}`);

  if (monthly.length > 0) {
    lines.push('');
    lines.push('## DOANH THU 6 THÁNG GẦN NHẤT');
    monthly.forEach(m => {
      lines.push(`- ${m.month}: ${Number(m.revenue).toLocaleString('vi-VN')}đ (${m.completedOrders}/${m.totalOrders} đơn)`);
    });
  }

  lines.push('');
  lines.push('## PHÂN BỐ GÓI DỊCH VỤ');
  plans.forEach(p => {
    lines.push(`- ${p.name} (${Number(p.price).toLocaleString('vi-VN')}đ/tháng): ${p.userCount} user`);
  });

  lines.push('');
  lines.push('## CHIẾN DỊCH');
  lines.push(`- Tổng chiến dịch toàn nền tảng: ${campaigns.totalCampaigns}`);
  lines.push(`- Đang active: ${campaigns.activeCampaigns}`);
  lines.push(`- Đã hoàn thành: ${campaigns.completedCampaigns}`);
  lines.push(`- Mới 30 ngày qua: ${campaigns.newLast30Days}`);
  lines.push(`- User đang dùng chiến dịch: ${campaigns.usersWithCampaigns}`);

  if (weeklyUsers.length > 0) {
    lines.push('');
    lines.push('## USER MỚI THEO TUẦN (4 tuần gần nhất)');
    weeklyUsers.forEach(w => {
      lines.push(`- Tuần từ ${w.week}: ${w.newUsers} user mới`);
    });
  }

  lines.push('');
  lines.push('=== HẾT DỮ LIỆU NỀN TẢNG ===');

  return lines.join('\n');
}
