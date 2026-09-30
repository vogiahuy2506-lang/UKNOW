import * as userDeliveryMonitorService from '../services/user/userDeliveryMonitor.service.js';
import { resolveWorkspaceOwnerId } from '../services/storage/storageQuota.service.js';

const handleError = (res, err) => {
  res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi server' });
};

export async function overview(req, res) {
  try {
    // Trang chỉ trả lời "hôm nay": bộ chọn 7/30/90 ngày đã bỏ (PR-4b), `?windowDays=` gửi lên bị bỏ qua.
    const data = await userDeliveryMonitorService.getUserDeliveryMonitorOverview({
      userId: resolveWorkspaceOwnerId(req.user),
    });
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
}

export async function runFailures(req, res) {
  try {
    const data = await userDeliveryMonitorService.getRunFailures({
      userId: resolveWorkspaceOwnerId(req.user),
      runId: req.params.runId,
    });
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
}

