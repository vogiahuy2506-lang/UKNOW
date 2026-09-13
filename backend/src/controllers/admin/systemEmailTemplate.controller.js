import {
  getSystemEmailTemplate,
  previewSystemEmailTemplate,
  resetSystemEmailTemplate,
  updateSystemEmailTemplate,
  SYSTEM_EMAIL_TEMPLATE_VARIABLES,
} from '../../services/email/welcomeEmailTemplate.service.js';

function handleError(res, error) {
  if (error?.status) {
    return res.status(error.status).json({ success: false, message: error.message });
  }
  console.error('[systemEmailTemplate] request failed:', error);
  return res.status(500).json({
    success: false,
    message: error?.code === '42P01'
      ? 'Database chưa cập nhật migration email hệ thống'
      : 'Không thể xử lý mẫu email hệ thống',
  });
}

// PR-2b (13/09/2026) — templateKey đến từ :templateKey của route, đã được whitelist bởi
// param('templateKey').isIn(SYSTEM_EMAIL_TEMPLATE_KEYS) + handleValidationErrors (400) trước khi
// tới đây (xem adminSystemEmailTemplate.routes.js) — controller không cần validate lại.
export async function getTemplate(req, res) {
  try {
    const { templateKey } = req.params;
    const data = await getSystemEmailTemplate(templateKey);
    return res.json({
      success: true,
      data: { ...data, variables: SYSTEM_EMAIL_TEMPLATE_VARIABLES[templateKey] || [] },
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateTemplate(req, res) {
  try {
    const { templateKey } = req.params;
    const data = await updateSystemEmailTemplate(templateKey, req.body, req.user.id);
    return res.json({ success: true, data, message: 'Đã lưu mẫu email' });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function resetTemplate(req, res) {
  try {
    const { templateKey } = req.params;
    const data = await resetSystemEmailTemplate(templateKey);
    return res.json({ success: true, data, message: 'Đã khôi phục mẫu email mặc định' });
  } catch (error) {
    return handleError(res, error);
  }
}

export function previewTemplate(req, res) {
  try {
    const { templateKey } = req.params;
    const data = previewSystemEmailTemplate(templateKey, req.body);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
}
