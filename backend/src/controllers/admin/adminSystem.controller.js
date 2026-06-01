import * as systemMonitorService from '../../services/admin/systemMonitor.service.js';

const handleError = (res, err) => {
  res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi server' });
};

export async function overview(_req, res) {
  try {
    const data = await systemMonitorService.getSystemOverview();
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
}

export async function logs(req, res) {
  try {
    const data = await systemMonitorService.getSystemLogs(req.query.service, req.query.tail);
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
}
