import * as deliveryMonitorService from '../../services/admin/deliveryMonitor.service.js';

const handleError = (res, err) => {
  res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi server' });
};

const isTruthyFlag = (value) => ['1', 'true'].includes(String(value ?? '').trim().toLowerCase());

/**
 * Query: `window` = today | 7d | 30d (mặc định today; giá trị khác → 400), `includeInternal` = 1 | true để gồm cả tài
 * khoản nội bộ, `ownerId` = lọc một chủ tài khoản. `?windowDays=` của trang cũ bị bỏ qua.
 */
export async function overview(req, res) {
  try {
    const data = await deliveryMonitorService.getDeliveryMonitorOverview({
      window: req.query.window,
      includeInternal: isTruthyFlag(req.query.includeInternal),
      ownerId: req.query.ownerId,
    });
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
}
