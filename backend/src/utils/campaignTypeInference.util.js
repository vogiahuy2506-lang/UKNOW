/**
 * Suy `campaigns.campaign_type` từ sơ đồ khối khi lưu (PLAN_THU_CONG_GOP_4_KENH_2026-10-18).
 *
 * Hộp "Tạo chiến dịch mới" chỉ còn 4 kênh (Email · Zalo · Telegram · WhatsApp); Zalo cá nhân/nhóm và Telegram
 * cá nhân/nhóm là KHỐI trong cùng một bảng khối. Cột `campaign_type` vẫn giữ 7 giá trị để hạn mức theo loại,
 * nhãn danh sách và bộ lọc báo cáo đúng nghĩa, nên loại phải được suy ra từ khối gửi thật sự có trong sơ đồ.
 *
 * Chỉ động tới hai "họ": Zalo (`zalo` | `zalo_group`) và Telegram (`telegram` | `telegram_group`).
 * `email`, `whatsapp`, `mixed` (trợ lý AI, chiến dịch đa kênh cũ) giữ nguyên — không đoán.
 *
 * Quy ước:
 *  - Họ Zalo: có khối gửi cá nhân / kết bạn → `zalo`; chỉ có khối gửi nhóm → `zalo_group`; chưa có khối gửi → giữ loại cũ.
 *  - Họ Telegram: mọi khối `send_telegram` đều nguồn `telegram_groups` → `telegram_group`; còn lại → `telegram`;
 *    chưa có khối gửi → giữ loại cũ. Khối thiếu `recipientSource` hiểu theo mặc định của loại hiện tại.
 */

const ZALO_FAMILY = new Set(['zalo', 'zalo_group']);
const TELEGRAM_FAMILY = new Set(['telegram', 'telegram_group']);
const ZALO_PERSONAL_SUBTYPES = new Set(['send_zalo_personal', 'send_zalo_friend_request']);
const ZALO_GROUP_SUBTYPES = new Set(['send_zalo_group']);

const subtypeOf = (node) => String(node?.nodeSubtype ?? node?.node_subtype ?? node?.data?.nodeType ?? '').trim();

const configOf = (node) => {
  const config = node?.config ?? node?.data?.config;
  return config && typeof config === 'object' ? config : {};
};

/**
 * @param {Array<object>|undefined|null} nodes node theo hình dạng body API (nodeSubtype/config)
 * @param {string} currentType loại khai báo hoặc loại đang lưu
 * @returns {string} loại sau khi suy; không đổi khi không thuộc hai họ hoặc chưa có khối gửi
 */
export const inferCampaignTypeFromNodes = (nodes, currentType) => {
  const type = String(currentType || '').trim().toLowerCase();
  if (!Array.isArray(nodes) || nodes.length === 0) return currentType;

  if (ZALO_FAMILY.has(type)) {
    let hasPersonal = false;
    let hasGroup = false;
    for (const node of nodes) {
      const subtype = subtypeOf(node);
      if (ZALO_PERSONAL_SUBTYPES.has(subtype)) hasPersonal = true;
      else if (ZALO_GROUP_SUBTYPES.has(subtype)) hasGroup = true;
    }
    if (hasPersonal) return 'zalo';
    if (hasGroup) return 'zalo_group';
    return currentType;
  }

  if (TELEGRAM_FAMILY.has(type)) {
    const defaultSource = type === 'telegram_group' ? 'telegram_groups' : 'telegram_conversations';
    const sends = nodes.filter((node) => subtypeOf(node) === 'send_telegram');
    if (sends.length === 0) return currentType;
    const allGroups = sends.every((node) => (configOf(node).recipientSource || defaultSource) === 'telegram_groups');
    return allGroups ? 'telegram_group' : 'telegram';
  }

  return currentType;
};

/**
 * Khoá hạn mức theo loại (`RESOURCE_LIMIT_MAP`); loại không có hạn mức riêng (mixed/telegram/whatsapp) → null,
 * chỉ chịu trần `campaigns` chung.
 * @param {string} campaignType
 * @returns {'emailCampaigns'|'zaloGroupCampaigns'|'zaloCampaigns'|null}
 */
export const resolveCampaignTypeLimitKey = (campaignType) => {
  if (campaignType === 'email') return 'emailCampaigns';
  if (campaignType === 'zalo_group') return 'zaloGroupCampaigns';
  if (campaignType === 'zalo') return 'zaloCampaigns';
  return null;
};
