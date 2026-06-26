import * as adminAiModelsService from '../../services/admin/adminAiModels.service.js';

function handleError(res, err) {
  if (err.status) return res.status(err.status).json({ success: false, message: err.message });
  if (err.code === '42P01' || err.code === '42703') {
    console.error('Admin AI models DB error:', err);
    return res.status(500).json({
      success: false,
      message: 'Database trên server chưa cập nhật migration AI models.',
    });
  }
  console.error('Admin AI models error:', err);
  return res.status(500).json({ success: false, message: err.message || 'Lỗi server' });
}

export async function list(_req, res) {
  try {
    const models = await adminAiModelsService.listModels();
    return res.json({ success: true, data: models });
  } catch (err) {
    return handleError(res, err);
  }
}

export async function update(req, res) {
  try {
    const model = await adminAiModelsService.updateModel(req.params.id, req.body || {});
    return res.json({ success: true, data: model, message: 'Đã cập nhật model AI' });
  } catch (err) {
    return handleError(res, err);
  }
}

export async function sync(_req, res) {
  try {
    const result = await adminAiModelsService.syncModels();
    return res.json({ success: true, data: result, message: 'Đã đồng bộ danh sách model từ Google' });
  } catch (err) {
    return handleError(res, err);
  }
}
