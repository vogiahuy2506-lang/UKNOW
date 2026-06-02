import * as deliveryMonitorService from '../../services/admin/deliveryMonitor.service.js';

const handleError = (res, err) => {
  res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi server' });
};

export async function overview(req, res) {
  try {
    const data = await deliveryMonitorService.getDeliveryMonitorOverview({
      windowDays: req.query.windowDays,
    });
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
}
