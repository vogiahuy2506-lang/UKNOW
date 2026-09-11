import {
  getSuperAdminMenuLayout,
  updateSuperAdminMenuLayout,
} from '../../services/admin/adminMenu.service.js';

function handleError(res, error) {
  if (error?.status) {
    return res.status(error.status).json({ success: false, message: error.message });
  }
  console.error('[adminMenu] request failed:', error);
  return res.status(500).json({
    success: false,
    message: error?.code === '42P01'
      ? 'Database chưa cập nhật migration menu chuyên mục'
      : 'Không thể xử lý cấu hình menu',
  });
}

export async function getLayout(_req, res) {
  try {
    const data = await getSuperAdminMenuLayout();
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateLayout(req, res) {
  try {
    const data = await updateSuperAdminMenuLayout(req.body?.categories, req.user.id);
    return res.json({ success: true, data, message: 'Đã lưu bố cục menu quản trị' });
  } catch (error) {
    return handleError(res, error);
  }
}
