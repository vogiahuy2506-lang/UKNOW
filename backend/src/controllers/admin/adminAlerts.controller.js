import {
  evaluateAllAlerts,
  getAlertsOverview,
  updateAlertRule,
  resolveAlertEvent,
} from '../../services/admin/alertEvaluator.service.js';
import * as cronJobRunRepository from '../../repositories/admin/cronJobRun.repository.js';

export async function overview(req, res) {
  try {
    const data = await getAlertsOverview();
    return res.json({ success: true, data });
  } catch (err) {
    console.error('[adminAlerts] overview:', err);
    return res.status(500).json({ success: false, message: err.message || 'Lỗi tải cảnh báo' });
  }
}

export async function updateRule(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, message: 'ID không hợp lệ' });
    }
    const data = await updateAlertRule(id, req.body || {});
    if (!data) return res.status(404).json({ success: false, message: 'Không tìm thấy quy tắc' });
    return res.json({ success: true, data });
  } catch (err) {
    console.error('[adminAlerts] updateRule:', err);
    return res.status(500).json({ success: false, message: err.message || 'Lỗi cập nhật quy tắc' });
  }
}

export async function resolveEvent(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, message: 'ID không hợp lệ' });
    }
    const data = await resolveAlertEvent(id, req.user.id);
    if (!data) return res.status(404).json({ success: false, message: 'Không tìm thấy sự kiện' });
    return res.json({ success: true, data });
  } catch (err) {
    console.error('[adminAlerts] resolveEvent:', err);
    return res.status(500).json({ success: false, message: err.message || 'Lỗi đánh dấu đã xử lý' });
  }
}

export async function runEvaluate(req, res) {
  try {
    const results = await evaluateAllAlerts();
    return res.json({ success: true, data: { results } });
  } catch (err) {
    console.error('[adminAlerts] runEvaluate:', err);
    return res.status(500).json({ success: false, message: err.message || 'Lỗi chạy đánh giá' });
  }
}

export async function cronStatus(req, res) {
  try {
    const [latest, recent] = await Promise.all([
      cronJobRunRepository.listLatestByJob(),
      cronJobRunRepository.listRecent({
        jobCode: req.query.jobCode || null,
        limit: Math.min(100, Number(req.query.limit) || 50),
      }),
    ]);
    return res.json({ success: true, data: { latest, recent } });
  } catch (err) {
    console.error('[adminAlerts] cronStatus:', err);
    return res.status(500).json({ success: false, message: err.message || 'Lỗi tải trạng thái cron' });
  }
}
