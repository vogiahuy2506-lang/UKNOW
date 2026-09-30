import { getFunnelOverview } from '../../services/admin/adminFunnel.service.js';

/** GET /api/admin/funnel/overview?since=YYYY-MM-DD — phễu theo cohort tháng đăng ký, chỉ tính khách (PR-9). */
export async function overview(req, res) {
  try {
    const since = req.query.since || undefined;
    const data = await getFunnelOverview({ since });
    return res.json({ success: true, data });
  } catch (err) {
    if (err?.status) return res.status(err.status).json({ success: false, message: err.message });
    console.error('[adminFunnel] overview:', err);
    return res.status(500).json({ success: false, message: 'Lỗi tải phễu' });
  }
}
