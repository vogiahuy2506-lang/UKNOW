import { getFunnelOverview } from '../../services/admin/adminFunnel.service.js';

export async function overview(req, res) {
  try {
    const since = req.query.since || undefined;
    const data = await getFunnelOverview({ since });
    return res.json({ success: true, data });
  } catch (err) {
    console.error('[adminFunnel] overview:', err);
    return res.status(500).json({ success: false, message: err.message || 'Lỗi tải phễu' });
  }
}
