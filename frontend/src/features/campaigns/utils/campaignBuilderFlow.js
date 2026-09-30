const EMAIL_ACTION_TYPES = ['send_email'];
const ZALO_PERSONAL_ACTION_TYPES = ['send_zalo_personal', 'send_zalo_friend_request'];
const ZALO_GROUP_ACTION_TYPES = ['send_zalo_group'];
const TELEGRAM_ACTION_TYPES = ['send_telegram'];
const WHATSAPP_ACTION_TYPES = ['send_whatsapp'];

const COMMON_DATA_NODE_TYPES = ['read_sheet', 'read_courses_db', 'read_products_db', 'read_interested_customers', 'read_landing_leads', 'read_form_submissions', 'save_customer'];
const ZALO_ACCOUNT_NODE_TYPE = 'select_zalo_account';
const ZALO_PERSONAL_DATA_NODE_TYPES = ['get_all_friends'];
const ZALO_GROUP_DATA_NODE_TYPES = ['get_all_groups'];
const ZALO_GROUP_COMMON_DATA_NODE_TYPES = ['read_sheet', 'read_courses_db', 'read_products_db', 'read_landing_leads', 'read_form_submissions', 'save_customer'];

// Logic nodes (điều kiện, gắn tag, cập nhật thuộc tính) khả dụng cho mọi loại
// chiến dịch — không bị giới hạn theo email/zalo/zalo_group.
const LOGIC_NODE_TYPES = ['condition', 'tag_contact', 'update_attribute'];

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
  if (normalized === 'telegram') {
    return 'telegram';
  }
  if (normalized === 'telegram_group') {
    return 'telegram_group';
  }
  if (normalized === 'whatsapp') {
    return 'whatsapp';
  }
  return normalized;
};

/**
 * Trả về danh sách action node hợp lệ theo loại chiến dịch.
 *
 * @param {string} campaignType loại chiến dịch hiện tại
 * @param {object} [options]
 * @param {boolean} [options.telegramEnabled] PLAN_PR7_NODE_TELEGRAM_TRINH_DUNG_2026-09-28 Việc 4 —
 *   mặc định false (an toàn: caller nào chưa cập nhật vẫn loại send_telegram như trước). Chỉ áp
 *   dụng cho campaign_type 'telegram' (chỉ khối Telegram) và 'mixed' (chiến dịch cũ tạo 28–29/09).
 * @param {boolean} [options.whatsappEnabled] PLAN_WHATSAPP_DAY_DU_2026-09-29 PR-W4b — mặc định false;
 *   loại 'whatsapp' chỉ có khối send_whatsapp khi bật (tắt -> rỗng); 'mixed' thêm send_whatsapp khi bật.
 * @param {boolean} [options.zaloEnabled] P12 (PLAN_TG_WA_DAY_DU mục 19) — mặc định TRUE (caller cũ không đổi hành vi);
 *   false khi gói của chủ workspace không có kênh Zalo: các khối send_zalo_* bị loại khỏi palette ('zalo'/'zalo_group' -> rỗng).
 * @returns {Set<string>} tập node action được phép hiển thị
 */
export const getAllowedActionNodeTypesByCampaignType = (
  campaignType,
  { telegramEnabled = false, whatsappEnabled = false, zaloEnabled = true } = {}
) => {
  const normalizedType = normalizeCampaignType(campaignType);
  if (normalizedType === 'email') return new Set(EMAIL_ACTION_TYPES);
  if (normalizedType === 'zalo') return new Set(zaloEnabled ? ZALO_PERSONAL_ACTION_TYPES : []);
  if (normalizedType === 'zalo_group') return new Set(zaloEnabled ? ZALO_GROUP_ACTION_TYPES : []);
  // PR-E1: loại 'telegram' chỉ có khối gửi Telegram (khi cờ bật); cờ tắt -> rỗng.
  // PR-E2: 'telegram_group' cùng khối gửi Telegram (nguồn người nhận mặc định = nhóm đã chọn).
  if (normalizedType === 'telegram' || normalizedType === 'telegram_group') {
    return new Set(telegramEnabled ? TELEGRAM_ACTION_TYPES : []);
  }
  if (normalizedType === 'whatsapp') {
    return new Set(whatsappEnabled ? WHATSAPP_ACTION_TYPES : []);
  }
  return new Set([
    ...EMAIL_ACTION_TYPES,
    ...(zaloEnabled ? ZALO_PERSONAL_ACTION_TYPES : []),
    ...(zaloEnabled ? ZALO_GROUP_ACTION_TYPES : []),
    ...(telegramEnabled ? TELEGRAM_ACTION_TYPES : []),
    ...(whatsappEnabled ? WHATSAPP_ACTION_TYPES : []),
  ]);
};

/**
 * Trả về danh sách data node hợp lệ theo loại chiến dịch.
 *
 * @param {string} campaignType loại chiến dịch hiện tại
 * @returns {Set<string>|null} tập node data được phép; null nghĩa là không giới hạn
 */
export const getAllowedDataNodeTypesByCampaignType = (campaignType) => {
  const normalizedType = normalizeCampaignType(campaignType);
  // 'whatsapp': WhatsApp gửi được số lạ (khác Telegram) -> dùng khối dữ liệu chung như email, nguồn 'node' dùng được.
  if (normalizedType === 'email' || normalizedType === 'whatsapp') return new Set(COMMON_DATA_NODE_TYPES);
  if (normalizedType === 'zalo') {
    return new Set([...COMMON_DATA_NODE_TYPES, ZALO_ACCOUNT_NODE_TYPE, ...ZALO_PERSONAL_DATA_NODE_TYPES]);
  }
  if (normalizedType === 'zalo_group') {
    return new Set([...ZALO_GROUP_COMMON_DATA_NODE_TYPES, ZALO_ACCOUNT_NODE_TYPE, ...ZALO_GROUP_DATA_NODE_TYPES]);
  }
  // PR-E1: khối Telegram tự lấy người nhận (hội thoại / nhập chat id), không đọc khối dữ liệu
  // (plan PR-7 cấm nguồn 'node') -> tập rỗng: ẩn/chặn mọi khối dữ liệu + khối Zalo.
  if (normalizedType === 'telegram' || normalizedType === 'telegram_group') return new Set();
  return null;
};

export const isTriggerNodeType = (nodeType) => {
  const value = nodeType || '';
  return value === 'manual_trigger' || value.includes('trigger') || value === 'start';
};

/**
 * Logic node (điều kiện, gắn tag, cập nhật thuộc tính) — luôn được phép, không phụ
 * thuộc loại chiến dịch.
 *
 * @param {string} nodeType
 * @returns {boolean}
 */
export const isLogicNodeType = (nodeType) => LOGIC_NODE_TYPES.includes(String(nodeType || ''));

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
