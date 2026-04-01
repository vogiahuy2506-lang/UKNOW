const EMAIL_ACTION_TYPES = ['send_email'];
const ZALO_PERSONAL_ACTION_TYPES = ['send_zalo_personal', 'send_zalo_friend_request'];
const ZALO_GROUP_ACTION_TYPES = ['send_zalo_group'];

const COMMON_DATA_NODE_TYPES = ['read_sheet', 'read_courses_db', 'read_interested_customers', 'read_landing_leads', 'save_customer'];
const ZALO_ACCOUNT_NODE_TYPE = 'select_zalo_account';
const ZALO_PERSONAL_DATA_NODE_TYPES = ['get_all_friends'];
const ZALO_GROUP_DATA_NODE_TYPES = ['get_all_groups'];
const ZALO_GROUP_COMMON_DATA_NODE_TYPES = ['read_sheet', 'read_courses_db', 'read_landing_leads', 'save_customer'];

/**
 * Chuẩn hóa campaign type từ nhiều định dạng legacy về key nội bộ.
 *
 * @param {string} campaignType raw campaign type
 * @returns {string} normalized campaign type
 */
const normalizeCampaignType = (campaignType) => {
  const normalized = String(campaignType || '').trim().toLowerCase();
  if (normalized === 'zalo_personal' || normalized === 'zalo-individual' || normalized === 'zalo_individual') {
    return 'zalo';
  }
  if (normalized === 'zalo-group' || normalized === 'group_zalo') {
    return 'zalo_group';
  }
  return normalized;
};

/**
 * Trả về danh sách action node hợp lệ theo loại chiến dịch.
 *
 * @param {string} campaignType loại chiến dịch hiện tại
 * @returns {Set<string>} tập node action được phép hiển thị
 */
export const getAllowedActionNodeTypesByCampaignType = (campaignType) => {
  const normalizedType = normalizeCampaignType(campaignType);
  if (normalizedType === 'email') return new Set(EMAIL_ACTION_TYPES);
  if (normalizedType === 'zalo') return new Set(ZALO_PERSONAL_ACTION_TYPES);
  if (normalizedType === 'zalo_group') return new Set(ZALO_GROUP_ACTION_TYPES);
  return new Set([...EMAIL_ACTION_TYPES, ...ZALO_PERSONAL_ACTION_TYPES, ...ZALO_GROUP_ACTION_TYPES]);
};

/**
 * Trả về danh sách data node hợp lệ theo loại chiến dịch.
 *
 * @param {string} campaignType loại chiến dịch hiện tại
 * @returns {Set<string>|null} tập node data được phép; null nghĩa là không giới hạn
 */
export const getAllowedDataNodeTypesByCampaignType = (campaignType) => {
  const normalizedType = normalizeCampaignType(campaignType);
  if (normalizedType === 'email') return new Set(COMMON_DATA_NODE_TYPES);
  if (normalizedType === 'zalo') {
    return new Set([...COMMON_DATA_NODE_TYPES, ZALO_ACCOUNT_NODE_TYPE, ...ZALO_PERSONAL_DATA_NODE_TYPES]);
  }
  if (normalizedType === 'zalo_group') {
    return new Set([...ZALO_GROUP_COMMON_DATA_NODE_TYPES, ZALO_ACCOUNT_NODE_TYPE, ...ZALO_GROUP_DATA_NODE_TYPES]);
  }
  return null;
};

export const isTriggerNodeType = (nodeType) => {
  const value = nodeType || '';
  return value === 'manual_trigger' || value.includes('trigger') || value === 'start';
};

/**
 * Flow có ít nhất một node «Chọn tài khoản Zalo» bật pool đa TK (có ít nhất 1 id trong pool).
 * Dùng để ẩn / không chạy node «Lấy danh sách bạn bè» vì nguồn gửi không dùng danh sách bạn bè.
 *
 * @param {Array<{data?: {nodeType?: string, config?: object}}>} nodes danh sách node ReactFlow
 * @returns {boolean}
 */
export const campaignFlowHasZaloPoolMulti = (nodes = []) => {
  if (!Array.isArray(nodes)) return false;
  for (const n of nodes) {
    const nodeType = String(n?.data?.nodeType || n?.type || '').trim();
    if (nodeType !== ZALO_ACCOUNT_NODE_TYPE) continue;
    const cfg = n?.data?.config || {};
    if (!cfg.zaloPoolMultiAccountEnabled) continue;
    const ids = Array.isArray(cfg.zaloPoolAccountIds) ? cfg.zaloPoolAccountIds : [];
    const has = ids.map((id) => String(id || '').trim()).filter(Boolean).length > 0;
    if (has) return true;
  }
  return false;
};
