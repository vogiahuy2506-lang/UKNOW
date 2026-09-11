import {
  getWelcomeEmailTemplate,
  previewWelcomeEmailTemplate,
  resetWelcomeEmailTemplate,
  updateWelcomeEmailTemplate,
  WELCOME_EMAIL_VARIABLES,
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
      : 'Không thể xử lý mẫu email chào mừng',
  });
}

export async function getWelcomeTemplate(_req, res) {
  try {
    const data = await getWelcomeEmailTemplate();
    return res.json({ success: true, data: { ...data, variables: WELCOME_EMAIL_VARIABLES } });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateWelcomeTemplate(req, res) {
  try {
    const data = await updateWelcomeEmailTemplate(req.body, req.user.id);
    return res.json({ success: true, data, message: 'Đã lưu email chào mừng' });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function resetWelcomeTemplate(_req, res) {
  try {
    const data = await resetWelcomeEmailTemplate();
    return res.json({ success: true, data, message: 'Đã khôi phục email chào mừng mặc định' });
  } catch (error) {
    return handleError(res, error);
  }
}

export function previewWelcomeTemplate(req, res) {
  try {
    const data = previewWelcomeEmailTemplate(req.body);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
}

