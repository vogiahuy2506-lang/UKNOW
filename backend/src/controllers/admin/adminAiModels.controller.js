import * as adminAiModelsService from '../../services/admin/adminAiModels.service.js';
import { logSystem, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../../services/audit.service.js';
import { getSystemAuditContext } from '../../utils/auditContext.util.js';

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
    const result = await adminAiModelsService.listModels();
    return res.json({ success: true, data: result });
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

export async function setSystemModel(req, res) {
  try {
    const catalogBefore = await adminAiModelsService.listModels();
    const previousSystemModel = catalogBefore?.models?.find((m) => m.isEnabled)?.modelId || null;

    const targetModelId = req.body?.modelId ?? req.body?.model_id;
    const result = await adminAiModelsService.chooseSystemModel(targetModelId);

    await logSystem(
      getSystemAuditContext(req),
      AUDIT_ACTIONS.AI_SYSTEM_MODEL_UPDATED,
      AUDIT_ENTITY_TYPES.AI_MODEL,
      null,
      {
        modelId: result.systemModel,
        previousModel: previousSystemModel,
        newModel: result.systemModel,
      }
    );

    return res.json({ success: true, data: result, message: 'Đã đặt model hệ thống' });
  } catch (err) {
    return handleError(res, err);
  }
}

export async function setFallbackModel(req, res) {
  try {
    const catalogBefore = await adminAiModelsService.listModels();
    const previousFallbackModel = catalogBefore?.models?.find((m) => m.isFallback)?.modelId || null;

    const rawModelId = req.body?.modelId !== undefined ? req.body?.modelId : req.body?.model_id;
    const result = await adminAiModelsService.chooseFallbackModel(rawModelId);

    await logSystem(
      getSystemAuditContext(req),
      AUDIT_ACTIONS.AI_FALLBACK_MODEL_UPDATED,
      AUDIT_ENTITY_TYPES.AI_MODEL,
      null,
      {
        modelId: result.fallbackModel,
        previousModel: previousFallbackModel,
        newModel: result.fallbackModel,
      }
    );

    return res.json({ success: true, data: result, message: 'Đã đặt model dự phòng' });
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
