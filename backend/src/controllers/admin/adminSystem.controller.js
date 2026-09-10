import * as systemMonitorService from '../../services/admin/systemMonitor.service.js';
import { getShadowMismatchMetrics } from '../../services/quota/sendQuotaReservation.service.js';

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

/**
 * Số liệu đối chiếu chế độ shadow của hạn mức gửi.
 *
 * Vì sao cần endpoint này: bộ đếm nằm trong bộ nhớ tiến trình và mốc lệch chỉ được ghi bằng
 * `console.warn`. Trước đây muốn đọc phải `docker logs | grep`, và cách đó đã hỏng hai lần —
 * `console.warn` ra stderr nên thiếu `2>&1` là grep không bao giờ khớp, còn container thì
 * được tạo mới mỗi lần deploy nên log cũ biến mất. Cả hai lần đều trả "0" trông như bằng
 * chứng tốt, trong khi thật ra là phép đo rỗng.
 *
 * `processStartedAt` là phần bắt buộc đọc kèm: `total` chỉ có nghĩa khi biết nó đếm từ lúc nào.
 * Một `mismatches: 0` trên `total: 0` không nói lên điều gì cả.
 */
export async function sendQuotaShadow(_req, res) {
  try {
    const uptimeSeconds = Math.floor(process.uptime());
    res.json({
      success: true,
      data: {
        mode: process.env.SEND_QUOTA_RESERVATION_MODE || 'off',
        sources:
          process.env.SEND_QUOTA_RESERVATION_SOURCES
          || process.env.SEND_QUOTA_RESERVATION_ALLOWLIST
          || null,
        metrics: getShadowMismatchMetrics(),
        processStartedAt: new Date(Date.now() - uptimeSeconds * 1000).toISOString(),
        uptimeSeconds,
      },
    });
  } catch (err) {
    handleError(res, err);
  }
}
