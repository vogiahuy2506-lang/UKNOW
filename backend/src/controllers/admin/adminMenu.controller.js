import {
  getSuperAdminMenuLayout,
  updateSuperAdminMenuLayout,
  getAppMenuLayout,
  updateAppMenuLayout,
} from '../../services/admin/adminMenu.service.js';

function handleError(res, error) {
  if (error?.status) {
    return res.status(error.status).json({ success: false, message: error.message });
  }
  console.error('[adminMenu] request failed:', error);
  // Bảng admin_menu_layouts đã có từ migration 201, nhánh 42P01 chỉ phòng môi trường test/dev lạ.
  // Lỗi thật khi chưa chạy migration 205 là 23514 (check_violation) lúc PUT scope app_user,
  // để nguyên 500 vì quy trình deploy luôn chạy migration trước khi khởi động backend.
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

export async function getAppLayout(_req, res) {
  try {
    const data = await getAppMenuLayout();
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateAppLayout(req, res) {
  try {
    const data = await updateAppMenuLayout(req.body?.categories, req.user.id);
    return res.json({ success: true, data, message: 'Đã lưu bố cục menu ứng dụng' });
  } catch (error) {
    return handleError(res, error);
  }
}
