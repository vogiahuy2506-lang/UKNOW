import { DEFAULT_AI_MODEL, normalizeModelId } from '../../utils/aiModelTier.util.js';
import { capabilityScore } from '../../utils/aiModelMetadata.util.js';
import { getCatalog } from './aiModelCatalog.service.js';

/**
 * Chính sách model AI: TOÀN HỆ THỐNG dùng đúng 1 model do super admin chọn
 * (model duy nhất đang bật trong catalog — xem setSystemModel).
 * User không thấy và không chọn được model; gói dịch vụ không còn gate model.
 * Nếu catalog lỡ bật nhiều model, lấy model có capability cao nhất.
 */

function sortByCapability(rows = []) {
  return [...rows].sort((a, b) => {
    const diff = capabilityScore(a) - capabilityScore(b);
    if (diff !== 0) return diff;
    return String(a.modelId).localeCompare(String(b.modelId));
  });
}

async function getSystemModelRow() {
  const enabledCatalog = await getCatalog({ enabledOnly: true });
  const sorted = sortByCapability(enabledCatalog);
  return sorted[sorted.length - 1] || null;
}

/**
 * Model hệ thống hiện tại.
 * @returns {Promise<string>}
 */
export async function getSystemModel() {
  const row = await getSystemModelRow();
  return row?.modelId || DEFAULT_AI_MODEL;
}

/**
 * Giữ signature cũ cho các caller — luôn trả model hệ thống.
 * @param {number|string|null|undefined} _userId
 * @returns {Promise<string>}
 */
export async function getUserMaxAllowedModel(_userId) {
  return getSystemModel();
}

/**
 * Giữ signature cũ — model lưu trong DB/request bị bỏ qua, luôn dùng model hệ thống.
 * @param {number|string|null|undefined} _userId
 * @param {string|null|undefined} _requestedModel
 * @returns {Promise<string>}
 */
export async function resolveAllowedModel(_userId, _requestedModel = null) {
  return getSystemModel();
}

/**
 * Giữ contract cũ của GET /ai/allowed-models cho client cũ chưa deploy lại:
 * danh sách chỉ còn đúng 1 model hệ thống.
 * @param {number|string|null|undefined} _userId
 */
export async function getAllowedModelsForUser(_userId) {
  const row = await getSystemModelRow();
  const systemModel = row?.modelId || DEFAULT_AI_MODEL;
  const models = row
    ? [{
      model_id: row.modelId,
      modelId: row.modelId,
      display_name: row.displayName,
      displayName: row.displayName,
      input_token_limit: row.inputTokenLimit,
      inputTokenLimit: row.inputTokenLimit,
      output_token_limit: row.outputTokenLimit,
      outputTokenLimit: row.outputTokenLimit,
      description: row.description,
      thinking: row.thinking,
    }]
    : [{ model_id: systemModel, modelId: systemModel, display_name: systemModel, displayName: systemModel }];
  return {
    maxModel: systemModel,
    models,
    modelIds: [systemModel],
    preferredModel: systemModel,
  };
}

/**
 * Endpoint PUT /ai/preferred-model còn tồn tại cho client cũ — giờ là no-op:
 * user không chọn model nữa, luôn trả model hệ thống, không ghi DB, không lỗi.
 * @param {number|string|null|undefined} _userId
 * @param {string|null|undefined} _modelId
 */
export async function savePreferredModelForUser(_userId, _modelId) {
  void normalizeModelId(_modelId); // giữ validate nhẹ để không phá client cũ gửi giá trị lạ
  const systemModel = await getSystemModel();
  return { preferredModel: systemModel };
}
