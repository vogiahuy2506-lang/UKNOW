import * as aiUsageService from '../../services/admin/aiUsage.service.js';
import { getAiErrorSummary } from '../../services/ai/aiCallEvents.service.js';

const handleError = (res, err) => {
  res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi server' });
};

/** GET /admin/ai-usage/errors — ô "Lỗi AI 24 giờ": N lỗi / M lần gọi Gemini thật (đọc ai_call_events). */
export async function errors(_req, res) {
  try {
    const data = await getAiErrorSummary({ hours: 24 });
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
}

export async function overview(req, res) {
  try {
    const data = await aiUsageService.getAiUsageOverview({
      range: req.query.range,
    });
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
}
