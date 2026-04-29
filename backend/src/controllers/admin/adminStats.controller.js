import { getDashboardOverview } from '../../services/admin/adminStats.service.js';

/** GET /api/admin/stats/overview */
export async function overview(req, res) {
  try {
    const data = await getDashboardOverview();
    return res.json({ success: true, data });
  } catch (err) {
    console.error('Admin stats error:', err);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
}
